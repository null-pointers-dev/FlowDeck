import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { getActor } from "./session";
import { logger, type Logger } from "./logger";
import { AppError } from "./errors";
import { can, type Actor, type Permission, type Resource } from "@/features/access/domain/permissions";

export type ActionError = { code: string; message: string; fieldErrors?: Record<string, string> };
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

type PermissionCheck<I> = Permission | ((input: I) => { permission: Permission; resource?: Resource });

/**
 * Every server action goes through this wrapper:
 * authenticate → validate → authorise → run the service → log → revalidate → typed result.
 * Actions stay thin; business logic lives in services that the worker and a future API can reuse.
 *
 *   export const pinWorkflow = defineAction(
 *     { name: "personal.pin", input: PinInput, permission: "catalog.view", revalidate: ["/"] },
 *     (input, { actor }) => personal.pin(actor, input),
 *   );
 */
export function defineAction<S extends z.ZodType, T>(
  cfg: { name: string; input: S; permission?: PermissionCheck<z.output<S>>; revalidate?: string[] },
  handler: (input: z.output<S>, ctx: { actor: Actor; log: Logger }) => Promise<T>,
): (input: z.input<S>) => Promise<ActionResult<T>> {
  return async (raw) => {
    const started = performance.now();
    const actor = await getActor();
    if (!actor || !actor.hasAccess) return { ok: false, error: { code: "unauthorized", message: "Your session has ended. Sign in again to continue." } };

    const parsed = cfg.input.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
      return { ok: false, error: { code: "invalid", message: "Some fields need attention.", fieldErrors } };
    }

    if (cfg.permission) {
      const check = typeof cfg.permission === "function" ? cfg.permission(parsed.data) : { permission: cfg.permission };
      if (!can(actor, check.permission, check.resource)) {
        logger.warn({ event: "access.denied", action: cfg.name, userId: actor.userId, permission: check.permission });
        return { ok: false, error: { code: "forbidden", message: "You don't have permission to do that." } };
      }
    }

    const log = logger.child({ action: cfg.name, userId: actor.userId });
    try {
      const data = await handler(parsed.data, { actor, log });
      for (const path of cfg.revalidate ?? []) revalidatePath(path);
      log.info({ event: "action.ok", ms: Math.round(performance.now() - started) });
      return { ok: true, data };
    } catch (e) {
      unstable_rethrow(e); // let redirect() and notFound() through
      if (e instanceof AppError) {
        log.warn({ event: "action.rejected", code: e.code, msg: e.message });
        return { ok: false, error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors } };
      }
      const ref = randomUUID().slice(0, 8);
      log.error({ event: "action.failed", ref, err: e });
      return { ok: false, error: { code: "internal", message: `Something went wrong (reference ${ref}). Try again, or share the reference with the platform team.` } };
    }
  };
}
