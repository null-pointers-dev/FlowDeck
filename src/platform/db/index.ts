import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const g = globalThis as unknown as { __fdPool?: pg.Pool };

export const pool =
  g.__fdPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  });
if (process.env.NODE_ENV !== "production") g.__fdPool = pool;

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
