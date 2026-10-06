import { asc, eq, sql } from "drizzle-orm";
import { requirePermission } from "@/platform/session";
import { db } from "@/platform/db";
import { entraGroup, githubConnection, workflowFamily } from "@/platform/db/schema";
import { listRules } from "@/features/admin/server/rules";
import { RulesView } from "@/features/admin/ui/rules-view";

export const metadata = { title: "Approval rules" };

export default async function RulesPage() {
  await requirePermission("admin.approvals");
  const [rules, groups, families, connections, envRows] = await Promise.all([
    listRules(),
    db.select().from(entraGroup).orderBy(asc(entraGroup.displayName)),
    db.select({ id: workflowFamily.id, title: workflowFamily.title }).from(workflowFamily).where(eq(workflowFamily.present, true)).orderBy(asc(workflowFamily.title)),
    db.select({ owner: githubConnection.owner, purpose: githubConnection.purpose }).from(githubConnection),
    db.execute(sql`select distinct e->>'name' as name from repository, jsonb_array_elements(environments) e order by 1`),
  ]);
  return (
    <RulesView
      rules={rules.map((r) => ({ id: r.id, familyId: r.familyId, environmentName: r.environmentName, mode: r.mode, approverGroupIds: r.approverGroupIds, preventSelfApproval: r.preventSelfApproval }))}
      groups={groups.map((g) => ({ id: g.id, displayName: g.displayName }))}
      families={families}
      environments={(envRows as unknown as { rows: Array<{ name: string }> }).rows.map((r) => r.name)}
      owners={[...new Set(connections.filter((c) => c.purpose === "dispatch").map((c) => c.owner))]}
      approverOwners={connections.filter((c) => c.purpose === "approver").map((c) => c.owner)}
    />
  );
}
