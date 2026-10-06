import { describe, expect, it } from "vitest";
import { allowedEnvironments, can, type Actor } from "@/features/access/domain/permissions";

const base: Actor = { userId: "u1", name: "Priya", email: "p@x", githubLogin: null, groups: ["g-pay"], isPlatformAdmin: false, hasAccess: true, grants: [] };
const operator = (scope: Partial<Actor["grants"][number]["scope"]> = {}): Actor => ({
  ...base,
  grants: [{ permissions: ["catalog.view", "workflow.run", "run.manage.own"], roleName: "Operator", groupId: "g-pay", scope: { category: null, familyId: null, environment: null, ...scope } }],
});

describe("can()", () => {
  it("denies everything without access", () => {
    expect(can({ ...operator(), hasAccess: false }, "catalog.view")).toBe(false);
  });
  it("allows platform admins everything", () => {
    expect(can({ ...base, isPlatformAdmin: true, grants: [] }, "admin.access")).toBe(true);
  });
  it("respects category scope", () => {
    const a = operator({ category: "deploy" });
    expect(can(a, "workflow.run", { category: "deploy", familyId: "x" })).toBe(true);
    expect(can(a, "workflow.run", { category: "maintenance", familyId: "x" })).toBe(false);
  });
  it("environment-scoped grants only cover that environment", () => {
    const a = operator({ environment: "staging" });
    expect(can(a, "workflow.run", { environment: "staging" })).toBe(true);
    expect(can(a, "workflow.run", { environment: "production" })).toBe(false);
    expect(allowedEnvironments(a, { category: null, familyId: "f" }, ["staging", "production"])).toEqual(["staging"]);
  });
  it("unscoped grants cover every environment", () => {
    expect(allowedEnvironments(operator(), { category: null, familyId: "f" }, ["staging", "production"])).toEqual(["staging", "production"]);
  });
  it("admin permissions ignore resource scope", () => {
    const a: Actor = { ...base, grants: [{ permissions: ["admin.audit"], roleName: "Auditor", groupId: "g", scope: { category: "deploy", familyId: null, environment: null } }] };
    expect(can(a, "admin.audit")).toBe(true);
  });
});
