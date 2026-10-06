"use server";

import { z } from "zod";
import { defineAction } from "@/platform/action";
import { decide } from "./service";

export const decideApprovalAction = defineAction(
  {
    name: "approvals.decide",
    input: z.object({ gateId: z.string().uuid(), decision: z.enum(["approve", "reject"]), comment: z.string().max(800).optional() }),
    revalidate: ["/approvals"],
  },
  (input, { actor }) => decide(actor, input.gateId, input.decision, input.comment),
);
