import { and, eq, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { approvalGate, githubTeamMember, repository, user, workflowRun, type Reviewer } from "@/platform/db/schema";
import { clientFor, getConnection, gh, ghAll, githubMessage, isGitHubError, octokitFor } from "@/platform/github/client";
import { jobs } from "@/platform/jobs/client";
import { publish } from "@/platform/events";
import { audit } from "@/platform/audit";
import type { Logger } from "@/platform/logger";

type Pending = {
  environment: { id: number; name: string };
  reviewers?: Array<{ type: "User" | "Team"; reviewer: { login?: string; slug?: string; name?: string } }>;
};

/** Mirrors GitHub's pending deployment gates for one run. */
export async function syncGates(repositoryId: string, githubRunId: number, log: Logger) {
  const [repo] = await db.select().from(repository).where(eq(repository.id, repositoryId));
  const [run] = await db.select().from(workflowRun).where(eq(workflowRun.githubRunId, githubRunId));
  if (!repo || !run) return;
  const approver = await getConnection(repo.owner, "approver");
  const octokit = approver ? octokitFor(approver) : (await clientFor(repo.owner, "dispatch")).octokit;

  let pending: Pending[] = [];
  try {
    pending = (await gh<Pending[]>(octokit, "GET /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments", { owner: repo.owner, repo: repo.name, run_id: githubRunId })).data ?? [];
  } catch (e) {
    if (!(isGitHubError(e) && e.status === 404)) throw e;
  }

  const now = new Date();
  const seen: number[] = [];
  const created: string[] = [];
  for (const p of pending) {
    seen.push(p.environment.id);
    const reviewers: Reviewer[] = (p.reviewers ?? []).flatMap((r): Reviewer[] =>
      r.type === "Team" && r.reviewer.slug ? [{ type: "Team", slug: r.reviewer.slug, name: r.reviewer.name, org: repo.owner }] : r.type === "User" && r.reviewer.login ? [{ type: "User", login: r.reviewer.login }] : [],
    );
    const [row] = await db
      .insert(approvalGate)
      .values({ workflowRunId: run.id, githubRunId, runAttempt: run.runAttempt, environmentId: p.environment.id, environmentName: p.environment.name, reviewers, state: "pending" })
      .onConflictDoUpdate({ target: [approvalGate.githubRunId, approvalGate.runAttempt, approvalGate.environmentId], set: { environmentName: p.environment.name, reviewers, updatedAt: now } })
      .returning({ id: approvalGate.id, createdAt: approvalGate.createdAt });
    if (row && now.getTime() - row.createdAt.getTime() < 5_000) created.push(row.id);
    for (const r of reviewers) if (r.type === "Team") await jobs.send("approvals.teamSync", { org: r.org, slug: r.slug });
  }

  // Earlier attempts are superseded; gates GitHub no longer lists were settled elsewhere.
  await db.update(approvalGate).set({ state: "closed", updatedAt: now }).where(and(eq(approvalGate.githubRunId, githubRunId), eq(approvalGate.state, "pending"), lt(approvalGate.runAttempt, run.runAttempt)));
  const closed = await db
    .update(approvalGate)
    .set({ state: "closed", updatedAt: now })
    .where(and(eq(approvalGate.githubRunId, githubRunId), eq(approvalGate.state, "pending"), seen.length ? notInArray(approvalGate.environmentId, seen) : sql`true`))
    .returning({ id: approvalGate.id });

  for (const id of created) await jobs.send("notify.approvalRequested", { gateId: id });
  if (pending.length || closed.length) {
    await publish("approvals", { githubRunId });
    if (run.runRequestId) await publish(`run:${run.runRequestId}`, { gates: pending.length });
  }
  log.debug({ event: "approvals.synced", githubRunId, pending: pending.length, closed: closed.length });
}

/** Sends a FlowDeck decision to GitHub with the approver account's token. */
export async function sendDecision(gateId: string, log: Logger) {
  const [row] = await db
    .select({ g: approvalGate, run: workflowRun, repo: repository, decider: user })
    .from(approvalGate)
    .innerJoin(workflowRun, eq(approvalGate.workflowRunId, workflowRun.id))
    .innerJoin(repository, eq(workflowRun.repositoryId, repository.id))
    .leftJoin(user, eq(approvalGate.decidedBy, user.id))
    .where(eq(approvalGate.id, gateId));
  if (!row || row.g.state !== "deciding" || !row.g.decision) return;
  const { g, run, repo, decider } = row;

  const revert = async (message: string) => {
    await db.update(approvalGate).set({ state: "pending", decision: null, decidedBy: null, decidedAt: null, error: message, updatedAt: new Date() }).where(and(eq(approvalGate.id, g.id), eq(approvalGate.state, "deciding")));
    await audit(decider ? { userId: decider.id, name: decider.name } : null, "approval.failed", { type: "approval", id: g.id }, { error: message });
    await publish("approvals", { gateId });
    if (run.runRequestId) await publish(`run:${run.runRequestId}`, { gate: gateId });
  };

  const approver = await getConnection(repo.owner, "approver");
  if (!approver) return revert(`No approver token is set up for ${repo.owner}. An admin can add one under Admin, Connections.`);

  const verb = g.decision === "approve" ? "Approved" : "Rejected";
  const who = decider ? `${decider.name} <${decider.email}>` : "a FlowDeck user";
  try {
    await gh(octokitFor(approver), "POST /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments", {
      owner: repo.owner,
      repo: repo.name,
      run_id: run.githubRunId,
      environment_ids: [g.environmentId],
      state: g.decision === "approve" ? "approved" : "rejected",
      comment: `${verb} by ${who} in FlowDeck${g.comment ? `: ${g.comment}` : "."}`.slice(0, 1000),
    });
  } catch (e) {
    if (isGitHubError(e) && e.status >= 400 && e.status < 500 && e.status !== 429) {
      const hint = e.status === 422 || e.status === 403 ? ` Check that ${approver.actsAs ? `@${approver.actsAs}` : "the approver account"} is a required reviewer for "${g.environmentName}" and isn't the account that started the run.` : "";
      return revert(`${githubMessage(e)}.${hint}`);
    }
    throw e; // transient: retried; stays "deciding"
  }

  await db.update(approvalGate).set({ state: g.decision === "approve" ? "approved" : "rejected", error: null, updatedAt: new Date() }).where(eq(approvalGate.id, g.id));
  await audit(decider ? { userId: decider.id, name: decider.name } : null, g.decision === "approve" ? "approval.approved" : "approval.rejected", { type: "approval", id: g.id }, { environment: g.environmentName, via: approver.actsAs, comment: g.comment });
  log.info({ event: "approval.sent", gateId, decision: g.decision });
  await publish("approvals", { gateId });
  if (run.runRequestId) await publish(`run:${run.runRequestId}`, { gate: gateId });
  await jobs.send("runs.reconcile", { repositoryId: repo.id, githubRunId: run.githubRunId }, { delay: 1_500 });
}

export async function syncTeam(org: string, slug: string, log: Logger) {
  const { octokit } = await clientFor(org, "dispatch");
  let members: Array<{ login: string }>;
  try {
    members = await ghAll(octokit, "GET /orgs/{org}/teams/{team_slug}/members", { org, team_slug: slug });
  } catch (e) {
    log.warn({ event: "approvals.team_unreadable", org, slug, err: githubMessage(e) }, "Give the runs connection read access to organisation members");
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(githubTeamMember).where(and(eq(githubTeamMember.org, org), eq(githubTeamMember.teamSlug, slug)));
    if (members.length) await tx.insert(githubTeamMember).values(members.map((m) => ({ org, teamSlug: slug, login: m.login })));
  });
  await publish("approvals", { team: slug });
}
