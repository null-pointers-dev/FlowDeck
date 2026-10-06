import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/platform/db";
import { webhookDelivery } from "@/platform/db/schema";
import { jobs } from "@/platform/jobs/client";
import { config } from "@/platform/config";
import { logger } from "@/platform/logger";

export const dynamic = "force-dynamic";

function valid(body: string, signature: string | null) {
  if (!config.webhookSecret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", config.webhookSecret).update(body).digest("hex")}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Verify, store, enqueue, acknowledge in milliseconds. The worker does the rest. */
export async function POST(req: Request) {
  const body = await req.text();
  if (!valid(body, req.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });
  const deliveryId = req.headers.get("x-github-delivery");
  const event = req.headers.get("x-github-event");
  if (!deliveryId || !event) return new Response("Missing headers", { status: 400 });
  if (event === "ping") return new Response("pong");
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    await db
      .insert(webhookDelivery)
      .values({ deliveryId, event, action: typeof payload.action === "string" ? payload.action : null, payload })
      .onConflictDoNothing();
    await jobs.send("github.webhook", { deliveryId });
  } catch (err) {
    logger.error({ event: "webhook.store_failed", deliveryId, err });
    return new Response("Temporarily unavailable", { status: 503 }); // GitHub marks it failed; the minute check covers the gap
  }
  return new Response(null, { status: 202 });
}
