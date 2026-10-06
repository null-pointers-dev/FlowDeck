import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/platform/db";
import { docChunk } from "@/platform/db/schema";
import { embed } from "@/platform/ai";
import type { Logger } from "@/platform/logger";

/** Embeds a family's chunks that have no vector yet, in batches of 16. */
export async function embedFamily(familyId: string, log: Logger) {
  const rows = await db.select({ id: docChunk.id, headingPath: docChunk.headingPath, content: docChunk.content }).from(docChunk).where(and(eq(docChunk.familyId, familyId), isNull(docChunk.embedding)));
  for (let i = 0; i < rows.length; i += 16) {
    const batch = rows.slice(i, i + 16);
    const vectors = await embed(batch.map((r) => `${r.headingPath}\n${r.content}`));
    if (!vectors) return; // AI not configured: full-text search only
    for (const [j, r] of batch.entries()) await db.update(docChunk).set({ embedding: vectors[j] }).where(eq(docChunk.id, r.id));
  }
  log.debug({ event: "search.embedded", familyId, chunks: rows.length });
}
