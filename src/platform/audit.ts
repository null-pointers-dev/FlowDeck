import { db } from "./db";
import { auditEvent } from "./db/schema";

export async function audit(
  actor: { userId: string; name: string } | null,
  action: string,
  resource: { type: string; id?: string | null },
  data: Record<string, unknown> = {},
) {
  await db.insert(auditEvent).values({
    actorId: actor?.userId ?? null,
    actorName: actor?.name ?? "FlowDeck",
    action,
    resourceType: resource.type,
    resourceId: resource.id ?? null,
    data,
  });
}
