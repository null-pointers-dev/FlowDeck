import { startTelemetry } from "@/platform/telemetry";
import { logger } from "@/platform/logger";
import { handle, schedule, startWorkers } from "@/platform/jobs/runtime";
import { pool } from "@/platform/db";
import { processWebhook } from "@/features/github/server/webhook";
import { dispatchRun, pollActiveRuns, reconcileRun, resolveRun, runAction } from "@/features/runs/server/jobs";
import { sendDecision, syncGates, syncTeam } from "@/features/approvals/server/jobs";
import { syncCatalog } from "@/features/catalog/server/sync";
import { notify } from "@/features/notify/server/service";
import { embedFamily } from "@/features/search/server/embed";
import { rebuildRecent, rollup } from "@/features/personal/server/insights";
import { approvalRequested, deliver, runFinished } from "@/features/notify/server/jobs";
import { syncEntraGroups } from "@/features/admin/server/access";
import { checkConnection, housekeeping } from "@/features/admin/server/connections";

await startTelemetry("flowdeck-worker");

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error("Missing environment variable DATABASE_URL. Copy .env.example to .env and configure PostgreSQL before starting the worker.");
}

try {
  await pool.query("SELECT 1");
} catch (error) {
  await pool.end().catch(() => undefined);
  throw new Error("Worker startup failed: PostgreSQL is not reachable. Check DATABASE_URL and make sure the database is running.", { cause: error });
}

// One handler per job contract. Web code only ever calls jobs.send(name, payload).
handle("github.webhook", (d, { log }) => processWebhook(d.deliveryId, log));
handle("runs.dispatch", (d, { log }) => dispatchRun(d.runRequestId, log));
handle("runs.resolve", (d, { log }) => resolveRun(d.runRequestId, d.tries, log));
handle("runs.action", (d, { log }) => runAction(d.runRequestId, d.action, d.userId, log));
handle("runs.reconcile", (d, { log }) => reconcileRun(d.repositoryId, d.githubRunId, log));
handle("runs.poll", (d, { log }) => pollActiveRuns(!!d.force, log));
handle("approvals.sync", (d, { log }) => syncGates(d.repositoryId, d.githubRunId, log));
handle("approvals.decide", (d, { log }) => sendDecision(d.gateId, log));
handle("approvals.teamSync", (d, { log }) => syncTeam(d.org, d.slug, log));
handle("catalog.sync", async (d, { log, attempt, attempts }) => {
  try {
    const result = await syncCatalog(log);
    if (!d.requestedBy) return;

    const outcome = result.status === "not_configured"
      ? {
          kind: "catalog.sync.needs_configuration",
          title: "Catalog sync needs configuration",
          body: "No DevOps catalog repository is configured. Check the catalog repository and GitHub connection settings.",
          link: "/admin/connections",
        }
      : result.workflows === 0
        ? {
            kind: "catalog.sync.empty",
            title: "Catalog sync found no workflows",
            body: `Checked ${result.repository}, but no workflow files were found in .github/workflows/.`,
            link: "/workflows",
          }
        : {
            kind: "catalog.sync.completed",
            title: "Catalog sync completed",
            body: `Found ${result.workflows} workflow${result.workflows === 1 ? "" : "s"} across ${result.families} famil${result.families === 1 ? "y" : "ies"} in ${result.repository}; updated ${result.changedDocs} documentation file${result.changedDocs === 1 ? "" : "s"}.`,
            link: "/workflows",
          };
    await notify(d.requestedBy, outcome).catch((err) => log.warn({ event: "catalog.sync_notification_failed", err }));
  } catch (err) {
    if (d.requestedBy && attempt >= attempts) {
      await notify(d.requestedBy, {
        kind: "catalog.sync.failed",
        title: "Catalog sync failed",
        body: "FlowDeck could not complete the catalog sync after several attempts. Check the worker and GitHub connection, then try again.",
        link: "/admin/connections",
      }).catch((notifyErr) => log.warn({ event: "catalog.sync_notification_failed", err: notifyErr }));
    }
    throw err;
  }
});
handle("search.embed", (d, { log }) => embedFamily(d.familyId, log));
handle("insights.rollup", (d) => rollup(d.familyId, d.ref, d.day));
handle("insights.rebuild", () => rebuildRecent());
handle("notify.deliver", (d, { log }) => deliver(d.notificationId, log));
handle("notify.approvalRequested", (d, { log }) => approvalRequested(d.gateId, log));
handle("notify.runFinished", (d) => runFinished(d.runRequestId));
handle("access.syncGroups", (_d, { log }) => syncEntraGroups(log));
handle("maintenance.checkConnection", (d, { log }) => checkConnection(d.connectionId, log));
handle("maintenance.housekeeping", (_d, { log }) => housekeeping(log));

const workers = startWorkers();

// Schedulers emit one job per interval across all worker replicas.
await schedule("poll-active-runs", "runs.poll", { every: 60_000 });
await schedule("housekeeping", "maintenance.housekeeping", { every: 5 * 60_000 });
await schedule("catalog-nightly", "catalog.sync", { pattern: "0 2 * * *" }, { reason: "nightly" });
await schedule("insights-nightly", "insights.rebuild", { pattern: "30 2 * * *" });
await schedule("groups-daily", "access.syncGroups", { pattern: "0 6 * * *" });

logger.info({ event: "worker.started", queues: workers.length });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ event: "worker.stopping", signal });
  await Promise.allSettled(workers.map((w) => w.close())); // finishes active jobs
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
