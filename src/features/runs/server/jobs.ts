import { and, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { db } from "@/platform/db";
import { appSetting, approvalGate, repository, runRequest, workflowJob, workflowRun, workflowVersion, type JobStep } from "@/platform/db/schema";
import { clientFor, gh, githubMessage, isGitHubError } from "@/platform/github/client";
import { jobs } from "@/platform/jobs/client";
import { publish } from "@/platform/events";
import { audit } from "@/platform/audit";
import type { Logger } from "@/platform/logger";
import { parseWorkflow } from "@/features/catalog/domain/parse-workflow";
import { validateInputs } from "../domain/inputs";
import { RANKS, TERMINAL_PHASES, isTerminal, phaseFromGitHub, rank } from "../domain/phases";
import { loadRunContext } from "./context";

const MAX_DISPATCH_ATTEMPTS = 2;
const RESOLVE_TRIES = 8;
const date = (v: string | null | undefined) => (v ? new Date(v) : null);

async function setPhase(id: string, phase: string, extra: Partial<typeof runRequest.$inferInsert> = {}) {
  await db.update(runRequest).set({ ...extra, phase, updatedAt: new Date() }).where(eq(runRequest.id, id));
  await publish(`run:${id}`, { phase });
  await publish("runs", { id });
}

/* ------------------------------------------------------------------ dispatch */

export async function dispatchRun(runRequestId: string, log: Logger) {
  const ctx = await loadRunContext(runRequestId);
  if (!ctx) return;
  if (ctx.rr.phase === "dispatching") return resolveRun(runRequestId, 0, log); // a previous attempt crashed mid-call
  if (ctx.rr.phase !== "pending") return;

  // Claim: only one worker moves pending → dispatching.
  const claimed = await db
    .update(runRequest)
    .set({ phase: "dispatching", dispatchAttempts: sql`${runRequest.dispatchAttempts} + 1`, dispatchStartedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(runRequest.id, runRequestId), eq(runRequest.phase, "pending")))
    .returning({ id: runRequest.id });
  if (!claimed.length) return;
  await publish(`run:${runRequestId}`, { phase: "dispatching" });

  const { rr, repo, version } = ctx;
  if (!version?.githubWorkflowId) return setPhase(runRequestId, "dispatch_failed", { error: "This workflow version is not known to GitHub." });

  let octokit;
  try {
    ({ octokit } = await clientFor(repo.owner, "dispatch"));
  } catch (e) {
    return setPhase(runRequestId, "dispatch_failed", { error: githubMessage(e) });
  }

  // A ref other than the default branch may define different inputs: check against that file.
  if (rr.ref !== repo.defaultBranch) {
    try {
      const file = await gh<{ content?: string }>(octokit, "GET /repos/{owner}/{repo}/contents/{path}", { owner: repo.owner, repo: repo.name, path: version.filePath, ref: rr.ref });
      const parsed = parseWorkflow(Buffer.from(file.data.content ?? "", "base64").toString("utf8"));
      if (!parsed.dispatchable) return setPhase(runRequestId, "dispatch_failed", { error: `On ${rr.ref}, this workflow can't be started manually.` });
      const check = validateInputs(parsed.inputs, rr.inputs);
      if (!check.ok) return setPhase(runRequestId, "dispatch_failed", { error: `The inputs don't match the workflow on ${rr.ref}: ${Object.values(check.errors).join(" ")}` });
    } catch (e) {
      if (isGitHubError(e) && e.status === 404) return setPhase(runRequestId, "dispatch_failed", { error: `The workflow file doesn't exist on ${rr.ref}.` });
      throw e;
    }
  }

  const params = { owner: repo.owner, repo: repo.name, workflow_id: version.githubWorkflowId, ref: rr.ref, inputs: rr.inputs };
  try {
    let runId: number | null = null;
    let htmlUrl: string | null = null;
    try {
      const res = await gh<{ workflow_run_id?: number; html_url?: string }>(octokit, "POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches", { ...params, return_run_details: true });
      runId = res.data?.workflow_run_id ?? null;
      htmlUrl = res.data?.html_url ?? null;
    } catch (e) {
      // GitHub Enterprise Server before 3.21 doesn't know return_run_details.
      if (isGitHubError(e) && e.status === 422 && /return_run_details/i.test(githubMessage(e))) {
        await gh(octokit, "POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches", params);
      } else throw e;
    }
    if (runId) {
      await adoptRun(runRequestId, repo.id, version.githubWorkflowId, runId, htmlUrl);
      log.info({ event: "run.dispatched", runRequestId, githubRunId: runId });
      await jobs.send("runs.reconcile", { repositoryId: repo.id, githubRunId: runId });
    } else {
      await setPhase(runRequestId, "unknown");
      await jobs.send("runs.resolve", { runRequestId, tries: 0 }, { delay: 5_000 });
    }
  } catch (e) {
    if (isGitHubError(e) && e.status >= 400 && e.status < 500 && e.status !== 429) {
      log.warn({ event: "run.dispatch_failed", runRequestId, status: e.status });
      return setPhase(runRequestId, "dispatch_failed", { error: githubMessage(e) });
    }
    // Timeout or 5xx: GitHub may have created the run. Look before ever retrying.
    log.warn({ event: "run.dispatch_unknown", runRequestId, err: githubMessage(e) });
    await setPhase(runRequestId, "unknown", { error: null });
    await jobs.send("runs.resolve", { runRequestId, tries: 0 }, { delay: 10_000 });
  }
}

async function adoptRun(runRequestId: string, repositoryId: string, githubWorkflowId: number, githubRunId: number, htmlUrl: string | null) {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(workflowRun).where(eq(workflowRun.githubRunId, githubRunId));
    if (existing?.runRequestId && existing.runRequestId !== runRequestId) {
      await tx.delete(runRequest).where(and(eq(runRequest.id, existing.runRequestId), eq(runRequest.source, "github")));
    }
    if (existing) await tx.update(workflowRun).set({ runRequestId, updatedAt: new Date() }).where(eq(workflowRun.id, existing.id));
    else await tx.insert(workflowRun).values({ runRequestId, repositoryId, githubWorkflowId, githubRunId, htmlUrl, phase: "queued" });
    await tx
      .update(runRequest)
      .set({ phase: existing && existing.phase !== "queued" ? existing.phase : "dispatched", githubRunId, htmlUrl, error: null, updatedAt: new Date() })
      .where(eq(runRequest.id, runRequestId));
  });
  await publish(`run:${runRequestId}`, { phase: "dispatched" });
  await publish("runs", { id: runRequestId });
}

export async function resolveRun(runRequestId: string, tries: number, log: Logger) {
  const ctx = await loadRunContext(runRequestId);
  if (!ctx || !["unknown", "dispatching"].includes(ctx.rr.phase) || !ctx.version?.githubWorkflowId) return;
  const { rr, repo, version } = ctx;
  const { octokit, connection } = await clientFor(repo.owner, "dispatch");
  const since = new Date((rr.dispatchStartedAt ?? rr.createdAt).getTime() - 60_000).toISOString();
  const { data } = await gh<{ workflow_runs: Array<{ id: number; html_url: string; created_at: string }> }>(octokit, "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs", {
    owner: repo.owner,
    repo: repo.name,
    workflow_id: version.githubWorkflowId,
    event: "workflow_dispatch",
    branch: rr.ref,
    created: `>=${since}`,
    per_page: 30,
    ...(connection.actsAs && !connection.actsAs.endsWith("[bot]") ? { actor: connection.actsAs } : {}),
  });
  const candidates = data.workflow_runs ?? [];
  const ids = candidates.map((r) => r.id);
  const taken = new Set(
    ids.length ? (await db.select({ id: runRequest.githubRunId }).from(runRequest).where(and(inArray(runRequest.githubRunId, ids), eq(runRequest.source, "flowdeck")))).map((r) => r.id) : [],
  );
  const free = candidates.filter((c) => !taken.has(c.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (free.length) {
    log.info({ event: "run.adopted_after_unknown", runRequestId, githubRunId: free[0].id });
    await adoptRun(runRequestId, repo.id, version.githubWorkflowId, free[0].id, free[0].html_url);
    await jobs.send("runs.reconcile", { repositoryId: repo.id, githubRunId: free[0].id });
    return;
  }
  if (tries + 1 < RESOLVE_TRIES) return jobs.send("runs.resolve", { runRequestId, tries: tries + 1 }, { delay: 15_000 });
  if (rr.dispatchAttempts < MAX_DISPATCH_ATTEMPTS) {
    await setPhase(runRequestId, "pending");
    await jobs.send("runs.dispatch", { runRequestId });
  } else {
    await setPhase(runRequestId, "dispatch_failed", { error: "GitHub didn't confirm that the run started. Check GitHub, then run it again if needed." });
  }
}

/* ------------------------------------------------------------------ cancel / rerun */

export async function runAction(runRequestId: string, action: "cancel" | "rerun" | "rerun_failed", userId: string, log: Logger) {
  const ctx = await loadRunContext(runRequestId);
  if (!ctx?.run) return;
  const { repo, run } = ctx;
  const { octokit } = await clientFor(repo.owner, "dispatch");
  const base = { owner: repo.owner, repo: repo.name, run_id: run.githubRunId };
  try {
    if (action === "cancel") {
      if (isTerminal(run.phase)) return;
      await gh(octokit, "POST /repos/{owner}/{repo}/actions/runs/{run_id}/cancel", base);
    } else if (action === "rerun_failed") {
      await gh(octokit, "POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs", base);
    } else {
      await gh(octokit, "POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun", base);
    }
    await audit({ userId, name: "" }, `run.${action}.sent`, { type: "run", id: runRequestId }, { githubRunId: run.githubRunId });
  } catch (e) {
    if (isGitHubError(e) && e.status >= 400 && e.status < 500) {
      log.warn({ event: "run.action_rejected", action, status: e.status });
      await db.update(runRequest).set({ error: githubMessage(e), updatedAt: new Date() }).where(eq(runRequest.id, runRequestId));
      await publish(`run:${runRequestId}`, { error: true });
      return;
    }
    throw e;
  }
  await jobs.send("runs.reconcile", { repositoryId: repo.id, githubRunId: run.githubRunId }, { delay: 2_000 });
}

/* ------------------------------------------------------------------ reconcile */

type GhRun = {
  id: number;
  workflow_id: number;
  path?: string;
  run_number: number;
  run_attempt?: number;
  event: string;
  status: string | null;
  conclusion: string | null;
  head_branch: string | null;
  head_sha: string;
  html_url: string;
  run_started_at?: string | null;
  created_at: string;
  updated_at: string;
  actor?: { login: string } | null;
  triggering_actor?: { login: string } | null;
};

type GhJob = {
  id: number;
  run_attempt?: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string | null;
  steps?: Array<{ number: number; name: string; status: string; conclusion: string | null; started_at?: string | null; completed_at?: string | null }>;
};

/** SQL CASE for the phase rank, generated from the same table the domain code uses (constants only). */
const rankOf = (column: string) =>
  sql.raw(`(case ${column} ${Object.entries(RANKS).map(([p, r]) => `when '${p}' then ${r}`).join(" ")} else 0 end)`);

/** Reads the run from GitHub and merges it in, never moving backwards within an attempt. */
export async function reconcileRun(repositoryId: string, githubRunId: number, log: Logger) {
  await reconcile(repositoryId, githubRunId, log);
}

async function reconcile(repositoryId: string, githubRunId: number, log: Logger) {
  const [repo] = await db.select().from(repository).where(eq(repository.id, repositoryId));
  if (!repo) return;
  const [cur] = await db.select().from(workflowRun).where(eq(workflowRun.githubRunId, githubRunId));
  const { octokit } = await clientFor(repo.owner, "dispatch");
  const now = new Date();

  let data: GhRun;
  let etag: string | null = null;
  try {
    const res = await gh<GhRun>(octokit, "GET /repos/{owner}/{repo}/actions/runs/{run_id}", {
      owner: repo.owner,
      repo: repo.name,
      run_id: githubRunId,
      headers: cur?.etag ? { "if-none-match": cur.etag } : {},
    });
    data = res.data;
    etag = res.headers.etag ?? null;
  } catch (e) {
    if (isGitHubError(e) && e.status === 304) {
      if (cur) {
        await db.update(workflowRun).set({ lastSyncedAt: now, notFoundCount: 0 }).where(eq(workflowRun.id, cur.id));
        if (!isTerminal(cur.phase)) await syncJobs(octokit, repo, cur.id, githubRunId, cur.runAttempt, cur.jobsEtag, cur.runRequestId);
      }
      return;
    }
    if (isGitHubError(e) && e.status === 404) {
      if (!cur) return;
      const misses = cur.notFoundCount + 1;
      await db.update(workflowRun).set({ notFoundCount: misses, lastSyncedAt: now, ...(misses >= 3 ? { phase: "lost" } : {}) }).where(eq(workflowRun.id, cur.id));
      if (misses >= 3 && cur.runRequestId) await setPhase(cur.runRequestId, "lost");
      return;
    }
    throw e;
  }

  const attempt = data.run_attempt ?? 1;
  const incoming = phaseFromGitHub(data.status, data.conclusion);
  if (cur && attempt < cur.runAttempt) return; // stale attempt
  const sameAttempt = !!cur && attempt === cur.runAttempt;
  const phase = !cur || !sameAttempt || rank(incoming) >= rank(cur.phase) || cur.phase === "lost" ? incoming : cur.phase;
  const becameTerminal = isTerminal(phase) && (!cur || !isTerminal(cur.phase) || !sameAttempt);

  const values = {
    repositoryId: repo.id,
    githubRunId,
    githubWorkflowId: data.workflow_id,
    runAttempt: attempt,
    runNumber: data.run_number,
    status: data.status,
    conclusion: data.conclusion,
    phase,
    headBranch: data.head_branch,
    headSha: data.head_sha,
    actorLogin: data.triggering_actor?.login ?? data.actor?.login ?? null,
    htmlUrl: data.html_url,
    etag,
    notFoundCount: 0,
    startedAt: date(data.run_started_at) ?? date(data.created_at),
    completedAt: data.status === "completed" ? date(data.updated_at) : null,
    lastSyncedAt: now,
    updatedAt: now,
  };
  const [saved] = await db
    .insert(workflowRun)
    .values(values)
    .onConflictDoUpdate({
      target: workflowRun.githubRunId,
      set: { ...values, ...(sameAttempt ? {} : { jobsEtag: null }) },
      // Concurrent reconciles can't regress a run: the database applies the same monotonic rule.
      setWhere: sql`${workflowRun.runAttempt} < excluded.run_attempt or (${workflowRun.runAttempt} = excluded.run_attempt and (${rankOf("excluded.phase")} >= ${rankOf("workflow_run.phase")} or workflow_run.phase = 'lost'))`,
    })
    .returning();
  if (!saved) {
    log.debug({ event: "run.stale_observation", githubRunId });
    return;
  }

  // Link to a run request. Runs started on GitHub get an "observed" request so they appear too.
  let runRequestId = saved.runRequestId;
  if (!runRequestId) {
    const [byRun] = await db.select({ id: runRequest.id }).from(runRequest).where(eq(runRequest.githubRunId, githubRunId));
    if (byRun) runRequestId = byRun.id;
    else {
      const [version] = await db.select({ id: workflowVersion.id, familyId: workflowVersion.familyId }).from(workflowVersion).where(eq(workflowVersion.githubWorkflowId, data.workflow_id)).limit(1);
      if (version) {
        const [created] = await db
          .insert(runRequest)
          .values({ familyId: version.familyId, versionId: version.id, source: "github", ref: data.head_branch ?? "", inputs: {}, phase, githubRunId, htmlUrl: data.html_url, actorLogin: values.actorLogin, createdAt: date(data.created_at) ?? now })
          .returning({ id: runRequest.id });
        runRequestId = created.id;
      }
    }
    if (runRequestId) await db.update(workflowRun).set({ runRequestId }).where(eq(workflowRun.id, saved.id));
  }

  if (runRequestId) {
    await db
      .update(runRequest)
      .set({ phase, htmlUrl: data.html_url, actorLogin: values.actorLogin, updatedAt: now, ...(sameAttempt ? {} : { error: null }) })
      .where(eq(runRequest.id, runRequestId));
  }

  await syncJobs(octokit, repo, saved.id, githubRunId, attempt, sameAttempt ? cur?.jobsEtag ?? null : null, runRequestId);

  const [{ open }] = (await db
    .select({ open: sql<number>`count(*)`.mapWith(Number) })
    .from(approvalGate)
    .where(and(eq(approvalGate.githubRunId, githubRunId), inArray(approvalGate.state, ["pending", "deciding"])))) as Array<{ open: number }>;
  if (phase === "waiting" || open > 0) await jobs.send("approvals.sync", { repositoryId: repo.id, githubRunId });

  if (runRequestId) {
    await publish(`run:${runRequestId}`, { phase });
    if (!cur || cur.phase !== phase) await publish("runs", { id: runRequestId });
    if (becameTerminal) {
      await jobs.send("notify.runFinished", { runRequestId });
      const [rr] = await db.select({ familyId: runRequest.familyId, ref: runRequest.ref, createdAt: runRequest.createdAt }).from(runRequest).where(eq(runRequest.id, runRequestId));
      if (rr) await jobs.send("insights.rollup", { familyId: rr.familyId, ref: rr.ref, day: rr.createdAt.toISOString().slice(0, 10) });
    }
  }
  log.debug({ event: "run.reconciled", githubRunId, phase });
}

async function syncJobs(
  octokit: Awaited<ReturnType<typeof clientFor>>["octokit"],
  repo: { owner: string; name: string },
  workflowRunId: string,
  githubRunId: number,
  attempt: number,
  jobsEtag: string | null,
  runRequestId: string | null,
) {
  let list: GhJob[];
  let etag: string | null = null;
  try {
    const res = await gh<{ total_count: number; jobs: GhJob[] }>(octokit, "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs", {
      owner: repo.owner,
      repo: repo.name,
      run_id: githubRunId,
      attempt_number: attempt,
      per_page: 100,
      headers: jobsEtag ? { "if-none-match": jobsEtag } : {},
    });
    list = res.data.jobs;
    etag = res.headers.etag ?? null;
    if (res.data.total_count > list.length) {
      list = (await octokit.paginate("GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs" as string, {
        owner: repo.owner,
        repo: repo.name,
        run_id: githubRunId,
        attempt_number: attempt,
        per_page: 100,
      })) as GhJob[];
    }
  } catch (e) {
    if (isGitHubError(e) && e.status === 304) return;
    throw e;
  }
  for (const j of list) {
    const steps: JobStep[] = (j.steps ?? []).map((s) => ({ number: s.number, name: s.name, status: s.status, conclusion: s.conclusion, startedAt: s.started_at ?? null, completedAt: s.completed_at ?? null }));
    const values = {
      workflowRunId,
      githubJobId: j.id,
      runAttempt: j.run_attempt ?? attempt,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      steps,
      htmlUrl: j.html_url,
      startedAt: date(j.started_at),
      completedAt: date(j.completed_at),
    };
    await db.insert(workflowJob).values(values).onConflictDoUpdate({ target: workflowJob.githubJobId, set: values });
  }
  await db.update(workflowRun).set({ jobsEtag: etag }).where(eq(workflowRun.id, workflowRunId));
  if (runRequestId) await publish(`run:${runRequestId}`, { jobs: list.length });
}

/* ------------------------------------------------------------------ the 60-second check */

/**
 * Runs every minute whether or not webhooks work: re-checks every unfinished run that no
 * webhook touched in the last 30 seconds, retries unknown dispatches and stuck decisions.
 */
export async function pollActiveRuns(force: boolean, log: Logger) {
  const now = Date.now();
  const cutoff = new Date(now - 30_000);
  const active = await db
    .select({ repositoryId: workflowRun.repositoryId, githubRunId: workflowRun.githubRunId, lastWebhookAt: workflowRun.lastWebhookAt })
    .from(workflowRun)
    .where(notInArray(workflowRun.phase, TERMINAL_PHASES))
    .limit(5_000);
  let queued = 0;
  for (const r of active) {
    if (force || !r.lastWebhookAt || r.lastWebhookAt < cutoff) {
      await jobs.send("runs.reconcile", { repositoryId: r.repositoryId, githubRunId: r.githubRunId });
      queued++;
    }
  }
  const stuck = await db
    .select({ id: runRequest.id, phase: runRequest.phase })
    .from(runRequest)
    .where(and(inArray(runRequest.phase, ["pending", "dispatching", "unknown"]), lt(runRequest.updatedAt, new Date(now - 90_000))));
  for (const s of stuck) {
    if (s.phase === "pending") await jobs.send("runs.dispatch", { runRequestId: s.id });
    else await jobs.send("runs.resolve", { runRequestId: s.id, tries: 0 });
  }
  const deciding = await db
    .select({ id: approvalGate.id })
    .from(approvalGate)
    .where(and(eq(approvalGate.state, "deciding"), lt(approvalGate.updatedAt, new Date(now - 120_000))));
  for (const d of deciding) await jobs.send("approvals.decide", { gateId: d.id });

  const heartbeat = { at: now, active: active.length, queued, stuck: stuck.length, deciding: deciding.length };
  await db.insert(appSetting).values({ key: "worker.heartbeat", value: heartbeat }).onConflictDoUpdate({ target: appSetting.key, set: { value: heartbeat, updatedAt: new Date() } });
  if (queued || stuck.length || deciding.length) log.info({ event: "runs.polled", ...heartbeat });
}
