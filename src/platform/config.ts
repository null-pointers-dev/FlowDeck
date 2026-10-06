/** Configuration read lazily, so `next build` works without runtime secrets. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}
const flag = (name: string) => (process.env[name] ?? "").toLowerCase() === "true";
const list = (name: string) => (process.env[name] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const config = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appUrl() {
    return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get githubApiUrl() {
    return (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
  },
  get catalogRepository() {
    const v = process.env.CATALOG_REPOSITORY ?? "";
    const [owner, name] = v.split("/");
    return owner && name ? { owner, name } : null;
  },
  get webhookSecret() {
    return process.env.GITHUB_WEBHOOK_SECRET ?? "";
  },
  get entra() {
    const tenantId = process.env.ENTRA_TENANT_ID;
    const clientId = process.env.ENTRA_CLIENT_ID;
    const clientSecret = process.env.ENTRA_CLIENT_SECRET;
    return tenantId && clientId && clientSecret
      ? { tenantId, clientId, clientSecret, servicePrincipalId: process.env.ENTRA_SERVICE_PRINCIPAL_ID ?? null }
      : null;
  },
  get githubOAuth() {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  },
  get devLogin() {
    return flag("DEV_LOGIN") && process.env.NODE_ENV !== "production";
  },
  get devAdminEmails() {
    return list("DEV_ADMIN_EMAILS").map((e) => e.toLowerCase());
  },
  get openai() {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    return endpoint && apiKey
      ? { endpoint: endpoint.replace(/\/$/, ""), apiKey, embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-3-small" }
      : null;
  },
  get email() {
    const connectionString = process.env.ACS_CONNECTION_STRING;
    const sender = process.env.ACS_SENDER_ADDRESS;
    return connectionString && sender ? { connectionString, sender } : null;
  },
  get logLevel() {
    return process.env.LOG_LEVEL ?? "info";
  },
};
