import type { Actor } from "@/features/access/domain/permissions";
import { can } from "@/features/access/domain/permissions";

export type ApprovalMode = "github" | "flowdeck";
export type Reviewer = { type: "User"; login: string } | { type: "Team"; slug: string; name?: string; org: string };

export type Rule = {
  familyId: string | null;
  environmentName: string;
  mode: ApprovalMode;
  approverGroupIds: string[];
  preventSelfApproval: boolean;
};

export type Gate = {
  familyId: string;
  category: string | null;
  environmentName: string;
  reviewers: Reviewer[];
  requestedBy: string | null;
};

export const DEFAULT_RULE: Rule = { familyId: null, environmentName: "*", mode: "github", approverGroupIds: [], preventSelfApproval: true };

/** Most specific rule wins: family + environment, family, environment, default. */
export function resolveRule(rules: Rule[], familyId: string, environmentName: string): Rule {
  const env = environmentName.toLowerCase();
  const same = (r: Rule) => r.environmentName.toLowerCase() === env;
  return (
    rules.find((r) => r.familyId === familyId && same(r)) ??
    rules.find((r) => r.familyId === familyId && r.environmentName === "*") ??
    rules.find((r) => !r.familyId && same(r)) ??
    rules.find((r) => !r.familyId && r.environmentName === "*") ??
    DEFAULT_RULE
  );
}

export type Eligibility = { allowed: boolean; reason: string };

/** teams: "org/slug" lower-case -> lower-case logins */
export function canApprove(actor: Actor, gate: Gate, rules: Rule[], teams: Map<string, Set<string>>): Eligibility {
  if (!can(actor, "approval.decide", { category: gate.category, familyId: gate.familyId, environment: gate.environmentName })) {
    return { allowed: false, reason: "Your roles don't include approving this workflow." };
  }
  const rule = resolveRule(rules, gate.familyId, gate.environmentName);
  if (rule.preventSelfApproval && gate.requestedBy === actor.userId) {
    return { allowed: false, reason: "You started this run, so someone else has to approve it." };
  }
  if (rule.mode === "flowdeck") {
    if (rule.approverGroupIds.length === 0) return { allowed: false, reason: `No approver groups are set for ${gate.environmentName}.` };
    return actor.groups.some((g) => rule.approverGroupIds.includes(g)) || actor.isPlatformAdmin
      ? { allowed: true, reason: "You're in an approver group for this environment." }
      : { allowed: false, reason: `You're not in an approver group for ${gate.environmentName}.` };
  }
  if (!actor.githubLogin) return { allowed: false, reason: "Link your GitHub account so FlowDeck can match you to GitHub's reviewers." };
  const login = actor.githubLogin.toLowerCase();
  for (const r of gate.reviewers) {
    if (r.type === "User" && r.login.toLowerCase() === login) return { allowed: true, reason: "You're a required reviewer on GitHub." };
    if (r.type === "Team" && teams.get(`${r.org}/${r.slug}`.toLowerCase())?.has(login)) {
      return { allowed: true, reason: `You're in the ${r.name ?? r.slug} team on GitHub.` };
    }
  }
  return { allowed: false, reason: `You're not a GitHub reviewer for ${gate.environmentName}.` };
}

export function describeReviewers(reviewers: Reviewer[]): string {
  if (reviewers.length === 0) return "no reviewers listed";
  return reviewers.map((r) => (r.type === "User" ? `@${r.login}` : `${r.name ?? r.slug} team`)).join(", ");
}
