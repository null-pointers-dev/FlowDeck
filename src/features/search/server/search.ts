import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { runRequest, workflowFamily, workflowVersion } from "@/platform/db/schema";
import { embedQuery } from "@/platform/ai";
import { can, type Actor } from "@/features/access/domain/permissions";
import { boost, fuse, parseQuery, type Ranked } from "../domain/rank";

export type SearchFilters = { category?: string | null; env?: string | null; scope?: string | null; includeAll?: boolean };

export type SearchHit = {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  subcategory: string | null;
  scope: string;
  kind: string;
  status: string;
  owner: string | null;
  tags: string[];
  environments: string[];
  currentVersion: string | null;
  hasDoc: boolean;
  snippet: { section: string; text: string } | null;
  myRuns: number;
};

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: Row[] }).rows;

function ranked(list: Row[], key = "id"): Ranked[] {
  return list.map((r, i) => ({ id: String(r[key]), rank: i + 1 }));
}

/** Hybrid search over the catalog. Without a query it lists workflows, the ones you use first. */
export async function searchWorkflows(actor: Actor, query: string, filters: SearchFilters = {}, limit = 30): Promise<SearchHit[]> {
  const { text, filters: inline } = parseQuery(query);
  const category = filters.category ?? inline.category ?? null;
  const env = filters.env ?? inline.env ?? null;

  const snippets = new Map<string, { section: string; text: string }>();
  let scores = new Map<string, number>();

  if (text) {
    const [lexical, trigram, chunkText, vec] = await Promise.all([
      rows(sql`select id from workflow_family
               where present and search_vector @@ websearch_to_tsquery('english', ${text})
               order by ts_rank_cd(search_vector, websearch_to_tsquery('english', ${text})) desc limit 50`),
      rows(sql`select id from workflow_family where present and (title % ${text} or id % ${text})
               order by greatest(similarity(title, ${text}), similarity(id, ${text})) desc limit 20`),
      rows(sql`select distinct on (family_id) family_id, section, content,
                      ts_rank_cd(content_vector, websearch_to_tsquery('english', ${text})) as r
               from doc_chunk where content_vector @@ websearch_to_tsquery('english', ${text})
               order by family_id, r desc limit 200`),
      embedQuery(text),
    ]);
    chunkText.sort((a, b) => Number(b.r) - Number(a.r));
    for (const c of chunkText) snippets.set(String(c.family_id), { section: String(c.section), text: String(c.content) });

    const lists = [ranked(lexical), ranked(trigram), ranked(chunkText.slice(0, 50), "family_id")];
    if (vec) {
      const semantic = await rows(sql`select family_id, section, content from (
                 select distinct on (family_id) family_id, section, content, embedding <=> ${JSON.stringify(vec)}::vector as d
                 from doc_chunk where embedding is not null
                 order by family_id, embedding <=> ${JSON.stringify(vec)}::vector) t
               order by d asc limit 50`);
      for (const c of semantic) if (!snippets.has(String(c.family_id))) snippets.set(String(c.family_id), { section: String(c.section), text: String(c.content) });
      lists.push(ranked(semantic, "family_id"));
    }
    scores = fuse(lists);
    if (scores.size === 0) return [];
  }

  const ids = [...scores.keys()];
  const where = and(
    eq(workflowFamily.present, true),
    text ? inArray(workflowFamily.id, ids) : undefined,
    filters.includeAll ? undefined : eq(workflowFamily.kind, "entrypoint"),
    category ? sql`(${workflowFamily.category} = ${category} or ${workflowFamily.subcategory} = ${category})` : undefined,
    env ? sql`${workflowFamily.facets}->'environments' ? ${env}` : undefined,
    filters.scope ? eq(workflowFamily.scope, filters.scope) : undefined,
  );

  const families = await db
    .select({
      f: workflowFamily,
      currentVersion: sql<string | null>`(select version from ${workflowVersion} v where v.family_id = ${workflowFamily.id} order by (v.status = 'current') desc, v.version desc limit 1)`,
    })
    .from(workflowFamily)
    .where(where)
    .limit(text ? 200 : 500);

  const famIds = families.map((r) => r.f.id);
  const usage = famIds.length
    ? await db
        .select({
          familyId: runRequest.familyId,
          mine: sql<number>`count(*) filter (where ${runRequest.requestedBy} = ${actor.userId} and ${runRequest.createdAt} > now() - interval '90 days')`.mapWith(Number),
          everyone: sql<number>`count(*) filter (where ${runRequest.createdAt} > now() - interval '30 days')`.mapWith(Number),
        })
        .from(runRequest)
        .where(inArray(runRequest.familyId, famIds))
        .groupBy(runRequest.familyId)
    : [];
  const views = famIds.length ? await rows(sql`select family_id from workflow_view where user_id = ${actor.userId} and viewed_at > now() - interval '14 days'`) : [];
  const usageBy = new Map(usage.map((u) => [u.familyId, { mine: u.mine, everyone: u.everyone }]));
  const viewed = new Set(views.map((v) => String(v.family_id)));

  const hits = families
    .filter(({ f }) => can(actor, "catalog.view", { category: f.category, familyId: f.id }))
    .map(({ f, currentVersion }) => {
      const u = usageBy.get(f.id) ?? { mine: 0, everyone: 0 };
      const base = text ? scores.get(f.id) ?? 0 : 1;
      const score = boost(base, { status: f.status, myRuns90d: u.mine, teamRuns30d: u.everyone, recentlyViewed: viewed.has(f.id) });
      const snip = snippets.get(f.id) ?? null;
      const hit: SearchHit = {
        id: f.id,
        title: f.title,
        summary: f.summary,
        category: f.category,
        subcategory: f.subcategory,
        scope: f.scope,
        kind: f.kind,
        status: f.status,
        owner: f.owner,
        tags: f.tags,
        environments: f.facets.environments ?? [],
        currentVersion,
        hasDoc: !!f.docPath,
        snippet: snip ? { section: snip.section, text: snip.text.replace(/\s+/g, " ").slice(0, 220) } : null,
        myRuns: u.mine,
      };
      return { hit, score };
    });

  hits.sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title));
  return hits.slice(0, limit).map((h) => h.hit);
}
