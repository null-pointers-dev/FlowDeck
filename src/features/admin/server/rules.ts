import { asc, eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { approvalRule } from "@/platform/db/schema";
import { audit } from "@/platform/audit";
import { invalid } from "@/platform/errors";
import type { Actor } from "@/features/access/domain/permissions";

export async function listRules() {
  return db.select().from(approvalRule).orderBy(asc(approvalRule.createdAt));
}

export async function addRule(actor: Actor, input: { familyId: string | null; environmentName: string; mode: "github" | "flowdeck"; approverGroupIds: string[]; preventSelfApproval: boolean }) {
  if (input.mode === "flowdeck" && input.approverGroupIds.length === 0) throw invalid("Choose at least one approver group.", { approverGroupIds: "Required" });
  const [row] = await db.insert(approvalRule).values({ ...input, environmentName: input.environmentName.trim() || "*" }).returning({ id: approvalRule.id });
  await audit(actor, "approval_rule.added", { type: "approval_rule", id: row.id }, input);
  return row;
}

export async function deleteRule(actor: Actor, id: string) {
  await db.delete(approvalRule).where(eq(approvalRule.id, id));
  await audit(actor, "approval_rule.deleted", { type: "approval_rule", id });
}
