CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_gate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"github_run_id" bigint NOT NULL,
	"run_attempt" integer NOT NULL,
	"environment_id" bigint NOT NULL,
	"environment_name" text NOT NULL,
	"reviewers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"comment" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" text,
	"environment_name" text DEFAULT '*' NOT NULL,
	"mode" text NOT NULL,
	"approver_group_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prevent_self_approval" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text NOT NULL,
	"ref" text NOT NULL,
	"saved_input_name" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" text NOT NULL,
	"position" integer NOT NULL,
	"section" text NOT NULL,
	"heading_path" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536),
	"content_vector" "tsvector"
);
--> statement-breakpoint
CREATE TABLE "entra_group" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner" text NOT NULL,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"app_id" text,
	"installation_id" text,
	"acts_as" text,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'checking' NOT NULL,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_team_member" (
	"org" text NOT NULL,
	"team_slug" text NOT NULL,
	"login" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_team_member_org_team_slug_login_pk" PRIMARY KEY("org","team_slug","login")
);
--> statement-breakpoint
CREATE TABLE "group_role_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" text NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_category" text,
	"scope_family" text,
	"scope_environment" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"email" boolean DEFAULT false NOT NULL,
	"emailed_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text NOT NULL,
	"environments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tree_sha" text,
	"synced_at" timestamp with time zone,
	CONSTRAINT "repository_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "run_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" text NOT NULL,
	"version_id" uuid,
	"source" text DEFAULT 'flowdeck' NOT NULL,
	"ref" text NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"saved_input_name" text,
	"requested_by" text,
	"idempotency_key" text,
	"phase" text DEFAULT 'pending' NOT NULL,
	"github_run_id" bigint,
	"html_url" text,
	"actor_login" text,
	"error" text,
	"dispatch_attempts" integer DEFAULT 0 NOT NULL,
	"dispatch_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_input" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text NOT NULL,
	"name" text NOT NULL,
	"ref" text,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_access" (
	"user_id" text PRIMARY KEY NOT NULL,
	"entra_object_id" text,
	"app_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"github_login" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"action" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "workflow_daily_stat" (
	"family_id" text NOT NULL,
	"ref" text NOT NULL,
	"day" date NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"successes" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"p50_seconds" real,
	"p90_seconds" real,
	"approval_wait_seconds" real,
	CONSTRAINT "workflow_daily_stat_family_id_ref_day_pk" PRIMARY KEY("family_id","ref","day")
);
--> statement-breakpoint
CREATE TABLE "workflow_family" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"category" text,
	"subcategory" text,
	"scope" text DEFAULT 'generic' NOT NULL,
	"kind" text DEFAULT 'entrypoint' NOT NULL,
	"owner" text,
	"status" text DEFAULT 'active' NOT NULL,
	"facets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_note" text,
	"typical_duration" text,
	"related" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_reviewed" date,
	"doc_path" text,
	"doc_sha" text,
	"doc_body" text,
	"search_vector" "tsvector",
	"present" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"github_job_id" bigint NOT NULL,
	"run_attempt" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"html_url" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "workflow_job_github_job_id_unique" UNIQUE("github_job_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_request_id" uuid,
	"repository_id" uuid NOT NULL,
	"github_run_id" bigint NOT NULL,
	"github_workflow_id" bigint,
	"run_attempt" integer DEFAULT 1 NOT NULL,
	"run_number" integer,
	"status" text,
	"conclusion" text,
	"phase" text DEFAULT 'queued' NOT NULL,
	"head_branch" text,
	"head_sha" text,
	"actor_login" text,
	"html_url" text,
	"etag" text,
	"jobs_etag" text,
	"not_found_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_webhook_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_github_run_id_unique" UNIQUE("github_run_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" text NOT NULL,
	"version" text NOT NULL,
	"file_path" text NOT NULL,
	"github_workflow_id" bigint,
	"status" text DEFAULT 'current' NOT NULL,
	"superseded_by" text,
	"blob_sha" text,
	"dispatchable" boolean DEFAULT false NOT NULL,
	"github_state" text,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"jobs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concurrency" jsonb,
	"parse_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_view" (
	"user_id" text NOT NULL,
	"family_id" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_view_user_id_family_id_pk" PRIMARY KEY("user_id","family_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_gate" ADD CONSTRAINT "approval_gate_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_gate" ADD CONSTRAINT "approval_gate_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_item" ADD CONSTRAINT "dashboard_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_item" ADD CONSTRAINT "dashboard_item_family_id_workflow_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."workflow_family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_chunk" ADD CONSTRAINT "doc_chunk_family_id_workflow_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."workflow_family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_role_binding" ADD CONSTRAINT "group_role_binding_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_request" ADD CONSTRAINT "run_request_family_id_workflow_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."workflow_family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_request" ADD CONSTRAINT "run_request_version_id_workflow_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_request" ADD CONSTRAINT "run_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_input" ADD CONSTRAINT "saved_input_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_input" ADD CONSTRAINT "saved_input_family_id_workflow_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."workflow_family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_daily_stat" ADD CONSTRAINT "workflow_daily_stat_family_id_workflow_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."workflow_family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_family" ADD CONSTRAINT "workflow_family_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_job" ADD CONSTRAINT "workflow_job_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_run_request_id_run_request_id_fk" FOREIGN KEY ("run_request_id") REFERENCES "public"."run_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_version" ADD CONSTRAINT "workflow_version_family_id_workflow_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."workflow_family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_view" ADD CONSTRAINT "workflow_view_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_view" ADD CONSTRAINT "workflow_view_family_id_workflow_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."workflow_family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_gate_key" ON "approval_gate" USING btree ("github_run_id","run_attempt","environment_id");--> statement-breakpoint
CREATE INDEX "approval_gate_state" ON "approval_gate" USING btree ("state");--> statement-breakpoint
CREATE INDEX "audit_event_created" ON "audit_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_event_action" ON "audit_event" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_item_key" ON "dashboard_item" USING btree ("user_id","family_id","ref");--> statement-breakpoint
CREATE INDEX "doc_chunk_family" ON "doc_chunk" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "doc_chunk_embedding" ON "doc_chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "doc_chunk_text" ON "doc_chunk" USING gin ("content_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "github_connection_owner_purpose" ON "github_connection" USING btree ("owner","purpose");--> statement-breakpoint
CREATE INDEX "group_role_binding_group" ON "group_role_binding" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "notification_user" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "run_request_idempotency" ON "run_request" USING btree ("requested_by","idempotency_key");--> statement-breakpoint
CREATE INDEX "run_request_family_created" ON "run_request" USING btree ("family_id","created_at");--> statement-breakpoint
CREATE INDEX "run_request_user_created" ON "run_request" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "run_request_phase" ON "run_request" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "run_request_github_run" ON "run_request" USING btree ("github_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_input_name" ON "saved_input" USING btree ("user_id","family_id","name");--> statement-breakpoint
CREATE INDEX "workflow_family_search" ON "workflow_family" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "workflow_family_category" ON "workflow_family" USING btree ("category");--> statement-breakpoint
CREATE INDEX "workflow_job_run" ON "workflow_job" USING btree ("workflow_run_id","run_attempt");--> statement-breakpoint
CREATE INDEX "workflow_run_phase" ON "workflow_run" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "workflow_run_request" ON "workflow_run" USING btree ("run_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_version_key" ON "workflow_version" USING btree ("family_id","version");--> statement-breakpoint
CREATE INDEX "workflow_version_gh" ON "workflow_version" USING btree ("github_workflow_id");