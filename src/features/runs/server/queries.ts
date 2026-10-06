import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/platform/db";
import { approvalGate, repository, runRequest, user, workflowFamily, workflowJob, workflowRun, workflowVersion } from "@/platform/db/schema";
import { can, type Actor } from "@/features/access/domain/permissions";
import { canApprove, describeReviewers } from "@/features/approvals/domain/eligibility";
import { loadApprovalContext } from "@/features/approvals/server/context";
import { maskInputs } from "../domain/inputs";
import { TERMINAL_PHASES, isTerminal } from "../domain/phases";
import type { LiveJob } from "../domain/graph";

export async function getRunView(actor: Actor, id: string) {
  const [row] = await db
    .select({ rr: runRequest, family: workflowFamily, repo: repository, version: workflowVersion, requester: user, run: workflowRun })
    .from(runRequest)
    .innerJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id))
    .innerJoin(repository, eq(workflowFamily.repositoryId, repository.id))
    .leftJoin(workflowVersion, eq(runRequest.versionId, workflowVersion.id))
    .leftJoin(user, eq(runRequest.requestedBy, user.id))
    .leftJoin(workflowRun, eq(workflowRun.runRequestId, runRequest.id))
    .where(eq(runRequest.id, id));
  if (!row) return null;
  const { rr, family, version, requester, run } = row;
  const resource = { category: family.category, familyId: family.id };
  if (!can(actor, "catalog.view", resource)) return null;

  const jobs = run
    ? await db.select().from(workflowJob).where(and(eq(workflowJob.workflowRunId, run.id), eq(workflowJob.runAttempt, run.runAttempt))).orderBy(asc(workflowJob.startedAt), asc(workflowJob.name))
    : [];
  const gates = run
    ? await db
        .select({ g: approvalGate, decider: user.name })
        .from(approvalGate)
        .leftJoin(user, eq(approvalGate.decidedBy, user.id))
        .where(and(eq(approvalGate.workflowRunId, run.id), eq(approvalGate.runAttempt, run.runAttempt)))
        .orderBy(asc(approvalGate.createdAt))
    : [];
  const ctx = gates.length ? await loadApprovalContext() : null;

  const fields = version?.inputs ?? [];
  const terminal = isTerminal(rr.phase);
  const mine = rr.requestedBy === actor.userId;
  const canManage = can(actor, "run.manage.any", resource) || (mine && can(actor, "run.manage.own", resource));

  return {
    id: rr.id,
    phase: rr.phase,
    source: rr.source,
    ref: rr.ref,
    error: rr.error,
    createdAt: rr.createdAt.toISOString(),
    savedInputName: rr.savedInputName,
    inputs: maskInputs(fields, rr.inputs),
    inputLabels: Object.fromEntries(fields.map((f) => [f.key, f.label])),
    requester: requester ? { name: requester.name, email: requester.email } : null,
    actorLogin: run?.actorLogin ?? rr.actorLogin,
    family: { id: family.id, title: family.title, category: family.category },
    version: version ? { version: version.version, status: version.status } : null,
    htmlUrl: run?.htmlUrl ?? rr.htmlUrl,
    run: run
      ? {
          runNumber: run.runNumber,
          runAttempt: run.runAttempt,
          headBranch: run.headBranch,
          headSha: run.headSha,
          startedAt: run.startedAt?.toISOString() ?? null,
          completedAt: run.completedAt?.toISOString() ?? null,
          lastSyncedAt: run.lastSyncedAt?.toISOString() ?? null,
        }
      : null,
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      htmlUrl: j.htmlUrl,
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
      steps: j.steps,
    })),
    liveJobs: jobs.map((j): LiveJob => ({ name: j.name, status: j.status, conclusion: j.conclusion, startedAt: j.startedAt?.toISOString() ?? null, completedAt: j.completedAt?.toISOString() ?? null })),
    graphJobs: version?.jobs ?? [],
    gates: gates.map(({ g, decider }) => {
      const elig = ctx
        ? canApprove(actor, { familyId: family.id, category: family.category, environmentName: g.environmentName, reviewers: g.reviewers, requestedBy: rr.requestedBy }, ctx.rules, ctx.teams)
        : { allowed: false, reason: "" };
      return {
        id: g.id,
        environment: g.environmentName,
        state: g.state,
        decision: g.decision,
        decidedBy: decider,
        decidedAt: g.decidedAt?.toISOString() ?? null,
        comment: g.comment,
        error: g.error,
        reviewers: describeReviewers(g.reviewers),
        createdAt: g.createdAt.toISOString(),
        canApprove: elig.allowed && g.state === "pending",
        reason: elig.reason,
      };
    }),
    canCancel: !terminal && !!run && canManage,
    canRerun: terminal && !!run && canManage,
    canRunAgain: rr.source === "flowdeck" && can(actor, "workflow.run", resource),
  };
}

export type RunView = NonNullable<Awaited<ReturnType<typeof getRunView>>>;

export type RunsFilter = "mine" | "active" | "waiting" | "failed" | "all";

export async function listRuns(actor: Actor, filter: RunsFilter) {
  const where =
    filter === "mine"
      ? eq(runRequest.requestedBy, actor.userId)
      : filter === "active"
        ? notInArray(runRequest.phase, TERMINAL_PHASES)
        : filter === "waiting"
          ? eq(runRequest.phase, "waiting")
          : filter === "failed"
            ? inArray(runRequest.phase, ["failed", "timed_out", "dispatch_failed", "lost"])
            : undefined;
  const rows = await db
    .select({
      id: runRequest.id,
      phase: runRequest.phase,
      ref: runRequest.ref,
      createdAt: runRequest.createdAt,
      familyId: workflowFamily.id,
      title: workflowFamily.title,
      category: workflowFamily.category,
      requester: user.name,
      actorLogin: runRequest.actorLogin,
      runNumber: workflowRun.runNumber,
      startedAt: workflowRun.startedAt,
      completedAt: workflowRun.completedAt,
    })
    .from(runRequest)
    .innerJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id))
    .leftJoin(user, eq(runRequest.requestedBy, user.id))
    .leftJoin(workflowRun, eq(workflowRun.runRequestId, runRequest.id))
    .where(where)
    .orderBy(desc(runRequest.createdAt))
    .limit(150);
  return rows.filter((r) => can(actor, "catalog.view", { category: r.category, familyId: r.familyId }));
}

export async function myActiveRuns(actor: Actor) {
  return db
    .select({ id: runRequest.id, phase: runRequest.phase, ref: runRequest.ref, title: workflowFamily.title, createdAt: runRequest.createdAt })
    .from(runRequest)
    .innerJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id))
    .where(and(eq(runRequest.requestedBy, actor.userId), notInArray(runRequest.phase, TERMINAL_PHASES)))
    .orderBy(desc(runRequest.createdAt))
    .limit(8);
}
