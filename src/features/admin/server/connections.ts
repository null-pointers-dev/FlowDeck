import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { appSetting, githubConnection, webhookDelivery } from "@/platform/db/schema";
import { encryptJson } from "@/platform/crypto";
import { appOctokitFor, gh, githubMessage, octokitFor } from "@/platform/github/client";
import { jobs } from "@/platform/jobs/client";
import { audit } from "@/platform/audit";
import { invalid } from "@/platform/errors";
import type { Logger } from "@/platform/logger";
import type { Actor } from "@/features/access/domain/permissions";

export type SaveConnectionInput = {
  owner: string;
  purpose: "dispatch" | "approver";
  kind: "pat" | "app";
  name?: string;
  token?: string;
  appId?: string;
  installationId?: string;
  privateKey?: string;
};

export async function listConnections() {
  const rows = await db.select().from(githubConnection).orderBy(asc(githubConnection.owner), asc(githubConnection.purpose));
  const limits = await db.select().from(appSetting).where(sql`${appSetting.key} like 'ratelimit:%'`);
  const quota = new Map(limits.map((l) => [l.key.slice("ratelimit:".length), l.value as { remaining: number; limit: number }]));
  // Never return secrets.
  return rows.map(({ encryptedSecret: _s, ...c }) => ({ ...c, quota: quota.get(c.id) ?? null }));
}

export async function saveConnection(actor: Actor, input: SaveConnectionInput) {
  if (input.kind === "app" && input.purpose === "approver") throw invalid("Approvals need a token from an account that is a required reviewer. GitHub Apps can't be reviewers.");
  if (input.kind === "pat" && !input.token?.trim()) throw invalid("Paste the token.", { token: "Required" });
  if (input.kind === "app" && (!input.appId || !input.installationId || !input.privateKey)) throw invalid("A GitHub App needs its App ID, installation ID and private key.");
  const values = {
    name: input.name?.trim() || `${input.owner} ${input.purpose === "approver" ? "approver" : "runs"}`,
    owner: input.owner.trim(),
    kind: input.kind,
    purpose: input.purpose,
    encryptedSecret: encryptJson(input.kind === "app" ? { privateKey: input.privateKey } : { token: input.token!.trim() }),
    appId: input.kind === "app" ? input.appId! : null,
    installationId: input.kind === "app" ? input.installationId! : null,
    status: "checking" as const,
    lastError: null,
    actsAs: null,
    expiresAt: null,
    createdBy: actor.userId,
    updatedAt: new Date(),
  };
  const [row] = await db.insert(githubConnection).values(values).onConflictDoUpdate({ target: [githubConnection.owner, githubConnection.purpose], set: values }).returning({ id: githubConnection.id });
  await audit(actor, "connection.saved", { type: "connection", id: row.id }, { owner: values.owner, purpose: values.purpose, kind: values.kind });
  await jobs.send("maintenance.checkConnection", { connectionId: row.id });
  return row;
}

export async function removeConnection(actor: Actor, id: string) {
  await db.delete(githubConnection).where(eq(githubConnection.id, id));
  await audit(actor, "connection.removed", { type: "connection", id });
}

export async function recheckConnection(actor: Actor, id: string) {
  await db.update(githubConnection).set({ status: "checking" }).where(eq(githubConnection.id, id));
  await jobs.send("maintenance.checkConnection", { connectionId: id });
  await audit(actor, "connection.checked", { type: "connection", id });
}

/** Worker: confirms a connection works and records the identity GitHub sees. */
export async function checkConnection(id: string, log: Logger) {
  const [c] = await db.select().from(githubConnection).where(eq(githubConnection.id, id));
  if (!c) return;
  const now = new Date();
  try {
    let actsAs: string;
    let expiresAt: Date | null = null;
    if (c.kind === "pat") {
      const res = await gh<{ login: string }>(octokitFor(c), "GET /user");
      actsAs = res.data.login;
      const exp = res.headers["github-authentication-token-expiration"];
      if (exp) {
        const d = new Date(exp.replace(" UTC", "Z").replace(" ", "T"));
        expiresAt = Number.isNaN(d.getTime()) ? null : d;
      }
    } else {
      const app = appOctokitFor(c);
      if (!app) throw new Error("App ID or private key is missing.");
      actsAs = `${(await gh<{ slug: string }>(app, "GET /app")).data.slug}[bot]`;
      await gh(octokitFor(c), "GET /installation/repositories", { per_page: 1 });
    }
    const soon = expiresAt && expiresAt.getTime() - now.getTime() < 14 * 86_400_000;
    await db.update(githubConnection).set({ actsAs, expiresAt, status: soon ? "expiring" : "healthy", lastError: null, lastCheckedAt: now }).where(eq(githubConnection.id, id));
    log.info({ event: "connection.healthy", connection: c.name, actsAs });
    if (c.purpose === "dispatch") await jobs.send("catalog.sync", { reason: "connection" });
  } catch (e) {
    await db.update(githubConnection).set({ status: "error", lastError: githubMessage(e), lastCheckedAt: now }).where(eq(githubConnection.id, id));
    log.warn({ event: "connection.failed", connection: c.name, err: githubMessage(e) });
  }
}

/** Worker, every 5 minutes: expiring tokens, retention. */
export async function housekeeping(log: Logger) {
  const soon = new Date(Date.now() + 14 * 86_400_000);
  await db.update(githubConnection).set({ status: "expiring" }).where(and(eq(githubConnection.status, "healthy"), isNotNull(githubConnection.expiresAt), lt(githubConnection.expiresAt, soon)));
  await db.delete(webhookDelivery).where(and(isNotNull(webhookDelivery.processedAt), lt(webhookDelivery.receivedAt, new Date(Date.now() - 14 * 86_400_000))));
  log.debug({ event: "maintenance.housekeeping" });
}
