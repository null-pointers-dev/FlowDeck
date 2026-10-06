import { asc, eq, sql } from "drizzle-orm";
import { requirePermission } from "@/platform/session";
import { db } from "@/platform/db";
import { workflowFamily } from "@/platform/db/schema";
import { config } from "@/platform/config";
import { accessOverview } from "@/features/admin/server/access";
import { listCategories } from "@/features/catalog/server/queries";
import { AccessView } from "@/features/admin/ui/access-view";

export const metadata = { title: "Access" };

export default async function AccessPage() {
  await requirePermission("admin.access");
  const [overview, categories, families, envRows] = await Promise.all([
    accessOverview(),
    listCategories(),
    db.select({ id: workflowFamily.id, title: workflowFamily.title }).from(workflowFamily).where(eq(workflowFamily.present, true)).orderBy(asc(workflowFamily.title)),
    db.execute(sql`select distinct e->>'name' as name from repository, jsonb_array_elements(environments) e order by 1`),
  ]);
  return (
    <AccessView
      roles={overview.roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, builtIn: r.builtIn }))}
      bindings={overview.bindings.map((b) => ({ id: b.id, groupId: b.groupId, roleId: b.roleId, scopeCategory: b.scopeCategory, scopeFamily: b.scopeFamily, scopeEnvironment: b.scopeEnvironment }))}
      groups={overview.groups.map((g) => ({ id: g.id, displayName: g.displayName }))}
      people={overview.people}
      categories={categories}
      families={families}
      environments={(envRows as unknown as { rows: Array<{ name: string }> }).rows.map((r) => r.name)}
      graphConfigured={!!config.entra?.servicePrincipalId}
    />
  );
}
