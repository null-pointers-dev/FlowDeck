import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { category, repository, runRequest, user, workflowFamily, workflowRun, workflowVersion } from "@/platform/db/schema";
import { allowedEnvironments, can, canRunAnywhere, type Actor } from "@/features/access/domain/permissions";
import { listSavedInputs } from "@/features/personal/server/service";
import { describeReviewers, resolveRule } from "@/features/approvals/domain/eligibility";
import { loadApprovalContext } from "@/features/approvals/server/context";

export async function listCategories() {
  return db.select().from(category).orderBy(asc(category.position));
}

/** Everything the workflow page needs, for one family and one version. */
export async function getWorkflowPage(actor: Actor, familyId: string, versionParam?: string | null) {
  const [row] = await db
    .select({ family: workflowFamily, repo: repository })
    .from(workflowFamily)
    .innerJoin(repository, eq(workflowFamily.repositoryId, repository.id))
    .where(and(eq(workflowFamily.id, familyId), eq(workflowFamily.present, true)));
  if (!row) return null;
  const { family, repo } = row;
  const resource = { category: family.category, familyId: family.id };
  if (!can(actor, "catalog.view", resource)) return null;

  const versions = await db.select().from(workflowVersion).where(eq(workflowVersion.familyId, family.id)).orderBy(desc(workflowVersion.version));
  const current = versions.find((v) => v.status === "current") ?? versions[0] ?? null;
  const version = versions.find((v) => v.version === versionParam) ?? current;

  const recent = await db
    .select({ id: runRequest.id, phase: runRequest.phase, ref: runRequest.ref, createdAt: runRequest.createdAt, requester: user.name, actorLogin: runRequest.actorLogin, savedInputName: runRequest.savedInputName, inputs: runRequest.inputs, startedAt: workflowRun.startedAt, completedAt: workflowRun.completedAt })
    .from(runRequest)
    .leftJoin(user, eq(runRequest.requestedBy, user.id))
    .leftJoin(workflowRun, eq(workflowRun.runRequestId, runRequest.id))
    .where(eq(runRequest.familyId, family.id))
    .orderBy(desc(runRequest.createdAt))
    .limit(10);

  const [lastMine] = await db
    .select({ ref: runRequest.ref, inputs: runRequest.inputs })
    .from(runRequest)
    .where(and(eq(runRequest.familyId, family.id), eq(runRequest.requestedBy, actor.userId), eq(runRequest.source, "flowdeck")))
    .orderBy(desc(runRequest.createdAt))
    .limit(1);

  const [active] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(runRequest)
    .where(and(eq(runRequest.familyId, family.id), sql`${runRequest.phase} not in ('succeeded','failed','cancelled','timed_out','completed','lost','dispatch_failed')`));

  const ctx = await loadApprovalContext();
  const envNames = repo.environments.map((e) => e.name);
  const runnableEnvs = allowedEnvironments(actor, resource, envNames);
  const environments = repo.environments.map((e) => {
    const rule = resolveRule(ctx.rules, family.id, e.name);
    return {
      name: e.name,
      protected: e.protected,
      approvers: rule.mode === "github" ? `GitHub reviewers: ${describeReviewers(e.reviewers)}` : "FlowDeck approver groups",
      canRun: runnableEnvs.includes(e.name),
    };
  });

  return {
    family: {
      id: family.id,
      title: family.title,
      summary: family.summary,
      category: family.category,
      subcategory: family.subcategory,
      scope: family.scope,
      kind: family.kind,
      owner: family.owner,
      status: family.status,
      tags: family.tags,
      typicalDuration: family.typicalDuration,
      approvalNote: family.approvalNote,
      lastReviewed: family.lastReviewed,
      docBody: family.docBody,
      related: family.related,
    },
    repo: { fullName: repo.fullName, defaultBranch: repo.defaultBranch },
    versions: versions.map((v) => ({ version: v.version, status: v.status, supersededBy: v.supersededBy, filePath: v.filePath })),
    version: version
      ? {
          version: version.version,
          status: version.status,
          filePath: version.filePath,
          githubWorkflowId: version.githubWorkflowId,
          dispatchable: version.dispatchable,
          githubState: version.githubState,
          inputs: version.inputs,
          jobs: version.jobs,
          concurrency: version.concurrency,
          parseError: version.parseError,
          blobSha: version.blobSha,
        }
      : null,
    environments,
    canRun: canRunAnywhere(actor, resource),
    activeRuns: active?.n ?? 0,
    recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), durationSeconds: r.startedAt && r.completedAt ? (r.completedAt.getTime() - r.startedAt.getTime()) / 1000 : null, startedAt: undefined, completedAt: undefined })),
    lastMine: lastMine ?? null,
    savedInputs: (await listSavedInputs(actor.userId, family.id)).map((s) => ({ id: s.id, name: s.name, ref: s.ref, inputs: s.inputs, isDefault: s.isDefault })),
  };
}

export type WorkflowPageData = NonNullable<Awaited<ReturnType<typeof getWorkflowPage>>>;
