import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { requireActor } from "@/platform/session";
import { db } from "@/platform/db";
import { searchWorkflows } from "@/features/search/server/search";
import { listCategories } from "@/features/catalog/server/queries";
import { CatalogView } from "@/features/catalog/ui/catalog-view";

export const metadata = { title: "Workflows" };

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const [hits, categories, envRows] = await Promise.all([
    searchWorkflows(actor, q, { category: sp.category, env: sp.env, scope: sp.scope, includeAll: sp.all === "1" }, 60),
    listCategories(),
    db.execute(sql`select distinct jsonb_array_elements_text(facets->'environments') as env from workflow_family where present order by 1`),
  ]);
  const environments = (envRows as unknown as { rows: Array<{ env: string }> }).rows.map((r) => r.env);
  return (
    <Suspense>
      <CatalogView hits={hits} categories={categories} environments={environments} query={q} />
    </Suspense>
  );
}
