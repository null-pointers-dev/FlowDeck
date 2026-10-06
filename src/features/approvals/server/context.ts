import { db } from "@/platform/db";
import { approvalRule, githubTeamMember } from "@/platform/db/schema";
import type { Rule } from "../domain/eligibility";

/** Rules and cached GitHub team members, loaded once per request or job. */
export async function loadApprovalContext(): Promise<{ rules: Rule[]; teams: Map<string, Set<string>> }> {
  const [rules, members] = await Promise.all([db.select().from(approvalRule), db.select().from(githubTeamMember)]);
  const teams = new Map<string, Set<string>>();
  for (const m of members) {
    const k = `${m.org}/${m.teamSlug}`.toLowerCase();
    if (!teams.has(k)) teams.set(k, new Set());
    teams.get(k)!.add(m.login.toLowerCase());
  }
  return {
    rules: rules.map((r) => ({ familyId: r.familyId, environmentName: r.environmentName, mode: r.mode, approverGroupIds: r.approverGroupIds, preventSelfApproval: r.preventSelfApproval })),
    teams,
  };
}
