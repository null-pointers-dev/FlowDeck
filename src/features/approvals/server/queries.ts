import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { approvalGate, runRequest, user, workflowFamily, workflowRun } from "@/platform/db/schema";
import type { Actor } from "@/features/access/domain/permissions";
import { canApprove } from "../domain/eligibility";
import { loadApprovalContext } from "./context";

/** Pending gates this person may approve. Nobody else ever sees them here. */
export async function inboxFor(actor: Actor) {
  const rows = await db
    .select({ g: approvalGate, run: workflowRun, rr: runRequest, family: workflowFamily, requester: user.name })
    .from(approvalGate)
    .innerJoin(workflowRun, eq(approvalGate.workflowRunId, workflowRun.id))
    .innerJoin(runRequest, eq(workflowRun.runRequestId, runRequest.id))
    .innerJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id))
    .leftJoin(user, eq(runRequest.requestedBy, user.id))
    .where(and(eq(approvalGate.state, "pending"), eq(approvalGate.runAttempt, workflowRun.runAttempt)))
    .orderBy(asc(approvalGate.createdAt));
  if (!rows.length) return [];
  const ctx = await loadApprovalContext();
  return rows
    .filter((r) =>
      canApprove(actor, { familyId: r.family.id, category: r.family.category, environmentName: r.g.environmentName, reviewers: r.g.reviewers, requestedBy: r.rr.requestedBy }, ctx.rules, ctx.teams).allowed,
    )
    .map((r) => ({
      id: r.g.id,
      environment: r.g.environmentName,
      createdAt: r.g.createdAt.toISOString(),
      error: r.g.error,
      runRequestId: r.rr.id,
      runNumber: r.run.runNumber,
      title: r.family.title,
      ref: r.rr.ref,
      requester: r.requester ?? (r.run.actorLogin ? `@${r.run.actorLogin}` : null),
      inputs: r.rr.inputs,
    }));
}

export type InboxItem = Awaited<ReturnType<typeof inboxFor>>[number];

export async function recentDecisions(actor: Actor) {
  return db
    .select({ id: approvalGate.id, environment: approvalGate.environmentName, decision: approvalGate.decision, state: approvalGate.state, decidedAt: approvalGate.decidedAt, runRequestId: runRequest.id, title: workflowFamily.title })
    .from(approvalGate)
    .innerJoin(workflowRun, eq(approvalGate.workflowRunId, workflowRun.id))
    .innerJoin(runRequest, eq(workflowRun.runRequestId, runRequest.id))
    .innerJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id))
    .where(eq(approvalGate.decidedBy, actor.userId))
    .orderBy(desc(approvalGate.decidedAt))
    .limit(10);
}
