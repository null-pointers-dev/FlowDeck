import { contracts, queueOf, type JobInput, type JobName } from "./contracts";
import { Bull, bullConnection } from "./backend";
import { logger } from "../logger";

type AnyQueue = InstanceType<typeof Bull.Queue>;
const g = globalThis as unknown as { __fdQueues?: Map<string, AnyQueue> };

export function queueFor(queueName: string): AnyQueue {
  g.__fdQueues ??= new Map();
  let q = g.__fdQueues.get(queueName);
  if (!q) {
    q = new Bull.Queue(queueName, {
      ...bullConnection(4),
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 3_600, count: 5_000 },
        removeOnFail: { age: 7 * 24 * 3_600 },
      },
    });
    g.__fdQueues.set(queueName, q);
  }
  return q;
}

/**
 * Start background work. Validates the payload against its contract, then stores the job
 * in Postgres; a worker picks it up even if it is restarting right now.
 */
export async function send<N extends JobName>(name: N, payload: JobInput<N>, opts: { delay?: number } = {}) {
  const c = contracts[name];
  const data = c.schema.parse(payload);
  const dedupe = c.dedupe?.(data as never);
  await queueFor(queueOf(name)).add(name, data, {
    ...(dedupe ? { deduplication: dedupe.ttl ? { id: dedupe.id, ttl: dedupe.ttl } : { id: dedupe.id } } : {}),
    ...(c.attempts ? { attempts: c.attempts } : {}),
    ...(opts.delay ? { delay: opts.delay } : {}),
  });
  logger.debug({ event: "job.sent", job: name });
}

export const jobs = { send };
