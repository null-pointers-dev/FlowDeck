import { and, eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { approvalGate, runRequest, workflowFamily, workflowRun } from "@/platform/db/schema";
import { jobs } from "@/platform/jobs/client";
import { publish } from "@/platform/events";
import { audit } from "@/platform/audit";
import { conflict, forbidden, notFound } from "@/platform/errors";
import type { Actor } from "@/features/access/domain/permissions";
import { canApprove } from "../domain/eligibility";
import { loadApprovalContext } from "./context";

/** Records a decision and hands it to the worker, which sends it to GitHub with the approver token. */
export async function decide(actor: Actor, gateId: string, decision: "approve" | "reject", comment?: string | null) {
  const [row] = await db
    .select({ g: approvalGate, rr: runRequest, family: workflowFamily })
    .from(approvalGate)
    .innerJoin(workflowRun, eq(approvalGate.workflowRunId, workflowRun.id))
    .leftJoin(runRequest, eq(workflowRun.runRequestId, runRequest.id))
    .leftJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id))
    .where(eq(approvalGate.id, gateId));
  if (!row || !row.family) throw notFound("This approval");

  const ctx = await loadApprovalContext();
  const elig = canApprove(
    actor,
    { familyId: row.family.id, category: row.family.category, environmentName: row.g.environmentName, reviewers: row.g.reviewers, requestedBy: row.rr?.requestedBy ?? null },
    ctx.rules,
    ctx.teams,
  );
  if (!elig.allowed) {
    await audit(actor, "approval.denied", { type: "approval", id: gateId }, { reason: elig.reason });
    throw forbidden(elig.reason);
  }

  // Compare-and-swap: one decision wins.
  const won = await db
    .update(approvalGate)
    .set({ state: "deciding", decision, comment: comment?.trim() || null, decidedBy: actor.userId, decidedAt: new Date(), error: null, updatedAt: new Date() })
    .where(and(eq(approvalGate.id, gateId), eq(approvalGate.state, "pending")))
    .returning({ id: approvalGate.id });
  if (!won.length) throw conflict("Someone already decided this, or GitHub closed it.");

  await audit(actor, decision === "approve" ? "approval.approve_requested" : "approval.reject_requested", { type: "approval", id: gateId }, { environment: row.g.environmentName, comment: comment ?? null });
  await jobs.send("approvals.decide", { gateId });
  await publish("approvals", { gateId });
  if (row.rr) await publish(`run:${row.rr.id}`, { gate: gateId });
}
