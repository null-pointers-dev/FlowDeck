/**
 * One-time and on every deploy (idempotent): Postgres extensions and BullMQ's schema.
 * Then run `npm run db:migrate` (or `db:push` locally) for FlowDeck's own tables, then `npm run seed`.
 */
import pg from "pg";
import { runMigrations } from "bullmq";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  // On Azure Flexible Server, first add VECTOR and PG_TRGM to the azure.extensions server parameter.
  await client.query("create extension if not exists vector");
  await client.query("create extension if not exists pg_trgm");
  await runMigrations(client);
  console.log("Extensions ready and BullMQ schema migrated.");
} finally {
  client.release();
  await pool.end();
}
