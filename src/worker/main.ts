import { startTelemetry } from "@/platform/telemetry";
import { logger } from "@/platform/logger";
import { handle, schedule, startWorkers } from "@/platform/jobs/runtime";
import { pool } from "@/platform/db";
import { processWebhook } from "@/features/github/server/webhook";
import { dispatchRun, pollActiveRuns, reconcileRun, resolveRun, runAction } from "@/features/runs/server/jobs";
import { sendDecision, syncGates, syncTeam } from "@/features/approvals/server/jobs";
import { syncCatalog } from "@/features/catalog/server/sync";
import { embedFamily } from "@/features/search/server/embed";
import { rebuildRecent, rollup } from "@/features/personal/server/insights";
import { approvalRequested, deliver, runFinished } from "@/features/notify/server/jobs";
import { syncEntraGroups } from "@/features/admin/server/access";
import { checkConnection, housekeeping } from "@/features/admin/server/connections";

await startTelemetry("flowdeck-worker");

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
handle("catalog.sync", (_d, { log }) => syncCatalog(log));
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
