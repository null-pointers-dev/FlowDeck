import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import * as schema from "./db/schema";
import { config } from "./config";
import { recordGithubLogin, syncAccessFromSignIn } from "@/features/access/server/claims";

const entra = config.entra;
const github = config.githubOAuth;

export const auth = betterAuth({
  appName: "FlowDeck",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  socialProviders: {
    ...(entra ? { microsoft: { clientId: entra.clientId, clientSecret: entra.clientSecret, tenantId: entra.tenantId } } : {}),
    ...(github ? { github: { clientId: github.clientId, clientSecret: github.clientSecret, scope: ["read:user"] } } : {}),
  },
  // Local development only; production signs in through Entra.
  emailAndPassword: { enabled: config.devLogin },
  // 12-hour sessions: Entra group changes apply within a working day.
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
  account: { accountLinking: { enabled: true, trustedProviders: ["microsoft", "github"] } },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await syncAccessFromSignIn(session.userId);
        },
      },
    },
    account: {
      create: {
        after: async (acc) => {
          if (acc.providerId === "github" && acc.accessToken) await recordGithubLogin(acc.userId, acc.accessToken);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
