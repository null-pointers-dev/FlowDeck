/** Built-in roles and the default approval rule. Safe to run repeatedly. */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/platform/db/schema";
import { BUILT_IN_ROLES } from "../src/features/access/domain/permissions";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });

for (const r of BUILT_IN_ROLES) {
  await db
    .insert(schema.role)
    .values({ key: r.key, name: r.name, description: r.description, permissions: r.permissions, builtIn: true })
    .onConflictDoNothing({ target: schema.role.key });
}
const existing = await db.select().from(schema.approvalRule).where(eq(schema.approvalRule.environmentName, "*"));
if (!existing.some((r) => !r.familyId)) {
  await db.insert(schema.approvalRule).values({ familyId: null, environmentName: "*", mode: "github", approverGroupIds: [], preventSelfApproval: true });
}
console.log("Seeded built-in roles and the default approval rule (Mirror GitHub).");
await pool.end();
