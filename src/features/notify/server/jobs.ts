import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { approvalGate, groupRoleBinding, notification, role, runRequest, user, userAccess, workflowFamily, workflowRun } from "@/platform/db/schema";
import { sendEmail } from "@/platform/email";
import { config } from "@/platform/config";
import type { Logger } from "@/platform/logger";
import { loadActor } from "@/features/access/server/actor";
import { canApprove } from "@/features/approvals/domain/eligibility";
import { loadApprovalContext } from "@/features/approvals/server/context";
import { notify } from "./service";

export async function deliver(notificationId: string, log: Logger) {
  const [row] = await db.select({ n: notification, email: user.email }).from(notification).innerJoin(user, eq(notification.userId, user.id)).where(eq(notification.id, notificationId));
  if (!row || row.n.emailedAt || !row.n.email) return;
  const link = row.n.link ? `${config.appUrl}${row.n.link}` : config.appUrl;
  const sent = await sendEmail(row.email, row.n.title, `${row.n.body ?? ""}\n\nOpen in FlowDeck: ${link}`.trim());
  if (sent) await db.update(notification).set({ emailedAt: new Date() }).where(eq(notification.id, notificationId));
  log.debug({ event: "notify.delivered", notificationId, emailed: sent });
}

/** Tell only the people who may approve this gate. Platform admins are not notified unless they qualify on their own. */
export async function approvalRequested(gateId: string, log: Logger) {
  const [row] = await db
    .select({ g: approvalGate, rr: runRequest, family: workflowFamily })
    .from(approvalGate)
    .innerJoin(workflowRun, eq(approvalGate.workflowRunId, workflowRun.id))
    .innerJoin(runRequest, eq(workflowRun.runRequestId, runRequest.id))
    .innerJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id))
    .where(eq(approvalGate.id, gateId));
  if (!row || row.g.state !== "pending") return;

  const approverRoles = await db.select({ id: role.id }).from(role).where(sql`${role.permissions} ? 'approval.decide'`);
  const groups = approverRoles.length
    ? [...new Set((await db.select({ g: groupRoleBinding.groupId }).from(groupRoleBinding).where(inArray(groupRoleBinding.roleId, approverRoles.map((r) => r.id)))).map((b) => b.g))]
    : [];
  if (!groups.length) return;
  const groupSet = new Set(groups);
  const candidates = (await db.select({ userId: userAccess.userId, groups: userAccess.groups }).from(userAccess)).filter((u) => u.groups.some((g) => groupSet.has(g)));

  const ctx = await loadApprovalContext();
  let sent = 0;
  for (const c of candidates) {
    const actor = await loadActor(c.userId);
    if (!actor) continue;
    const eligible = canApprove({ ...actor, isPlatformAdmin: false }, { familyId: row.family.id, category: row.family.category, environmentName: row.g.environmentName, reviewers: row.g.reviewers, requestedBy: row.rr.requestedBy }, ctx.rules, ctx.teams);
    if (!eligible.allowed) continue;
    await notify(c.userId, {
      kind: "approval.requested",
      title: `${row.family.title} is waiting for your approval in ${row.g.environmentName}`,
      body: `Branch ${row.rr.ref}.`,
      link: `/runs/${row.rr.id}`,
      email: true,
    });
    sent++;
  }
  log.info({ event: "notify.approval_requested", gateId, recipients: sent });
}

export async function runFinished(runRequestId: string) {
  const [row] = await db.select({ rr: runRequest, family: workflowFamily }).from(runRequest).innerJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id)).where(eq(runRequest.id, runRequestId));
  if (!row?.rr.requestedBy) return;
  const failed = ["failed", "timed_out", "dispatch_failed", "lost"].includes(row.rr.phase);
  const ok = row.rr.phase === "succeeded";
  if (!failed && !ok) return;
  await notify(row.rr.requestedBy, {
    kind: failed ? "run.failed" : "run.succeeded",
    title: `${row.family.title} ${failed ? "failed" : "succeeded"}`,
    body: `Branch ${row.rr.ref}.${row.rr.error ? ` ${row.rr.error}` : ""}`,
    link: `/runs/${runRequestId}`,
    email: failed,
  });
}
