import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type { InputField } from "@/features/runs/domain/inputs";
import type { JobMeta } from "@/features/runs/domain/graph";
import type { Permission } from "@/features/access/domain/permissions";

/** Postgres full-text vector. Written with to_tsvector() in SQL, never by hand. */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const ts = (name: string) => timestamp(name, { withTimezone: true });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

/* ================================================================ Better Auth */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ================================================================ Access */

/** What Entra told us at the person's last sign-in. */
export const userAccess = pgTable("user_access", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  entraObjectId: text("entra_object_id"),
  appRoles: jsonb("app_roles").$type<string[]>().notNull().default([]),
  groups: jsonb("groups").$type<string[]>().notNull().default([]),
  githubLogin: text("github_login"),
  syncedAt: ts("synced_at").notNull().defaultNow(),
});

/** Groups assigned to the FlowDeck enterprise app, refreshed from Microsoft Graph. */
export const entraGroup = pgTable("entra_group", {
  id: text("id").primaryKey(), // Entra object ID
  displayName: text("display_name").notNull(),
  syncedAt: ts("synced_at").notNull().defaultNow(),
});

export const role = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions").$type<Permission[]>().notNull().default([]),
  builtIn: boolean("built_in").notNull().default(false),
  createdAt: created(),
  updatedAt: updated(),
});

export const groupRoleBinding = pgTable(
  "group_role_binding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: text("group_id").notNull(),
    roleId: uuid("role_id").notNull().references(() => role.id, { onDelete: "cascade" }),
    scopeCategory: text("scope_category"),
    scopeFamily: text("scope_family"),
    scopeEnvironment: text("scope_environment"),
    createdBy: text("created_by"),
    createdAt: created(),
  },
  (t) => [index("group_role_binding_group").on(t.groupId)],
);

/* ================================================================ GitHub connections */

export type ConnectionKind = "pat" | "app";
export type ConnectionPurpose = "dispatch" | "approver";
export type ConnectionStatus = "checking" | "healthy" | "expiring" | "error";

export const githubConnection = pgTable(
  "github_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    owner: text("owner").notNull(),
    kind: text("kind").$type<ConnectionKind>().notNull(),
    purpose: text("purpose").$type<ConnectionPurpose>().notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    appId: text("app_id"),
    installationId: text("installation_id"),
    actsAs: text("acts_as"),
    expiresAt: ts("expires_at"),
    status: text("status").$type<ConnectionStatus>().notNull().default("checking"),
    lastError: text("last_error"),
    lastCheckedAt: ts("last_checked_at"),
    createdBy: text("created_by"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("github_connection_owner_purpose").on(t.owner, t.purpose)],
);

/* ================================================================ Catalog */

export type Reviewer = { type: "User"; login: string } | { type: "Team"; slug: string; name?: string; org: string };
export type RepoEnvironment = { id: number; name: string; protected: boolean; reviewers: Reviewer[] };

export const repository = pgTable("repository", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  defaultBranch: text("default_branch").notNull(),
  environments: jsonb("environments").$type<RepoEnvironment[]>().notNull().default([]),
  treeSha: text("tree_sha"),
  syncedAt: ts("synced_at"),
});

export const category = pgTable("category", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  parent: text("parent"),
  position: integer("position").notNull().default(0),
});

export type FamilyFacets = { cloud?: string; environments?: string[]; action?: string };

export const workflowFamily = pgTable(
  "workflow_family",
  {
    id: text("id").primaryKey(), // kebab-case family id from the doc front matter
    repositoryId: uuid("repository_id").notNull().references(() => repository.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    category: text("category"),
    subcategory: text("subcategory"),
    scope: text("scope").notNull().default("generic"), // generic | specific
    kind: text("kind").notNull().default("entrypoint"), // entrypoint | reusable | internal
    owner: text("owner"),
    status: text("status").notNull().default("active"), // active | deprecated | retired
    facets: jsonb("facets").$type<FamilyFacets>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    approvalNote: text("approval_note"),
    typicalDuration: text("typical_duration"),
    related: jsonb("related").$type<string[]>().notNull().default([]),
    lastReviewed: date("last_reviewed"),
    docPath: text("doc_path"),
    docSha: text("doc_sha"),
    docBody: text("doc_body"),
    searchVector: tsvector("search_vector"),
    present: boolean("present").notNull().default(true),
    updatedAt: updated(),
  },
  (t) => [
    index("workflow_family_search").using("gin", t.searchVector),
    index("workflow_family_category").on(t.category),
  ],
);

export const workflowVersion = pgTable(
  "workflow_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: text("family_id").notNull().references(() => workflowFamily.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    filePath: text("file_path").notNull(),
    githubWorkflowId: bigint("github_workflow_id", { mode: "number" }),
    status: text("status").notNull().default("current"), // current | supported | deprecated | retired
    supersededBy: text("superseded_by"),
    blobSha: text("blob_sha"),
    dispatchable: boolean("dispatchable").notNull().default(false),
    githubState: text("github_state"),
    inputs: jsonb("inputs").$type<InputField[]>().notNull().default([]),
    jobs: jsonb("jobs").$type<JobMeta[]>().notNull().default([]),
    concurrency: jsonb("concurrency").$type<{ group: string; cancelInProgress: boolean } | null>(),
    parseError: text("parse_error"),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("workflow_version_key").on(t.familyId, t.version), index("workflow_version_gh").on(t.githubWorkflowId)],
);

export const docChunk = pgTable(
  "doc_chunk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: text("family_id").notNull().references(() => workflowFamily.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    section: text("section").notNull(),
    headingPath: text("heading_path").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    contentVector: tsvector("content_vector"),
  },
  (t) => [
    index("doc_chunk_family").on(t.familyId),
    index("doc_chunk_embedding").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("doc_chunk_text").using("gin", t.contentVector),
  ],
);

/* ================================================================ Runs */

export const runRequest = pgTable(
  "run_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: text("family_id").notNull().references(() => workflowFamily.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => workflowVersion.id, { onDelete: "set null" }),
    source: text("source").notNull().default("flowdeck"), // flowdeck | github
    ref: text("ref").notNull(),
    inputs: jsonb("inputs").$type<Record<string, string>>().notNull().default({}),
    savedInputName: text("saved_input_name"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key"),
    phase: text("phase").notNull().default("pending"),
    githubRunId: bigint("github_run_id", { mode: "number" }),
    htmlUrl: text("html_url"),
    actorLogin: text("actor_login"),
    error: text("error"),
    dispatchAttempts: integer("dispatch_attempts").notNull().default(0),
    dispatchStartedAt: ts("dispatch_started_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("run_request_idempotency").on(t.requestedBy, t.idempotencyKey),
    index("run_request_family_created").on(t.familyId, t.createdAt),
    index("run_request_user_created").on(t.requestedBy, t.createdAt),
    index("run_request_phase").on(t.phase),
    index("run_request_github_run").on(t.githubRunId),
  ],
);

export const workflowRun = pgTable(
  "workflow_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runRequestId: uuid("run_request_id").references(() => runRequest.id, { onDelete: "set null" }),
    repositoryId: uuid("repository_id").notNull().references(() => repository.id, { onDelete: "cascade" }),
    githubRunId: bigint("github_run_id", { mode: "number" }).notNull().unique(),
    githubWorkflowId: bigint("github_workflow_id", { mode: "number" }),
    runAttempt: integer("run_attempt").notNull().default(1),
    runNumber: integer("run_number"),
    status: text("status"),
    conclusion: text("conclusion"),
    phase: text("phase").notNull().default("queued"),
    headBranch: text("head_branch"),
    headSha: text("head_sha"),
    actorLogin: text("actor_login"),
    htmlUrl: text("html_url"),
    etag: text("etag"),
    jobsEtag: text("jobs_etag"),
    notFoundCount: integer("not_found_count").notNull().default(0),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    lastSyncedAt: ts("last_synced_at"),
    lastWebhookAt: ts("last_webhook_at"),
    updatedAt: updated(),
  },
  (t) => [index("workflow_run_phase").on(t.phase), index("workflow_run_request").on(t.runRequestId)],
);

export type JobStep = { number: number; name: string; status: string; conclusion: string | null; startedAt: string | null; completedAt: string | null };

export const workflowJob = pgTable(
  "workflow_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowRunId: uuid("workflow_run_id").notNull().references(() => workflowRun.id, { onDelete: "cascade" }),
    githubJobId: bigint("github_job_id", { mode: "number" }).notNull().unique(),
    runAttempt: integer("run_attempt").notNull().default(1),
    name: text("name").notNull(),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    steps: jsonb("steps").$type<JobStep[]>().notNull().default([]),
    htmlUrl: text("html_url"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
  },
  (t) => [index("workflow_job_run").on(t.workflowRunId, t.runAttempt)],
);

/* ================================================================ Approvals */

export type GateState = "pending" | "deciding" | "approved" | "rejected" | "closed";
export type ApprovalMode = "github" | "flowdeck";

export const approvalGate = pgTable(
  "approval_gate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowRunId: uuid("workflow_run_id").notNull().references(() => workflowRun.id, { onDelete: "cascade" }),
    githubRunId: bigint("github_run_id", { mode: "number" }).notNull(),
    runAttempt: integer("run_attempt").notNull(),
    environmentId: bigint("environment_id", { mode: "number" }).notNull(),
    environmentName: text("environment_name").notNull(),
    reviewers: jsonb("reviewers").$type<Reviewer[]>().notNull().default([]),
    state: text("state").$type<GateState>().notNull().default("pending"),
    decision: text("decision").$type<"approve" | "reject">(),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    comment: text("comment"),
    error: text("error"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("approval_gate_key").on(t.githubRunId, t.runAttempt, t.environmentId), index("approval_gate_state").on(t.state)],
);

/** Who may approve. Most specific wins: family + env, family, env, default ("*"/"*"). */
export const approvalRule = pgTable("approval_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: text("family_id"),
  environmentName: text("environment_name").notNull().default("*"),
  mode: text("mode").$type<ApprovalMode>().notNull(),
  approverGroupIds: jsonb("approver_group_ids").$type<string[]>().notNull().default([]),
  preventSelfApproval: boolean("prevent_self_approval").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const githubTeamMember = pgTable(
  "github_team_member",
  { org: text("org").notNull(), teamSlug: text("team_slug").notNull(), login: text("login").notNull(), syncedAt: ts("synced_at").notNull().defaultNow() },
  (t) => [primaryKey({ columns: [t.org, t.teamSlug, t.login] })],
);

/* ================================================================ Personalisation */

export const savedInput = pgTable(
  "saved_input",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    familyId: text("family_id").notNull().references(() => workflowFamily.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ref: text("ref"),
    inputs: jsonb("inputs").$type<Record<string, string | number | boolean>>().notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("saved_input_name").on(t.userId, t.familyId, t.name)],
);

export const dashboardItem = pgTable(
  "dashboard_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    familyId: text("family_id").notNull().references(() => workflowFamily.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(),
    savedInputName: text("saved_input_name"),
    position: integer("position").notNull().default(0),
    createdAt: created(),
  },
  (t) => [uniqueIndex("dashboard_item_key").on(t.userId, t.familyId, t.ref)],
);

export const workflowView = pgTable(
  "workflow_view",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    familyId: text("family_id").notNull().references(() => workflowFamily.id, { onDelete: "cascade" }),
    viewedAt: ts("viewed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.familyId] })],
);

/* ================================================================ Insights */

export const workflowDailyStat = pgTable(
  "workflow_daily_stat",
  {
    familyId: text("family_id").notNull().references(() => workflowFamily.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(),
    day: date("day").notNull(),
    runs: integer("runs").notNull().default(0),
    successes: integer("successes").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    p50Seconds: real("p50_seconds"),
    p90Seconds: real("p90_seconds"),
    approvalWaitSeconds: real("approval_wait_seconds"),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.ref, t.day] })],
);

/* ================================================================ Platform */

export const webhookDelivery = pgTable("webhook_delivery", {
  deliveryId: text("delivery_id").primaryKey(),
  event: text("event").notNull(),
  action: text("action"),
  payload: jsonb("payload").notNull(),
  receivedAt: created(),
  processedAt: ts("processed_at"),
  error: text("error"),
});

export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    email: boolean("email").notNull().default(false),
    emailedAt: ts("emailed_at"),
    readAt: ts("read_at"),
    createdAt: created(),
  },
  (t) => [index("notification_user").on(t.userId, t.createdAt)],
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [index("audit_event_created").on(t.createdAt), index("audit_event_action").on(t.action)],
);

export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updated(),
});
