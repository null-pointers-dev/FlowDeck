"use server";

import { z } from "zod";
import { defineAction } from "@/platform/action";
import { requestRunAction, startRun } from "./service";

const StartRunInput = z.object({
  familyId: z.string().min(1),
  version: z.string().min(1),
  ref: z.string().max(255),
  inputs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  idempotencyKey: z.string().min(8).max(100),
  savedInputName: z.string().max(60).nullish(),
});

/** Thin: validation and permission checks happen in defineAction and the service. */
export const startRunAction = defineAction({ name: "runs.start", input: StartRunInput }, (input, { actor }) => startRun(actor, input));

export const runActionAction = defineAction(
  { name: "runs.action", input: z.object({ runRequestId: z.string().uuid(), action: z.enum(["cancel", "rerun", "rerun_failed"]) }) },
  (input, { actor }) => requestRunAction(actor, input.runRequestId, input.action),
);
