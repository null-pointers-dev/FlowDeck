import { z } from "zod";

/**
 * Every background job, its payload, and how duplicates collapse.
 * Web code calls jobs.send(name, payload); the worker registers jobs.handle(name, fn).
 * This file is the only thing they share about background work.
 *
 * The queue is the part of the name before the dot ("runs.dispatch" runs on queue "runs").
 */
const uuid = z.string().uuid();

type Contract<S extends z.ZodType> = {
  schema: S;
  /** Same id while a job is queued = one job. With ttl, only within that window. */
  dedupe?: (p: z.output<S>) => { id: string; ttl?: number };
  attempts?: number;
};
const contract = <S extends z.ZodType>(c: Contract<S>) => c;

export const contracts = {
  "github.webhook": contract({ schema: z.object({ deliveryId: z.string() }), dedupe: (p) => ({ id: `wh-${p.deliveryId}` }) }),

  "runs.dispatch": contract({ schema: z.object({ runRequestId: uuid }), dedupe: (p) => ({ id: `dispatch-${p.runRequestId}` }), attempts: 3 }),
  "runs.resolve": contract({ schema: z.object({ runRequestId: uuid, tries: z.number().int().default(0) }), dedupe: (p) => ({ id: `resolve-${p.runRequestId}`, ttl: 5_000 }), attempts: 3 }),
  "runs.action": contract({
    schema: z.object({ runRequestId: uuid, action: z.enum(["cancel", "rerun", "rerun_failed"]), userId: z.string() }),
    dedupe: (p) => ({ id: `action-${p.runRequestId}-${p.action}`, ttl: 10_000 }),
    attempts: 4,
  }),
  "runs.reconcile": contract({ schema: z.object({ repositoryId: uuid, githubRunId: z.number() }), dedupe: (p) => ({ id: `run-${p.githubRunId}`, ttl: 3_000 }) }),
  "runs.poll": contract({ schema: z.object({ force: z.boolean().optional() }), dedupe: () => ({ id: "poll", ttl: 10_000 }) }),

  "approvals.sync": contract({ schema: z.object({ repositoryId: uuid, githubRunId: z.number() }), dedupe: (p) => ({ id: `gates-${p.githubRunId}`, ttl: 3_000 }) }),
  "approvals.decide": contract({ schema: z.object({ gateId: uuid }), dedupe: (p) => ({ id: `decide-${p.gateId}` }), attempts: 6 }),
  "approvals.teamSync": contract({ schema: z.object({ org: z.string(), slug: z.string() }), dedupe: (p) => ({ id: `team-${p.org}-${p.slug}`, ttl: 600_000 }), attempts: 3 }),

  "catalog.sync": contract({
    schema: z.object({ reason: z.string().default("manual"), requestedBy: z.string().optional() }),
    dedupe: (p) => ({ id: p.requestedBy ? `catalog-sync-${p.requestedBy}` : "catalog-sync", ttl: 30_000 }),
  }),
  "search.embed": contract({ schema: z.object({ familyId: z.string() }), dedupe: (p) => ({ id: `embed-${p.familyId}`, ttl: 5_000 }) }),

  "insights.rollup": contract({ schema: z.object({ familyId: z.string(), ref: z.string(), day: z.string() }), dedupe: (p) => ({ id: `rollup-${p.familyId}-${p.ref}-${p.day}`, ttl: 10_000 }) }),
  "insights.rebuild": contract({ schema: z.object({}) }),

  "notify.deliver": contract({ schema: z.object({ notificationId: uuid }), attempts: 5 }),
  "notify.approvalRequested": contract({ schema: z.object({ gateId: uuid }), dedupe: (p) => ({ id: `notify-gate-${p.gateId}` }) }),
  "notify.runFinished": contract({ schema: z.object({ runRequestId: uuid }), dedupe: (p) => ({ id: `notify-run-${p.runRequestId}` }) }),

  "access.syncGroups": contract({ schema: z.object({}), dedupe: () => ({ id: "sync-groups", ttl: 60_000 }) }),
  "maintenance.housekeeping": contract({ schema: z.object({}) }),
  "maintenance.checkConnection": contract({ schema: z.object({ connectionId: uuid }), attempts: 3 }),
};

export type JobName = keyof typeof contracts;
export type JobInput<N extends JobName> = z.input<(typeof contracts)[N]["schema"]>;
export type JobData<N extends JobName> = z.output<(typeof contracts)[N]["schema"]>;

export const queueOf = (name: JobName) => name.split(".")[0];
export const QUEUES = [...new Set((Object.keys(contracts) as JobName[]).map(queueOf))];
