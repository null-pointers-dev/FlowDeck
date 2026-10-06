import { and, eq, notInArray, sql } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { db } from "@/platform/db";
import { category, docChunk, repository, workflowFamily, workflowVersion, type RepoEnvironment, type Reviewer } from "@/platform/db/schema";
import { clientFor, gh, ghAll, isGitHubError } from "@/platform/github/client";
import { config } from "@/platform/config";
import { sha256 } from "@/platform/crypto";
import { jobs } from "@/platform/jobs/client";
import type { Logger } from "@/platform/logger";
import { parseWorkflow, type ParsedWorkflow } from "../domain/parse-workflow";
import { chunkDoc, familyIdFromPath, parseDoc, parseFamilies, parseTaxonomy, type FamilyEntry, type ParsedDoc } from "../domain/doc";

const WORKFLOWS = ".github/workflows/";
const DOCS = "docs/workflows/";

type Octo = Awaited<ReturnType<typeof clientFor>>["octokit"];

async function readBlob(octokit: Octo, owner: string, repo: string, sha: string): Promise<string> {
  const { data } = await gh<{ content: string; encoding: string }>(octokit, "GET /repos/{owner}/{repo}/git/blobs/{file_sha}", { owner, repo, file_sha: sha });
  return Buffer.from(data.content, (data.encoding as BufferEncoding) || "base64").toString("utf8");
}

async function readEnvironments(octokit: Octo, owner: string, repo: string): Promise<RepoEnvironment[]> {
  try {
    const { data } = await gh<{ environments?: Array<{ id: number; name: string; protection_rules?: Array<{ type: string; reviewers?: Array<{ type: string; reviewer: { login?: string; slug?: string; name?: string } }> }> }> }>(
      octokit,
      "GET /repos/{owner}/{repo}/environments",
      { owner, repo, per_page: 100 },
    );
    return (data.environments ?? []).map((e) => {
      const rule = (e.protection_rules ?? []).find((r) => r.type === "required_reviewers");
      const reviewers: Reviewer[] = (rule?.reviewers ?? []).flatMap((r): Reviewer[] =>
        r.type === "Team" && r.reviewer.slug ? [{ type: "Team", slug: r.reviewer.slug, name: r.reviewer.name, org: owner }] : r.type === "User" && r.reviewer.login ? [{ type: "User", login: r.reviewer.login }] : [],
      );
      return { id: e.id, name: e.name, protected: !!rule, reviewers };
    });
  } catch (e) {
    if (isGitHubError(e) && (e.status === 404 || e.status === 403)) return [];
    throw e;
  }
}

/**
 * Reads the DevOps repository and brings the catalog up to date. One tree call lists every
 * file; only files whose git SHA changed are downloaded and parsed again.
 */
export async function syncCatalog(log: Logger) {
  const cfg = config.catalogRepository;
  if (!cfg) {
    log.warn({ event: "catalog.not_configured" }, "Set CATALOG_REPOSITORY to the DevOps repository");
    return;
  }
  const { octokit } = await clientFor(cfg.owner, "dispatch");
  const { owner, name } = cfg;

  const info = (await gh<{ id: number; full_name: string; default_branch: string; owner: { login: string }; name: string }>(octokit, "GET /repos/{owner}/{repo}", { owner, repo: name })).data;
  const environments = await readEnvironments(octokit, owner, name);
  const tree = (await gh<{ sha: string; tree: Array<{ path: string; type: string; sha: string }>; truncated: boolean }>(octokit, "GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
    owner,
    repo: name,
    tree_sha: info.default_branch,
    recursive: "1",
  })).data;
  if (tree.truncated) log.warn({ event: "catalog.tree_truncated" }, "Repository tree was truncated by GitHub; some files may be missing");

  const [repo] = await db
    .insert(repository)
    .values({ githubId: info.id, owner: info.owner.login, name: info.name, fullName: info.full_name, defaultBranch: info.default_branch, environments, treeSha: tree.sha, syncedAt: new Date() })
    .onConflictDoUpdate({
      target: repository.githubId,
      set: { owner: info.owner.login, name: info.name, fullName: info.full_name, defaultBranch: info.default_branch, environments, treeSha: tree.sha, syncedAt: new Date() },
    })
    .returning();

  const blobs = new Map(tree.tree.filter((t) => t.type === "blob").map((t) => [t.path, t.sha]));
  const workflowPaths = [...blobs.keys()].filter((p) => p.startsWith(WORKFLOWS) && /\.ya?ml$/i.test(p));
  const docPaths = [...blobs.keys()].filter((p) => p.startsWith(DOCS) && p.endsWith(".md"));

  // GitHub's workflow ids and enabled/disabled state, by path.
  const ghWorkflows = await ghAll<{ id: number; path: string; state: string }>(octokit, "GET /repos/{owner}/{repo}/actions/workflows", { owner, repo: name }).catch(async () => {
    const { data } = await gh<{ workflows: Array<{ id: number; path: string; state: string }> }>(octokit, "GET /repos/{owner}/{repo}/actions/workflows", { owner, repo: name, per_page: 100 });
    return data.workflows;
  });
  const ghByPath = new Map(ghWorkflows.map((w) => [w.path, w]));

  // Taxonomy
  const taxSha = blobs.get("catalog/taxonomy.yaml");
  if (taxSha) {
    const tax = parseTaxonomy(await readBlob(octokit, owner, name, taxSha));
    for (const [i, c] of tax.categories.entries()) {
      await db.insert(category).values({ key: c.key, name: c.name, parent: c.parent, position: i }).onConflictDoUpdate({ target: category.key, set: { name: c.name, parent: c.parent, position: i } });
    }
    if (tax.categories.length) await db.delete(category).where(notInArray(category.key, tax.categories.map((c) => c.key)));
  }

  // Families file (optional until the catalog agent has produced it)
  const famSha = blobs.get("catalog/families.yaml");
  const familiesFile: FamilyEntry[] = famSha ? parseFamilies(await readBlob(octokit, owner, name, famSha)) : [];

  // Existing state, to skip unchanged files
  const existingFamilies = new Map((await db.select({ id: workflowFamily.id, docSha: workflowFamily.docSha, docPath: workflowFamily.docPath }).from(workflowFamily)).map((f) => [f.id, f]));
  const existingVersions = new Map(
    (await db.select().from(workflowVersion)).map((v) => [`${v.familyId}@${v.version}`, v]),
  );

  // Docs (download only changed ones; unchanged ones are re-read from the DB fields)
  const docs = new Map<string, { parsed: ParsedDoc; path: string; sha: string; changed: boolean }>();
  for (const path of docPaths) {
    const sha = blobs.get(path)!;
    const known = [...existingFamilies.values()].find((f) => f.docPath === path);
    if (known && known.docSha === sha) {
      docs.set(known.id, { parsed: null as unknown as ParsedDoc, path, sha, changed: false });
      continue;
    }
    const parsed = parseDoc(await readBlob(octokit, owner, name, sha), familyIdFromPath(path.replace(/\.md$/, ".yml")));
    if (parsed.errors.length) log.warn({ event: "catalog.doc_problems", path, errors: parsed.errors });
    docs.set(parsed.front.id, { parsed, path, sha, changed: true });
  }

  // Which families exist: families.yaml, then docs, then one per remaining workflow file.
  type Plan = { id: string; versions: FamilyEntry["versions"]; entry?: FamilyEntry };
  const plans = new Map<string, Plan>();
  for (const f of familiesFile) plans.set(f.id, { id: f.id, versions: f.versions, entry: f });
  for (const [id, d] of docs) {
    if (plans.has(id)) continue;
    if (d.changed && d.parsed.front.versions.length) {
      plans.set(id, { id, versions: d.parsed.front.versions });
    } else if (!d.changed) {
      // Unchanged doc: its versions are already in the database.
      const known = [...existingVersions.values()]
        .filter((v) => v.familyId === id)
        .map((v) => ({ version: v.version, file: v.filePath, status: v.status, superseded_by: v.supersededBy ?? undefined }));
      if (known.length) plans.set(id, { id, versions: known });
    }
  }
  const claimed = new Set([...plans.values()].flatMap((p) => p.versions.map((v) => v.file)));
  for (const path of workflowPaths) {
    if (claimed.has(path)) continue;
    const id = familyIdFromPath(path);
    if (!plans.has(id)) plans.set(id, { id, versions: [{ version: "latest", file: path, status: "current" }] });
  }

  const seen: string[] = [];
  let changedDocs = 0;
  for (const plan of plans.values()) {
    seen.push(plan.id);
    const doc = docs.get(plan.id);
    const front = doc?.changed ? doc.parsed.front : null;

    // Parse each version's workflow file only when its blob changed.
    const versionRows: Array<typeof workflowVersion.$inferInsert> = [];
    let firstParsed: ParsedWorkflow | null = null;
    for (const v of plan.versions) {
      const sha = blobs.get(v.file);
      const prev = existingVersions.get(`${plan.id}@${v.version}`);
      const gw = ghByPath.get(v.file);
      if (!sha) {
        versionRows.push({ familyId: plan.id, version: v.version, filePath: v.file, status: v.status, supersededBy: v.superseded_by ?? null, parseError: `File ${v.file} was not found on ${info.default_branch}.` });
        continue;
      }
      if (prev && prev.blobSha === sha) {
        versionRows.push({ ...prev, status: v.status, supersededBy: v.superseded_by ?? null, githubWorkflowId: gw?.id ?? prev.githubWorkflowId, githubState: gw?.state ?? prev.githubState, updatedAt: new Date() });
        continue;
      }
      const parsed = parseWorkflow(await readBlob(octokit, owner, name, sha));
      firstParsed ??= parsed;
      versionRows.push({
        familyId: plan.id,
        version: v.version,
        filePath: v.file,
        githubWorkflowId: gw?.id ?? null,
        githubState: gw?.state ?? null,
        status: v.status,
        supersededBy: v.superseded_by ?? null,
        blobSha: sha,
        dispatchable: parsed.dispatchable,
        inputs: parsed.inputs,
        jobs: parsed.jobs,
        concurrency: parsed.concurrency,
        parseError: parsed.error ?? null,
        updatedAt: new Date(),
      });
    }

    const kind = front?.kind ?? (versionRows.some((v) => v.dispatchable) ? "entrypoint" : firstParsed?.reusable ? "reusable" : "internal");
    const familyValues = {
      id: plan.id,
      repositoryId: repo.id,
      title: front?.title ?? plan.entry?.title ?? firstParsed?.name ?? plan.id,
      summary: front?.summary ?? "",
      category: front?.category ?? plan.entry?.category ?? null,
      subcategory: front?.subcategory ?? null,
      scope: front?.scope ?? "generic",
      kind,
      owner: front?.owner ?? plan.entry?.owner ?? null,
      status: front?.status ?? "active",
      facets: front?.facets ?? {},
      tags: front?.tags ?? [],
      aliases: front?.aliases ?? [],
      approvalNote: front?.approval?.approvers ?? null,
      typicalDuration: front?.typical_duration ?? null,
      related: front?.related ?? [],
      lastReviewed: front?.last_reviewed ?? null,
      docPath: doc?.path ?? null,
      docSha: doc?.sha ?? null,
      docBody: front ? doc!.parsed.body : undefined,
      present: true,
      updatedAt: new Date(),
    };
    // Unchanged doc: keep the stored doc fields, refresh the rest.
    const { id: _id, ...updatable } = familyValues;
    const set = doc && !doc.changed
      ? { repositoryId: repo.id, kind, present: true, updatedAt: new Date() }
      : Object.fromEntries(Object.entries(updatable).filter(([, v]) => v !== undefined));
    await db.insert(workflowFamily).values({ ...familyValues, docBody: familyValues.docBody ?? null }).onConflictDoUpdate({ target: workflowFamily.id, set });

    for (const v of versionRows) {
      const { id: _vid, ...vset } = v as typeof v & { id?: string };
      await db.insert(workflowVersion).values(vset).onConflictDoUpdate({ target: [workflowVersion.familyId, workflowVersion.version], set: vset });
    }
    await db.delete(workflowVersion).where(and(eq(workflowVersion.familyId, plan.id), notInArray(workflowVersion.version, plan.versions.map((v) => v.version))));

    // Re-chunk docs that changed; embeddings are computed by a separate job.
    if (front) {
      changedDocs++;
      const chunks = chunkDoc(front.title, doc!.parsed.body);
      await db.transaction(async (tx) => {
        await tx.delete(docChunk).where(eq(docChunk.familyId, plan.id));
        for (const c of chunks) {
          await tx.insert(docChunk).values({
            familyId: plan.id,
            position: c.position,
            section: c.section,
            headingPath: c.headingPath,
            content: c.content,
            contentHash: sha256(c.content),
            contentVector: sql`to_tsvector('english', ${`${c.headingPath}\n${c.content}`})`,
          });
        }
      });
      if (chunks.length) await jobs.send("search.embed", { familyId: plan.id });
    }
  }

  await db.update(workflowFamily).set({ present: false }).where(notInArray(workflowFamily.id, seen.length ? seen : ["-"]));

  // Weighted full-text vector: title and aliases first, then summary, then category, tags and owner.
  await db.execute(sql`
    update workflow_family set search_vector =
      setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(array_to_string(array(select jsonb_array_elements_text(aliases)), ' '), '')), 'A') ||
      setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(category, '') || ' ' || coalesce(subcategory, '') || ' ' || coalesce(array_to_string(array(select jsonb_array_elements_text(tags)), ' '), '') || ' ' || coalesce(owner, '')), 'C')
    where present`);

  log.info({ event: "catalog.synced", families: seen.length, workflows: workflowPaths.length, changedDocs });
}
