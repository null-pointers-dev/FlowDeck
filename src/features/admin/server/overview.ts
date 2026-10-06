import { desc, eq, ilike, isNotNull, max, or, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { appSetting, auditEvent, githubConnection, webhookDelivery, workflowFamily } from "@/platform/db/schema";
import { queueFor } from "@/platform/jobs/client";
import { QUEUES } from "@/platform/jobs/contracts";

export async function health() {
  const [[heartbeat], [lastWebhook], failed, connections, [families]] = await Promise.all([
    db.select().from(appSetting).where(eq(appSetting.key, "worker.heartbeat")),
    db.select({ at: max(webhookDelivery.receivedAt) }).from(webhookDelivery),
    db.select({ id: webhookDelivery.deliveryId, event: webhookDelivery.event, error: webhookDelivery.error, at: webhookDelivery.receivedAt }).from(webhookDelivery).where(isNotNull(webhookDelivery.error)).orderBy(desc(webhookDelivery.receivedAt)).limit(5),
    db.select({ name: githubConnection.name, status: githubConnection.status, expiresAt: githubConnection.expiresAt }).from(githubConnection),
    db.select({ total: sql<number>`count(*)`.mapWith(Number), documented: sql<number>`count(*) filter (where ${workflowFamily.docPath} is not null)`.mapWith(Number) }).from(workflowFamily).where(eq(workflowFamily.present, true)),
  ]);
  const queues = await Promise.all(
    QUEUES.map(async (name) => ({ name, counts: await queueFor(name).getJobCounts("waiting", "active", "delayed", "failed").catch(() => null) })),
  );
  return {
    heartbeat: (heartbeat?.value as { at: number; active: number; queued: number } | undefined) ?? null,
    lastWebhookAt: lastWebhook?.at?.toISOString() ?? null,
    failedWebhooks: failed.map((f) => ({ ...f, at: f.at.toISOString() })),
    connections: connections.map((c) => ({ ...c, expiresAt: c.expiresAt?.toISOString() ?? null })),
    catalog: families ?? { total: 0, documented: 0 },
    queues,
  };
}

export async function retryFailed(queue: string) {
  if (!QUEUES.includes(queue)) return;
  await queueFor(queue).retryJobs({ state: "failed" });
}

export async function listAudit(filter: { q?: string; limit?: number }) {
  const q = filter.q?.trim();
  const rows = await db
    .select()
    .from(auditEvent)
    .where(q ? or(ilike(auditEvent.action, `%${q}%`), ilike(auditEvent.actorName, `%${q}%`), ilike(auditEvent.resourceId, `%${q}%`)) : undefined)
    .orderBy(desc(auditEvent.createdAt))
    .limit(filter.limit ?? 200);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export function toCsv(rows: Awaited<ReturnType<typeof listAudit>>): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["time", "actor", "action", "resource_type", "resource_id", "data"].join(",");
  return [head, ...rows.map((r) => [r.createdAt, r.actorName, r.action, r.resourceType, r.resourceId, JSON.stringify(r.data)].map(esc).join(","))].join("\n");
}

