import { eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { repository, webhookDelivery, workflowRun } from "@/platform/db/schema";
import { jobs } from "@/platform/jobs/client";
import type { Logger } from "@/platform/logger";

type Payload = Record<string, any>;

/** Turns a stored GitHub webhook into jobs. Never calls GitHub itself. */
export async function processWebhook(deliveryId: string, log: Logger) {
  const [row] = await db.select().from(webhookDelivery).where(eq(webhookDelivery.deliveryId, deliveryId));
  if (!row || row.processedAt) return;
  const p = row.payload as Payload;
  try {
    const repo = p.repository?.id ? (await db.select({ id: repository.id }).from(repository).where(eq(repository.githubId, p.repository.id)))[0] : undefined;
    const run = async (githubRunId: number | undefined, gates: boolean) => {
      if (!repo || !githubRunId) return;
      await db.update(workflowRun).set({ lastWebhookAt: new Date() }).where(eq(workflowRun.githubRunId, githubRunId));
      await jobs.send("runs.reconcile", { repositoryId: repo.id, githubRunId });
      if (gates) await jobs.send("approvals.sync", { repositoryId: repo.id, githubRunId }, { delay: 1_000 });
    };
    switch (row.event) {
      case "workflow_run":
        await run(p.workflow_run?.id, false);
        break;
      case "workflow_job":
        await run(p.workflow_job?.run_id, p.action === "waiting");
        break;
      case "deployment_review":
      case "deployment_status":
        await run(p.workflow_run?.id, true);
        break;
      case "push": {
        const touched = (p.commits ?? []).some((c: Payload) =>
          [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])].some((f: string) => f.startsWith(".github/workflows/") || f.startsWith("docs/workflows/") || f.startsWith("catalog/")),
        );
        if (touched && p.ref === `refs/heads/${p.repository?.default_branch}`) await jobs.send("catalog.sync", { reason: "push" });
        break;
      }
      default:
        break;
    }
    await db.update(webhookDelivery).set({ processedAt: new Date(), error: null }).where(eq(webhookDelivery.deliveryId, deliveryId));
  } catch (e) {
    await db.update(webhookDelivery).set({ error: e instanceof Error ? e.message : String(e) }).where(eq(webhookDelivery.deliveryId, deliveryId));
    log.warn({ event: "webhook.failed", deliveryId, err: e });
    throw e;
  }
}
