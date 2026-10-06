import { and, eq, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { repository, runRequest, workflowFamily, workflowRun, workflowVersion } from "@/platform/db/schema";
import { jobs } from "@/platform/jobs/client";
import { publish } from "@/platform/events";
import { audit } from "@/platform/audit";
import { conflict, forbidden, invalid, notFound } from "@/platform/errors";
import { can, type Actor } from "@/features/access/domain/permissions";
import { REQUESTED_BY_INPUT, validateInputs, type InputValues } from "../domain/inputs";
import { resolveEnvironment } from "../domain/graph";
import { isTerminal } from "../domain/phases";

export type StartRunInput = {
  familyId: string;
  version: string;
  ref: string;
  inputs: InputValues;
  idempotencyKey: string;
  savedInputName?: string | null;
};

/** Validates, authorises and records a run request, then hands dispatch to the worker. */
export async function startRun(actor: Actor, input: StartRunInput): Promise<{ id: string }> {
  const [row] = await db
    .select({ family: workflowFamily, version: workflowVersion, repo: repository })
    .from(workflowVersion)
    .innerJoin(workflowFamily, eq(workflowVersion.familyId, workflowFamily.id))
    .innerJoin(repository, eq(workflowFamily.repositoryId, repository.id))
    .where(and(eq(workflowVersion.familyId, input.familyId), eq(workflowVersion.version, input.version)));
  if (!row) throw notFound("This workflow version");
  const { family, version, repo } = row;
  if (!version.dispatchable || !version.githubWorkflowId) throw invalid("This workflow can't be started manually.");
  if (version.githubState && version.githubState !== "active") throw conflict("This workflow is disabled on GitHub.");
  if (version.status === "retired") throw conflict("This version is retired. Choose the current version.");

  const fields = version.inputs.map((f) => (f.type === "environment" && !f.options?.length ? { ...f, options: repo.environments.map((e) => e.name) } : f));
  const check = validateInputs(fields, input.inputs);
  if (!check.ok) throw invalid("Some inputs need attention.", check.errors);

  // Every environment the run will reach must be covered by the person's grants.
  const envs = [...new Set(version.jobs.map((j) => resolveEnvironment(j.environment, check.serialized)).filter((e): e is string => !!e))];
  const resource = { category: family.category, familyId: family.id };
  const allowed = envs.length ? envs.every((environment) => can(actor, "workflow.run", { ...resource, environment })) : can(actor, "workflow.run", resource);
  if (!allowed) throw forbidden(envs.length ? `You can't run this workflow in ${envs.join(", ")}.` : "You can't run this workflow.");

  const inputs = { ...check.serialized };
  if (version.inputs.some((f) => f.key === REQUESTED_BY_INPUT)) inputs[REQUESTED_BY_INPUT] = actor.email;
  const ref = input.ref.trim() || repo.defaultBranch;

  const inserted = await db
    .insert(runRequest)
    .values({
      familyId: family.id,
      versionId: version.id,
      ref,
      inputs,
      savedInputName: input.savedInputName ?? null,
      requestedBy: actor.userId,
      idempotencyKey: input.idempotencyKey,
      phase: "pending",
    })
    .onConflictDoNothing({ target: [runRequest.requestedBy, runRequest.idempotencyKey] })
    .returning({ id: runRequest.id });

  if (inserted.length === 0) {
    const [existing] = await db
      .select({ id: runRequest.id })
      .from(runRequest)
      .where(and(eq(runRequest.requestedBy, actor.userId), eq(runRequest.idempotencyKey, input.idempotencyKey)));
    return { id: existing.id };
  }
  const id = inserted[0].id;
  const sensitive = new Set(version.inputs.filter((f) => f.sensitive).map((f) => f.key));
  await audit(actor, "run.requested", { type: "run", id }, {
    workflow: family.id,
    version: version.version,
    ref,
    environments: envs,
    inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, sensitive.has(k) ? "[masked]" : v])),
  });
  await jobs.send("runs.dispatch", { runRequestId: id });
  await publish("runs", { id });
  return { id };
}

export type RunAction = "cancel" | "rerun" | "rerun_failed";

export async function requestRunAction(actor: Actor, runRequestId: string, action: RunAction) {
  const [row] = await db
    .select({ rr: runRequest, run: workflowRun, family: workflowFamily })
    .from(runRequest)
    .innerJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id))
    .leftJoin(workflowRun, eq(workflowRun.runRequestId, runRequest.id))
    .where(eq(runRequest.id, runRequestId));
  if (!row) throw notFound("This run");
  if (!row.run) throw conflict("This run hasn't started on GitHub yet.");
  const resource = { category: row.family.category, familyId: row.family.id };
  const mine = row.rr.requestedBy === actor.userId;
  if (!(can(actor, "run.manage.any", resource) || (mine && can(actor, "run.manage.own", resource)))) {
    throw forbidden("Only the person who started this run or an admin can do that.");
  }
  const terminal = isTerminal(row.run.phase);
  if (action === "cancel" && terminal) throw conflict("This run has already finished.");
  if (action !== "cancel" && !terminal) throw conflict("Wait for the run to finish before rerunning it.");

  await audit(actor, `run.${action}.requested`, { type: "run", id: runRequestId });
  await jobs.send("runs.action", { runRequestId, action, userId: actor.userId });
  await db.update(runRequest).set({ error: null, updatedAt: sql`now()` }).where(eq(runRequest.id, runRequestId));
}
