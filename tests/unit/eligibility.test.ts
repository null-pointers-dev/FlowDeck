import { describe, expect, it } from "vitest";
import type { Actor } from "@/features/access/domain/permissions";
import { canApprove, resolveRule, type Gate, type Rule } from "@/features/approvals/domain/eligibility";

const approver: Actor = {
  userId: "u2",
  name: "Mei",
  email: "m@x",
  githubLogin: "mei",
  groups: ["g-release"],
  isPlatformAdmin: false,
  hasAccess: true,
  grants: [{ permissions: ["catalog.view", "approval.decide"], roleName: "Approver", groupId: "g-release", scope: { category: null, familyId: null, environment: null } }],
};
const gate: Gate = { familyId: "deploy-payments", category: "deploy", environmentName: "production", reviewers: [{ type: "User", login: "mei" }], requestedBy: "u1" };
const teams = new Map<string, Set<string>>();

describe("approval eligibility", () => {
  it("mirrors GitHub reviewers by default", () => {
    expect(canApprove(approver, gate, [], teams).allowed).toBe(true);
    expect(canApprove({ ...approver, githubLogin: "someone" }, gate, [], teams).allowed).toBe(false);
  });
  it("matches GitHub team reviewers through the team cache", () => {
    const t = new Map([["acme/release", new Set(["mei"])]]);
    expect(canApprove(approver, { ...gate, reviewers: [{ type: "Team", slug: "release", org: "acme" }] }, [], t).allowed).toBe(true);
  });
  it("blocks self-approval", () => {
    expect(canApprove(approver, { ...gate, requestedBy: "u2" }, [], teams).allowed).toBe(false);
  });
  it("uses FlowDeck approver groups when the rule says so", () => {
    const rules: Rule[] = [{ familyId: null, environmentName: "production", mode: "flowdeck", approverGroupIds: ["g-release"], preventSelfApproval: true }];
    expect(canApprove({ ...approver, githubLogin: null }, gate, rules, teams).allowed).toBe(true);
    expect(canApprove({ ...approver, groups: ["g-other"] }, gate, rules, teams).allowed).toBe(false);
  });
  it("requires the approval.decide permission", () => {
    expect(canApprove({ ...approver, grants: [] }, gate, [], teams).allowed).toBe(false);
  });
  it("picks the most specific rule", () => {
    const rules: Rule[] = [
      { familyId: null, environmentName: "*", mode: "github", approverGroupIds: [], preventSelfApproval: true },
      { familyId: null, environmentName: "production", mode: "flowdeck", approverGroupIds: ["a"], preventSelfApproval: true },
      { familyId: "deploy-payments", environmentName: "production", mode: "flowdeck", approverGroupIds: ["b"], preventSelfApproval: false },
    ];
    expect(resolveRule(rules, "deploy-payments", "Production").approverGroupIds).toEqual(["b"]);
    expect(resolveRule(rules, "other", "production").approverGroupIds).toEqual(["a"]);
    expect(resolveRule(rules, "other", "staging").mode).toBe("github");
  });
});
