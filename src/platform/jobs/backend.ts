import { createPostgresBackend, withBackend } from "bullmq";

/** BullMQ on PostgreSQL: queues live in the "bullmq" schema of the main database. */
export const Bull = withBackend(createPostgresBackend);

export function bullConnection(poolSize = 4) {
  return { connection: { connectionString: process.env.DATABASE_URL, schema: "bullmq", max: poolSize } };
}
