"use server";

import { z } from "zod";
import { defineAction } from "@/platform/action";
import { deleteSavedInput, moveDashboardItem, pin, saveInputs, setDefaultSavedInput, unpin } from "./service";

const value = z.union([z.string(), z.number(), z.boolean()]);

export const saveInputsAction = defineAction(
  {
    name: "personal.saveInputs",
    input: z.object({
      familyId: z.string().min(1),
      name: z.string().trim().min(1, "Give it a name").max(40, "40 characters at most").regex(/^[\w .-]+$/, "Letters, numbers, spaces, dots, dashes"),
      ref: z.string().max(255).nullable(),
      inputs: z.record(z.string(), value),
      isDefault: z.boolean(),
    }),
  },
  (input, { actor }) => saveInputs(actor, input),
);

export const deleteSavedInputAction = defineAction({ name: "personal.deleteSavedInput", input: z.object({ id: z.string().uuid() }) }, (i, { actor }) => deleteSavedInput(actor, i.id));

export const toggleDefaultSavedInputAction = defineAction({ name: "personal.defaultSavedInput", input: z.object({ id: z.string().uuid() }) }, (i, { actor }) => setDefaultSavedInput(actor, i.id));

export const pinAction = defineAction(
  { name: "personal.pin", input: z.object({ familyId: z.string().min(1), ref: z.string().min(1).max(255), savedInputName: z.string().max(40).nullable() }), revalidate: ["/"] },
  (i, { actor }) => pin(actor, i),
);

export const unpinAction = defineAction({ name: "personal.unpin", input: z.object({ id: z.string().uuid() }), revalidate: ["/"] }, (i, { actor }) => unpin(actor, i.id));

export const moveDashboardItemAction = defineAction(
  { name: "personal.move", input: z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }), revalidate: ["/"] },
  (i, { actor }) => moveDashboardItem(actor, i.id, i.direction),
);
