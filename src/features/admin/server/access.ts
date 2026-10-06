import { asc, eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { entraGroup, groupRoleBinding, role, user, userAccess } from "@/platform/db/schema";
import { config } from "@/platform/config";
import { audit } from "@/platform/audit";
import { conflict, invalid, notFound } from "@/platform/errors";
import type { Logger } from "@/platform/logger";
import { loadActor } from "@/features/access/server/actor";
import { can, explain, type Actor, type Permission } from "@/features/access/domain/permissions";

export async function accessOverview() {
  const [roles, bindings, groups, people] = await Promise.all([
    db.select().from(role).orderBy(asc(role.name)),
    db.select().from(groupRoleBinding).orderBy(asc(groupRoleBinding.createdAt)),
    db.select().from(entraGroup).orderBy(asc(entraGroup.displayName)),
    db.select({ id: user.id, name: user.name, email: user.email }).from(user).orderBy(asc(user.name)),
  ]);
  return { roles, bindings, groups, people };
}

export async function saveRole(actor: Actor, input: { id?: string; key: string; name: string; description: string; permissions: Permission[] }) {
  if (input.id) {
    const [existing] = await db.select().from(role).where(eq(role.id, input.id));
    if (!existing) throw notFound("This role");
    await db.update(role).set({ name: input.name, description: input.description, permissions: input.permissions, updatedAt: new Date() }).where(eq(role.id, input.id));
    await audit(actor, "role.updated", { type: "role", id: input.id }, { before: existing.permissions, after: input.permissions });
    return { id: input.id };
  }
  const [row] = await db.insert(role).values({ key: input.key, name: input.name, description: input.description, permissions: input.permissions }).onConflictDoNothing().returning({ id: role.id });
  if (!row) throw conflict(`A role with key "${input.key}" already exists.`);
  await audit(actor, "role.created", { type: "role", id: row.id }, { key: input.key, permissions: input.permissions });
  return row;
}

export async function deleteRole(actor: Actor, id: string) {
  const [r] = await db.select().from(role).where(eq(role.id, id));
  if (!r) throw notFound("This role");
  if (r.builtIn) throw conflict("Built-in roles can be edited but not deleted.");
  await db.delete(role).where(eq(role.id, id));
  await audit(actor, "role.deleted", { type: "role", id }, { key: r.key });
}

export async function addBinding(actor: Actor, input: { groupId: string; roleId: string; category: string | null; familyId: string | null; environment: string | null }) {
  const [row] = await db
    .insert(groupRoleBinding)
    .values({ groupId: input.groupId, roleId: input.roleId, scopeCategory: input.category, scopeFamily: input.familyId, scopeEnvironment: input.environment, createdBy: actor.userId })
    .returning({ id: groupRoleBinding.id });
  await audit(actor, "binding.added", { type: "binding", id: row.id }, input);
  return row;
}

export async function removeBinding(actor: Actor, id: string) {
  const [b] = await db.delete(groupRoleBinding).where(eq(groupRoleBinding.id, id)).returning();
  if (b) await audit(actor, "binding.removed", { type: "binding", id }, { groupId: b.groupId, roleId: b.roleId });
}

/** Who is affected by a binding change: people currently in that group. */
export async function peopleInGroup(groupId: string): Promise<number> {
  const rows = await db.select({ groups: userAccess.groups }).from(userAccess);
  return rows.filter((r) => r.groups.includes(groupId)).length;
}

export async function checkAccess(userId: string, permission: Permission, resource: { category: string | null; familyId: string | null; environment: string | null }) {
  const target = await loadActor(userId);
  if (!target) throw notFound("That person");
  return { allowed: can(target, permission, resource), reasons: explain(target, permission, resource) };
}

/** Worker, daily: the groups assigned to the FlowDeck enterprise app, by name, from Microsoft Graph. */
export async function syncEntraGroups(log: Logger) {
  const entra = config.entra;
  if (!entra?.servicePrincipalId) {
    log.info({ event: "access.groups_not_configured" }, "Set ENTRA_SERVICE_PRINCIPAL_ID to list groups by name");
    return;
  }
  const tokenRes = await fetch(`https://login.microsoftonline.com/${entra.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: entra.clientId, client_secret: entra.clientSecret, scope: "https://graph.microsoft.com/.default" }),
  });
  if (!tokenRes.ok) throw new Error(`Entra token request failed with ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const found: Array<{ id: string; name: string }> = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/servicePrincipals/${entra.servicePrincipalId}/appRoleAssignedTo?$top=999`;
  while (url) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${access_token}` } });
    if (!res.ok) throw new Error(`Graph returned ${res.status}. Grant the app Application.Read.All.`);
    const body = (await res.json()) as { value: Array<{ principalType: string; principalId: string; principalDisplayName: string }>; "@odata.nextLink"?: string };
    for (const a of body.value) if (a.principalType === "Group" && !found.some((f) => f.id === a.principalId)) found.push({ id: a.principalId, name: a.principalDisplayName });
    url = body["@odata.nextLink"] ?? null;
  }
  for (const g of found) {
    await db.insert(entraGroup).values({ id: g.id, displayName: g.name }).onConflictDoUpdate({ target: entraGroup.id, set: { displayName: g.name, syncedAt: new Date() } });
  }
  log.info({ event: "access.groups_synced", count: found.length });
}

export async function addGroupManually(actor: Actor, id: string, displayName: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw invalid("Use the group's Object ID from Entra.", { id: "Not an object ID" });
  await db.insert(entraGroup).values({ id, displayName }).onConflictDoUpdate({ target: entraGroup.id, set: { displayName } });
  await audit(actor, "group.added", { type: "group", id }, { displayName });
}
