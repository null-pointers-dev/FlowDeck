"use client";

import { useCallback, useRef, useTransition } from "react";
import { notifications } from "@mantine/notifications";
import type { ActionError, ActionResult } from "@/platform/action";

type Options<T> = {
  /** Shown as a green notification on success. */
  success?: string | ((data: T) => string);
  onSuccess?: (data: T) => void;
  onError?: (error: ActionError) => void;
};

const TITLES: Record<string, string> = {
  forbidden: "Not allowed",
  not_found: "Not found",
  conflict: "Couldn't do that",
  unavailable: "Not set up yet",
  unauthorized: "Signed out",
  stale: "Please reload",
};

/**
 * The one way client components call server actions:
 *
 *   const [pin, pinning] = useServerAction(pinAction, { success: "Pinned to your dashboard" });
 *   <Button loading={pinning} onClick={() => pin({ familyId, ref, savedInputName: null })}>Pin</Button>
 *
 * Runs inside a React transition (so the UI stays responsive and the button shows a spinner),
 * shows Mantine notifications for success and failure, and turns "this action no longer
 * exists after a deploy" into a clear "reload" message.
 */
export function useServerAction<I, T>(action: (input: I) => Promise<ActionResult<T>>, options: Options<T> = {}) {
  const [pending, startTransition] = useTransition();
  const opts = useRef(options);
  opts.current = options;

  const run = useCallback(
    (input: I) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          let result: ActionResult<T>;
          try {
            result = await action(input);
          } catch {
            result = { ok: false, error: { code: "stale", message: "FlowDeck was updated or the connection dropped. Reload the page to continue; nothing was lost." } };
          }
          const o = opts.current;
          if (result.ok) {
            if (o.success) notifications.show({ color: "teal", message: typeof o.success === "function" ? o.success(result.data) : o.success });
            o.onSuccess?.(result.data);
          } else {
            // Field errors are shown next to the fields; everything else as a notification.
            if (!result.error.fieldErrors) notifications.show({ color: "red", title: TITLES[result.error.code] ?? "Something went wrong", message: result.error.message });
            o.onError?.(result.error);
          }
          resolve(result);
        });
      }),
    [action],
  );

  return [run, pending] as const;
}
