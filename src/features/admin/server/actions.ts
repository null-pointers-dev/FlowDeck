"use server";

import { z } from "zod";
import { defineAction } from "@/platform/action";
import { jobs } from "@/platform/jobs/client";
import { audit } from "@/platform/audit";
import { PERMISSIONS } from "@/features/access/domain/permissions";
import { recheckConnection, removeConnection, saveConnection } from "./connections";
import { addBinding, addGroupManually, checkAccess, deleteRole, peopleInGroup, removeBinding, saveRole } from "./access";
import { addRule, deleteRule } from "./rules";
import { retryFailed } from "./overview";
import { notify } from "@/features/notify/server/service";

const id = z.object({ id: z.string().uuid() });
const optional = z.string().trim().max(200).transform((v) => v || null).nullable();

export const saveConnectionAction = defineAction(
  {
    name: "admin.saveConnection",
    permission: "admin.connections",
    revalidate: ["/admin/connections"],
    input: z.object({
      owner: z.string().trim().min(1, "Required").max(100),
      purpose: z.enum(["dispatch", "approver"]),
      kind: z.enum(["pat", "app"]),
      name: z.string().max(80).optional(),
      token: z.string().max(400).optional(),
      appId: z.string().max(20).optional(),
      installationId: z.string().max(20).optional(),
      privateKey: z.string().max(8000).optional(),
    }),
  },
  (input, { actor }) => saveConnection(actor, input),
);
export const removeConnectionAction = defineAction({ name: "admin.removeConnection", permission: "admin.connections", input: id, revalidate: ["/admin/connections"] }, (i, { actor }) => removeConnection(actor, i.id));
export const recheckConnectionAction = defineAction({ name: "admin.recheckConnection", permission: "admin.connections", input: id, revalidate: ["/admin/connections"] }, (i, { actor }) => recheckConnection(actor, i.id));

export const saveRoleAction = defineAction(
  {
    name: "admin.saveRole",
    permission: "admin.access",
    revalidate: ["/admin/access"],
    input: z.object({
      id: z.string().uuid().optional(),
      key: z.string().trim().regex(/^[a-z][a-z0-9-]{1,30}$/, "Lower-case letters, numbers and dashes"),
      name: z.string().trim().min(2).max(40),
      description: z.string().trim().max(200),
      permissions: z.array(z.enum(PERMISSIONS)).min(1, "Choose at least one permission"),
    }),
  },
  (input, { actor }) => saveRole(actor, input),
);
export const deleteRoleAction = defineAction({ name: "admin.deleteRole", permission: "admin.access", input: id, revalidate: ["/admin/access"] }, (i, { actor }) => deleteRole(actor, i.id));

export const addBindingAction = defineAction(
  {
    name: "admin.addBinding",
    permission: "admin.access",
    revalidate: ["/admin/access"],
    input: z.object({ groupId: z.string().min(1), roleId: z.string().uuid(), category: optional, familyId: optional, environment: optional }),
  },
  (input, { actor }) => addBinding(actor, input),
);
export const removeBindingAction = defineAction({ name: "admin.removeBinding", permission: "admin.access", input: id, revalidate: ["/admin/access"] }, (i, { actor }) => removeBinding(actor, i.id));
export const groupImpactAction = defineAction({ name: "admin.groupImpact", permission: "admin.access", input: z.object({ groupId: z.string() }) }, async (i) => ({ people: await peopleInGroup(i.groupId) }));
export const addGroupAction = defineAction(
  { name: "admin.addGroup", permission: "admin.access", revalidate: ["/admin/access"], input: z.object({ id: z.string().trim(), displayName: z.string().trim().min(1).max(120) }) },
  (i, { actor }) => addGroupManually(actor, i.id, i.displayName),
);
export const syncGroupsAction = defineAction({ name: "admin.syncGroups", permission: "admin.access", input: z.object({}) }, async (_i, { actor }) => {
  await jobs.send("access.syncGroups", {});
  await audit(actor, "groups.sync_requested", { type: "system" });
});
export const checkAccessAction = defineAction(
  {
    name: "admin.checkAccess",
    permission: "admin.access",
    input: z.object({ userId: z.string().min(1), permission: z.enum(PERMISSIONS), category: optional, familyId: optional, environment: optional }),
  },
  (i) => checkAccess(i.userId, i.permission, { category: i.category, familyId: i.familyId, environment: i.environment }),
);

export const addRuleAction = defineAction(
  {
    name: "admin.addRule",
    permission: "admin.approvals",
    revalidate: ["/admin/approvals"],
    input: z.object({
      familyId: optional,
      environmentName: z.string().trim().max(100),
      mode: z.enum(["github", "flowdeck"]),
      approverGroupIds: z.array(z.string()).max(20),
      preventSelfApproval: z.boolean(),
    }),
  },
  (i, { actor }) => addRule(actor, i),
);
export const deleteRuleAction = defineAction({ name: "admin.deleteRule", permission: "admin.approvals", input: id, revalidate: ["/admin/approvals"] }, (i, { actor }) => deleteRule(actor, i.id));

export const syncCatalogAction = defineAction({ name: "admin.syncCatalog", permission: "admin.connections", input: z.object({}) }, async (_i, { actor, log }) => {
  await jobs.send("catalog.sync", { reason: "manual", requestedBy: actor.userId });
  await audit(actor, "catalog.sync_requested", { type: "system" });
  await notify(actor.userId, {
    kind: "catalog.sync.started",
    title: "Catalog sync queued",
    body: "FlowDeck is checking the DevOps repository in the background. The result will be saved here.",
    link: "/admin",
  }).catch((err) => log.warn({ event: "catalog.sync_notification_failed", err }));
});
export const pollNowAction = defineAction({ name: "admin.pollNow", permission: "admin.audit", input: z.object({}) }, () => jobs.send("runs.poll", { force: true }));
export const retryFailedAction = defineAction({ name: "admin.retryFailed", permission: "admin.audit", input: z.object({ queue: z.string() }), revalidate: ["/admin"] }, (i) => retryFailed(i.queue));
