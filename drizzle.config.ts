import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env");
} catch {
  // optional
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/platform/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // BullMQ owns the "bullmq" schema; drizzle only manages "public".
  schemaFilter: ["public"],
  strict: true,
});
