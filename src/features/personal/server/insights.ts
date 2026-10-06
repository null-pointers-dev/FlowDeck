import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { dashboardItem, runRequest, workflowDailyStat, workflowFamily, workflowRun } from "@/platform/db/schema";
import { jobs } from "@/platform/jobs/client";
import { can, type Actor } from "@/features/access/domain/permissions";

/** Recomputes one family + branch + day in the rollup table. */
export async function rollup(familyId: string, ref: string, day: string) {
  await db.execute(sql`
    insert into workflow_daily_stat (family_id, ref, day, runs, successes, failures, p50_seconds, p90_seconds, approval_wait_seconds)
    select rr.family_id, rr.ref, ${day}::date,
      count(*),
      count(*) filter (where rr.phase = 'succeeded'),
      count(*) filter (where rr.phase in ('failed', 'timed_out')),
      percentile_cont(0.5) within group (order by extract(epoch from (wr.completed_at - wr.started_at))),
      percentile_cont(0.9) within group (order by extract(epoch from (wr.completed_at - wr.started_at))),
      (select avg(extract(epoch from (g.decided_at - g.created_at)))
         from approval_gate g join workflow_run w2 on w2.id = g.workflow_run_id join run_request r2 on r2.id = w2.run_request_id
         where r2.family_id = ${familyId} and r2.ref = ${ref} and r2.created_at::date = ${day}::date and g.decided_at is not null)
    from run_request rr left join workflow_run wr on wr.run_request_id = rr.id
    where rr.family_id = ${familyId} and rr.ref = ${ref} and rr.created_at::date = ${day}::date
      and rr.phase in ('succeeded', 'failed', 'timed_out', 'cancelled', 'completed')
    group by rr.family_id, rr.ref
    on conflict (family_id, ref, day) do update set
      runs = excluded.runs, successes = excluded.successes, failures = excluded.failures,
      p50_seconds = excluded.p50_seconds, p90_seconds = excluded.p90_seconds, approval_wait_seconds = excluded.approval_wait_seconds`);
}

/** Nightly: recompute the last two days for every family and branch that ran. */
export async function rebuildRecent() {
  const res = (await db.execute(sql`select distinct family_id, ref, created_at::date::text as day from run_request where created_at > now() - interval '2 days'`)) as unknown as {
    rows: Array<{ family_id: string; ref: string; day: string }>;
  };
  for (const r of res.rows) await jobs.send("insights.rollup", { familyId: r.family_id, ref: r.ref, day: r.day });
}

export type DashboardCard = Awaited<ReturnType<typeof dashboardCards>>[number];

/** Everything a dashboard card shows, for each pinned workflow and branch. */
export async function dashboardCards(actor: Actor) {
  const items = await db
    .select({ item: dashboardItem, family: workflowFamily })
    .from(dashboardItem)
    .innerJoin(workflowFamily, eq(dashboardItem.familyId, workflowFamily.id))
    .where(eq(dashboardItem.userId, actor.userId))
    .orderBy(asc(dashboardItem.position), asc(dashboardItem.createdAt));
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  return Promise.all(
    items
      .filter(({ family }) => can(actor, "catalog.view", { category: family.category, familyId: family.id }))
      .map(async ({ item, family }) => {
        const [last] = await db
          .select({ id: runRequest.id, phase: runRequest.phase, createdAt: runRequest.createdAt, actorLogin: runRequest.actorLogin, requestedBy: runRequest.requestedBy, startedAt: workflowRun.startedAt, completedAt: workflowRun.completedAt })
          .from(runRequest)
          .leftJoin(workflowRun, eq(workflowRun.runRequestId, runRequest.id))
          .where(and(eq(runRequest.familyId, family.id), eq(runRequest.ref, item.ref)))
          .orderBy(desc(runRequest.createdAt))
          .limit(1);
        const [stats] = await db
          .select({
            runs: sql<number>`coalesce(sum(${workflowDailyStat.runs}), 0)`.mapWith(Number),
            successes: sql<number>`coalesce(sum(${workflowDailyStat.successes}), 0)`.mapWith(Number),
            p50: sql<number | null>`avg(${workflowDailyStat.p50Seconds})`.mapWith((v) => (v === null ? null : Number(v))),
          })
          .from(workflowDailyStat)
          .where(and(eq(workflowDailyStat.familyId, family.id), eq(workflowDailyStat.ref, item.ref), gte(workflowDailyStat.day, since)));
        const durations = await db
          .select({ s: sql<number>`extract(epoch from (${workflowRun.completedAt} - ${workflowRun.startedAt}))`.mapWith(Number) })
          .from(runRequest)
          .innerJoin(workflowRun, eq(workflowRun.runRequestId, runRequest.id))
          .where(and(eq(runRequest.familyId, family.id), eq(runRequest.ref, item.ref), isNotNull(workflowRun.completedAt), isNotNull(workflowRun.startedAt)))
          .orderBy(desc(runRequest.createdAt))
          .limit(20);
        return {
          id: item.id,
          familyId: family.id,
          title: family.title,
          ref: item.ref,
          savedInputName: item.savedInputName,
          lastRun: last ? { id: last.id, phase: last.phase, at: last.createdAt.toISOString(), durationSeconds: last.startedAt && last.completedAt ? (last.completedAt.getTime() - last.startedAt.getTime()) / 1000 : null } : null,
          runs30d: stats?.runs ?? 0,
          successRate: stats && stats.runs > 0 ? Math.round((stats.successes / stats.runs) * 100) : null,
          medianSeconds: stats?.p50 ?? null,
          durations: durations.map((d) => Math.round(d.s)).reverse(),
        };
      }),
  );
}

/** A few numbers for the top of Home. */
export async function homeTiles(actor: Actor) {
  const res = (await db.execute(sql`
    select
      count(*) filter (where rr.created_at > now() - interval '7 days') as runs_week,
      count(*) filter (where rr.created_at > now() - interval '30 days' and rr.phase = 'succeeded') as ok_30d,
      count(*) filter (where rr.created_at > now() - interval '30 days' and rr.phase in ('succeeded','failed','timed_out')) as done_30d,
      (select percentile_cont(0.5) within group (order by extract(epoch from (g.decided_at - g.created_at)))
         from approval_gate g join workflow_run w on w.id = g.workflow_run_id join run_request r on r.id = w.run_request_id
         where r.requested_by = ${actor.userId} and g.decided_at is not null and g.created_at > now() - interval '30 days') as approval_wait
    from run_request rr where rr.requested_by = ${actor.userId}`)) as unknown as { rows: Array<Record<string, string | number | null>> };
  const r = res.rows[0] ?? {};
  const done = Number(r.done_30d ?? 0);
  return {
    runsThisWeek: Number(r.runs_week ?? 0),
    successRate: done ? Math.round((Number(r.ok_30d ?? 0) / done) * 100) : null,
    medianApprovalWaitSeconds: r.approval_wait === null || r.approval_wait === undefined ? null : Number(r.approval_wait),
  };
}
