/**
 * Permissions are checked by one function, can(). Roles are named permission sets
 * edited by admins; Entra groups are bound to roles with an optional scope.
 */

export const PERMISSIONS = [
  "catalog.view",
  "workflow.run",
  "run.manage.own",
  "run.manage.any",
  "approval.decide",
  "admin.connections",
  "admin.access",
  "admin.approvals",
  "admin.audit",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "catalog.view": "Browse and search workflows",
  "workflow.run": "Start runs",
  "run.manage.own": "Cancel or rerun own runs",
  "run.manage.any": "Cancel or rerun anyone's runs",
  "approval.decide": "Approve or reject deployments",
  "admin.connections": "Manage GitHub connections",
  "admin.access": "Manage roles and group bindings",
  "admin.approvals": "Manage approval rules",
  "admin.audit": "View audit log and system health",
};

export const ADMIN_PERMISSIONS: Permission[] = ["admin.connections", "admin.access", "admin.approvals", "admin.audit"];

export const BUILT_IN_ROLES: Array<{ key: string; name: string; description: string; permissions: Permission[] }> = [
  { key: "viewer", name: "Viewer", description: "Browse, search and read documentation.", permissions: ["catalog.view"] },
  { key: "operator", name: "Operator", description: "Run workflows and manage their own runs.", permissions: ["catalog.view", "workflow.run", "run.manage.own"] },
  { key: "approver", name: "Approver", description: "Operator, plus approving deployments allowed by approval rules.", permissions: ["catalog.view", "workflow.run", "run.manage.own", "approval.decide"] },
  { key: "admin", name: "Admin", description: "Everything, including connections, access and approval rules.", permissions: [...PERMISSIONS] },
];

export const ENTRA_ADMIN_ROLE = "FlowDeck.Admin";
export const ENTRA_USER_ROLE = "FlowDeck.User";

export type Scope = { category: string | null; familyId: string | null; environment: string | null };
export type Grant = { permissions: Permission[]; scope: Scope; roleName: string; groupId: string };

export type Actor = {
  userId: string;
  name: string;
  email: string;
  githubLogin: string | null;
  groups: string[];
  isPlatformAdmin: boolean;
  /** Signed in through Entra with a FlowDeck app role (or dev login). */
  hasAccess: boolean;
  grants: Grant[];
};

export type Resource = { category?: string | null; familyId?: string | null; environment?: string | null };

function scopeMatches(scope: Scope, r: Resource): boolean {
  if (scope.category && scope.category !== (r.category ?? null)) return false;
  if (scope.familyId && scope.familyId !== (r.familyId ?? null)) return false;
  // An environment-scoped grant only applies when the action targets that environment.
  if (scope.environment && scope.environment.toLowerCase() !== (r.environment ?? "").toLowerCase()) return false;
  return true;
}

export function can(actor: Actor, permission: Permission, resource: Resource = {}): boolean {
  if (actor.isPlatformAdmin) return true;
  if (!actor.hasAccess) return false;
  const isAdmin = ADMIN_PERMISSIONS.includes(permission);
  return actor.grants.some((g) => g.permissions.includes(permission) && (isAdmin || scopeMatches(g.scope, resource)));
}

/**
 * Environments a person may run a workflow in. Grants without an environment scope
 * allow every environment; environment-scoped grants add specific ones.
 */
export function allowedEnvironments(actor: Actor, resource: { category: string | null; familyId: string }, all: string[]): string[] {
  if (actor.isPlatformAdmin) return all;
  return all.filter((env) => can(actor, "workflow.run", { ...resource, environment: env }));
}

export function canRunAnywhere(actor: Actor, resource: { category: string | null; familyId: string }): boolean {
  if (actor.isPlatformAdmin) return true;
  return actor.grants.some(
    (g) =>
      g.permissions.includes("workflow.run") &&
      (!g.scope.category || g.scope.category === resource.category) &&
      (!g.scope.familyId || g.scope.familyId === resource.familyId),
  );
}

export function explain(actor: Actor, permission: Permission, resource: Resource = {}): string[] {
  if (actor.isPlatformAdmin) return [`Has the Entra app role ${ENTRA_ADMIN_ROLE}.`];
  if (!actor.hasAccess) return ["Not assigned to FlowDeck in Entra."];
  const matched = actor.grants.filter((g) => g.permissions.includes(permission) && (ADMIN_PERMISSIONS.includes(permission) || scopeMatches(g.scope, resource)));
  if (matched.length === 0) return ["No role bound to this person's groups grants it for this resource."];
  return matched.map((g) => {
    const parts = [g.scope.category && `category ${g.scope.category}`, g.scope.familyId && `workflow ${g.scope.familyId}`, g.scope.environment && `environment ${g.scope.environment}`].filter(Boolean);
    return `Role ${g.roleName} via group ${g.groupId}${parts.length ? ` (scoped to ${parts.join(", ")})` : ""}.`;
  });
}
