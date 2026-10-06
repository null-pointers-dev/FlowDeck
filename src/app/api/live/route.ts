import { actorFromRequest } from "@/platform/session";
import { subscribe } from "@/platform/events";

export const dynamic = "force-dynamic";

/** Server-sent events: tells open pages that something they show has changed. */
export async function GET(req: Request) {
  const actor = await actorFromRequest(req);
  if (!actor?.hasAccess) return new Response("Unauthorized", { status: 401 });
  const requested = (new URL(req.url).searchParams.get("topics") ?? "").split(",").filter((t) => /^(runs|approvals|run:[0-9a-f-]{36})$/.test(t)).slice(0, 5);
  const topics = [...requested, `user:${actor.userId}`];

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          cleanup();
        }
      };
      const cleanup = () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
      };
      unsubscribe = await subscribe(topics, (topic) => send(`data: ${JSON.stringify({ topic })}\n\n`));
      send("retry: 5000\n\n");
      heartbeat = setInterval(() => send(": keep-alive\n\n"), 25_000);
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}
