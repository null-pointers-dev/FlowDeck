import { eq, inArray } from "drizzle-orm";
import { db } from "@/platform/db";
import { groupRoleBinding, role, user, userAccess } from "@/platform/db/schema";
import { ENTRA_ADMIN_ROLE, ENTRA_USER_ROLE, type Actor, type Grant } from "../domain/permissions";

/** Builds the permission model for a person from their last-known Entra roles and groups. No Next.js imports: the worker uses it too. */
export async function loadActor(userId: string): Promise<Actor | null> {
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email, access: userAccess })
    .from(user)
    .leftJoin(userAccess, eq(userAccess.userId, user.id))
    .where(eq(user.id, userId));
  if (!row) return null;

  const appRoles = row.access?.appRoles ?? [];
  const groups = row.access?.groups ?? [];
  const isPlatformAdmin = appRoles.includes(ENTRA_ADMIN_ROLE);
  const hasAccess = isPlatformAdmin || appRoles.includes(ENTRA_USER_ROLE);

  const bindings = groups.length
    ? await db
        .select({ b: groupRoleBinding, r: role })
        .from(groupRoleBinding)
        .innerJoin(role, eq(groupRoleBinding.roleId, role.id))
        .where(inArray(groupRoleBinding.groupId, groups))
    : [];

  const grants: Grant[] = bindings.map(({ b, r }) => ({
    permissions: r.permissions,
    roleName: r.name,
    groupId: b.groupId,
    scope: { category: b.scopeCategory, familyId: b.scopeFamily, environment: b.scopeEnvironment },
  }));

  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    githubLogin: row.access?.githubLogin ?? null,
    groups,
    isPlatformAdmin,
    hasAccess,
    grants,
  };
}
