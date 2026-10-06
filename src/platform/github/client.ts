import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { githubConnection, type ConnectionPurpose } from "../db/schema";
import { decryptJson } from "../crypto";
import { config } from "../config";
import { logger } from "../logger";
import { AppError } from "../errors";

export type Connection = typeof githubConnection.$inferSelect;
type Secret = { token?: string; privateKey?: string };

export type GitHubError = Error & { status: number; response?: { headers?: Record<string, string>; data?: unknown } };
export const isGitHubError = (e: unknown): e is GitHubError => typeof e === "object" && e !== null && typeof (e as { status?: unknown }).status === "number";

export function githubMessage(e: unknown): string {
  if (isGitHubError(e)) {
    const data = e.response?.data as { message?: string; errors?: Array<{ message?: string } | string> } | undefined;
    const details = (data?.errors ?? []).map((x) => (typeof x === "string" ? x : x.message)).filter(Boolean).join("; ");
    return `GitHub returned ${e.status}: ${data?.message ?? e.message}${details ? ` (${details})` : ""}`;
  }
  return e instanceof Error ? e.message : String(e);
}

const cache = new Map<string, Octokit>();

export function octokitFor(c: Connection): Octokit {
  const key = `${c.id}:${c.updatedAt.getTime()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const secret = decryptJson<Secret>(c.encryptedSecret);
  const octokit =
    c.kind === "app"
      ? new Octokit({
          baseUrl: config.githubApiUrl,
          userAgent: "flowdeck",
          authStrategy: createAppAuth,
          auth: { appId: Number(c.appId), privateKey: secret.privateKey, installationId: Number(c.installationId) },
        })
      : new Octokit({ baseUrl: config.githubApiUrl, userAgent: "flowdeck", auth: secret.token });

  octokit.hook.wrap("request", async (request, options) => {
    const started = performance.now();
    try {
      const res = await request(options);
      const h = res.headers as Record<string, string | undefined>;
      logger.debug({ event: "github.request", route: options.url, status: res.status, ms: Math.round(performance.now() - started), quotaLeft: h["x-ratelimit-remaining"] });
      if (h["x-ratelimit-remaining"]) {
        void db.execute(
          sql`insert into app_setting (key, value, updated_at) values (${`ratelimit:${c.id}`}, ${JSON.stringify({ remaining: Number(h["x-ratelimit-remaining"]), limit: Number(h["x-ratelimit-limit"]) })}::jsonb, now())
              on conflict (key) do update set value = excluded.value, updated_at = now()`,
        ).catch(() => undefined);
      }
      return res;
    } catch (e) {
      const status = isGitHubError(e) ? e.status : 0;
      if (status !== 304) logger.debug({ event: "github.request", route: options.url, status, ms: Math.round(performance.now() - started) });
      throw e;
    }
  });
  cache.set(key, octokit);
  return octokit;
}

export function appOctokitFor(c: Connection): Octokit | null {
  if (c.kind !== "app" || !c.appId) return null;
  const secret = decryptJson<Secret>(c.encryptedSecret);
  return new Octokit({ baseUrl: config.githubApiUrl, userAgent: "flowdeck", authStrategy: createAppAuth, auth: { appId: Number(c.appId), privateKey: secret.privateKey } });
}

export async function getConnection(owner: string, purpose: ConnectionPurpose): Promise<Connection | null> {
  const [row] = await db
    .select()
    .from(githubConnection)
    .where(and(sql`lower(${githubConnection.owner}) = lower(${owner})`, eq(githubConnection.purpose, purpose)))
    .limit(1);
  return row ?? null;
}

export async function clientFor(owner: string, purpose: ConnectionPurpose = "dispatch") {
  const connection = await getConnection(owner, purpose);
  if (!connection) {
    throw new AppError(
      "unavailable",
      purpose === "approver"
        ? `No approver token is set up for ${owner}. An admin can add one under Admin, Connections.`
        : `No GitHub connection is set up for ${owner}. An admin can add one under Admin, Connections.`,
    );
  }
  return { octokit: octokitFor(connection), connection };
}

/** Untyped request: keeps us independent of Octokit's generated endpoint types. */
export async function gh<T = any>(octokit: Octokit, route: string, params: Record<string, unknown> = {}) {
  const res = await octokit.request(route as string, params);
  return { status: res.status, data: res.data as T, headers: res.headers as Record<string, string | undefined> };
}

export async function ghAll<T = any>(octokit: Octokit, route: string, params: Record<string, unknown> = {}): Promise<T[]> {
  return (await octokit.paginate(route as string, { per_page: 100, ...params })) as T[];
}
