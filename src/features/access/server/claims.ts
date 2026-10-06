import { and, eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { account, user, userAccess } from "@/platform/db/schema";
import { config } from "@/platform/config";
import { logger } from "@/platform/logger";
import { ENTRA_ADMIN_ROLE, ENTRA_USER_ROLE } from "../domain/permissions";

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Called after every sign-in. Better Auth has already verified the ID token; we read the
 * `roles` (Entra app roles) and `groups` ("Groups assigned to the application") claims from it.
 */
export async function syncAccessFromSignIn(userId: string) {
  const [ms] = await db
    .select({ idToken: account.idToken, accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "microsoft")))
    .limit(1);

  let appRoles: string[] = [];
  let groups: string[] = [];
  let entraObjectId: string | null = null;

  if (ms?.idToken) {
    const claims = decodeJwtPayload(ms.idToken);
    appRoles = Array.isArray(claims.roles) ? claims.roles.map(String) : [];
    groups = Array.isArray(claims.groups) ? claims.groups.map(String) : [];
    entraObjectId = typeof claims.oid === "string" ? claims.oid : ms.accountId;
    if (claims._claim_names) {
      logger.warn({ event: "access.group_overage", userId }, "Groups claim overage: set the groups claim to 'Groups assigned to the application'");
    }
  } else if (config.devLogin) {
    const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
    appRoles = u && config.devAdminEmails.includes(u.email.toLowerCase()) ? [ENTRA_ADMIN_ROLE] : [ENTRA_USER_ROLE];
  }

  await db
    .insert(userAccess)
    .values({ userId, entraObjectId, appRoles, groups, syncedAt: new Date() })
    .onConflictDoUpdate({ target: userAccess.userId, set: { entraObjectId, appRoles, groups, syncedAt: new Date() } });
  logger.info({ event: "access.synced", userId, roles: appRoles, groupCount: groups.length });
}

/** After "Link GitHub": remember the GitHub username for the Mirror GitHub approval mode. */
export async function recordGithubLogin(userId: string, accessToken: string) {
  const res = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${accessToken}`, accept: "application/vnd.github+json" } });
  if (!res.ok) return;
  const { login } = (await res.json()) as { login?: string };
  if (!login) return;
  await db
    .insert(userAccess)
    .values({ userId, githubLogin: login })
    .onConflictDoUpdate({ target: userAccess.userId, set: { githubLogin: login } });
}
