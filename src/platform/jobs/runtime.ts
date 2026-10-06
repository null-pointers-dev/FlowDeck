import { contracts, queueOf, type JobData, type JobName } from "./contracts";
import { Bull, bullConnection } from "./backend";
import { queueFor } from "./client";
import { logger, type Logger } from "../logger";

/** Worker side only. Never imported by web code. */

type Handler<N extends JobName> = (data: JobData<N>, ctx: { log: Logger; attempt: number }) => Promise<void>;
const handlers = new Map<string, Handler<JobName>>();

export function handle<N extends JobName>(name: N, fn: Handler<N>) {
  handlers.set(name, fn as unknown as Handler<JobName>);
}

/** Thrown when a job should be retried later without logging an error (e.g. a lock is held). */
export class RetryLater extends Error {
  constructor(message = "retry later") {
    super(message);
    this.name = "RetryLater";
  }
}

const CONCURRENCY: Record<string, number> = { runs: 20, approvals: 5, catalog: 2, search: 2, notify: 5, github: 10, insights: 2, access: 1, maintenance: 2 };

export function startWorkers() {
  const queues = [...new Set([...handlers.keys()].map((n) => queueOf(n as JobName)))];
  return queues.map((queueName) => {
    const w = new Bull.Worker(
      queueName,
      async (job) => {
        const name = job.name as JobName;
        const fn = handlers.get(name);
        if (!fn) throw new Error(`No handler for job ${name}`);
        const data = contracts[name].schema.parse(job.data);
        const log = logger.child({ job: name, jobId: job.id, attempt: job.attemptsMade + 1 });
        const started = performance.now();
        await fn(data as never, { log, attempt: job.attemptsMade + 1 });
        log.debug({ event: "job.done", ms: Math.round(performance.now() - started) });
      },
      { ...bullConnection(Math.max(4, CONCURRENCY[queueName] ?? 4)), concurrency: CONCURRENCY[queueName] ?? 4 },
    );
    w.on("failed", (job, err) => {
      if (err instanceof RetryLater) return;
      logger.error({ event: "job.failed", job: job?.name, jobId: job?.id, attempt: job?.attemptsMade, err });
    });
    w.on("error", (err) => logger.error({ event: "worker.error", queue: queueName, err }));
    return w;
  });
}

export async function schedule(id: string, name: JobName, repeat: { every: number } | { pattern: string }, data: Record<string, unknown> = {}) {
  await queueFor(queueOf(name)).upsertJobScheduler(id, repeat, { name, data });
}
