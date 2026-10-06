import { EventEmitter } from "node:events";
import pg from "pg";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { logger } from "./logger";

/**
 * Live updates over Postgres LISTEN/NOTIFY. Topics: "runs", "approvals", "run:<runRequestId>",
 * "user:<userId>". Payloads stay tiny: pages re-read their data when told something changed.
 */
const CHANNEL = "flowdeck_events";

export async function publish(topic: string, data: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ topic, data }).slice(0, 7000);
  await db.execute(sql`select pg_notify(${CHANNEL}, ${payload})`).catch((err) => logger.warn({ event: "events.publish_failed", err, topic }));
}

type Listener = { emitter: EventEmitter; client: pg.Client | null; starting: Promise<void> | null };
const g = globalThis as unknown as { __fdListener?: Listener };

async function ensureListener(): Promise<EventEmitter> {
  g.__fdListener ??= { emitter: new EventEmitter().setMaxListeners(0), client: null, starting: null };
  const l = g.__fdListener;
  if (l.client) return l.emitter;
  l.starting ??= (async () => {
    // A dedicated connection: LISTEN does not work through a transaction pooler.
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (msg) => {
      try {
        const { topic, data } = JSON.parse(msg.payload ?? "{}");
        l.emitter.emit("event", topic, data);
      } catch {
        // ignore malformed payloads
      }
    });
    client.on("error", (err) => {
      logger.warn({ event: "events.listener_error", err });
      l.client = null;
      l.starting = null;
    });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    l.client = client;
  })();
  await l.starting;
  return l.emitter;
}

export async function subscribe(topics: string[], onEvent: (topic: string, data: unknown) => void): Promise<() => void> {
  const emitter = await ensureListener();
  const wanted = new Set(topics);
  const handler = (topic: string, data: unknown) => {
    if (wanted.has(topic)) onEvent(topic, data);
  };
  emitter.on("event", handler);
  return () => emitter.off("event", handler);
}
