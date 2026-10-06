"use server";

import { z } from "zod";
import { defineAction } from "@/platform/action";
import { markAllRead } from "./service";

export const markAllReadAction = defineAction({ name: "notify.markAllRead", input: z.object({}) }, (_i, { actor }) => markAllRead(actor.userId));
