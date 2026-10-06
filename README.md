# FlowDeck

The front door to your DevOps repository: people find the right workflow among 1,000+, understand it from its docs, run it with saved inputs, follow it live, and get approvals done, without opening GitHub. Admins control GitHub tokens, roles and approval rules in one place.

Next.js 16.3, React 19.3, Mantine 9.6, Better Auth 1.7 (Microsoft Entra ID), Drizzle 0.45, BullMQ 6.3 on PostgreSQL, pgvector, Azure OpenAI embeddings.

> **Status:** written and statically checked (syntax for every file; 26 unit tests passing), but not yet installed, built or run against GitHub, because the environment it was written in had no package registry access. Expect a few small fixes on the first `npm install` and `npm run build`.

## What the MVP does

- **Find:** ⌘K search from anywhere and a catalog page. Search is hybrid: full text, trigram for typos, and pgvector over doc sections, fused and boosted by what you use.
- **Understand:** each workflow page shows its doc (from `docs/workflows/` in the DevOps repo), inputs, versions and recent runs.
- **Run:** a form generated from the workflow's inputs. Start from your defaults, your last run, or a **saved input** (named sets like `prod-canary`). A review step shows what will happen, including which environments wait for approval.
- **Track:** a live stage map, jobs and steps, plus cancel, rerun and run again.
- **Approve:** requests reach only people who may approve them (inbox, badge, email). Decisions go to GitHub with the approver token and are recorded under the person's name.
- **Personalise:** Recently used, and **My dashboard**: pin any workflow on a chosen branch (optionally with a saved input) and see its last run, success rate, typical time and duration trend.
- **Govern:** Admin pages for GitHub connections, roles and Entra group bindings (with "check access"), approval rules, audit log with CSV export, and system health.

## How the code is organised

```
src/
  app/                 routes only: server pages load data and render one client view each
  features/<area>/
    domain/            pure TypeScript, no I/O (permissions, eligibility, inputs, phases, ranking, docs)
    server/            services, queries, server actions ("use server"), worker jobs
    ui/                client views ("use client") built with Mantine
  platform/            db, auth, session, action wrapper, jobs, github, ai, logger, events
  ui/                  shared client components (shell, search, stage map, useServerAction)
  worker/              registers job handlers and schedules
tests/unit/            domain tests (Vitest)
devops-repo-kit/       files to copy into the DevOps repository (Copilot agent, doc template, formats)
```

### Server actions and APIs

Writes from the UI are server actions; pages read through services in server components. A small set of internal route handlers covers what actions do badly: search as you type (`/api/search`, parallel and cancellable), live updates (`/api/live`, server-sent events), the GitHub webhook, Better Auth, and CSV export. There is no public API yet. Services are the reusable core, so an `/api/v1` layer can be added later without touching business logic.

Every action is a thin call through one wrapper that authenticates, validates with Zod, checks permissions, calls the service, logs, revalidates and returns a typed result:

```ts
// features/personal/server/actions.ts
"use server";
export const pinAction = defineAction(
  { name: "personal.pin", input: PinInput, revalidate: ["/"] },
  (input, { actor }) => pin(actor, input),          // business logic lives in the service
);

// in a client component
const [pin, pinning] = useServerAction(pinAction, { success: "Pinned to your dashboard" });
<Button loading={pinning} onClick={() => pin({ familyId, ref, savedInputName: null })}>Pin</Button>
```

`useServerAction` wraps React 19's `useTransition`, shows Mantine notifications for success and failure, and turns "this action no longer exists after a deploy" into a clear "reload" message. Never pass the acting user's id from the client: the server reads it from the session.

### Mantine and server components

Mantine components are client components (each package entry has `"use client"`). They still render on the server for the first paint. Server files can use them with plain, serializable props; they cannot pass event handlers or use compound forms like `Tabs.Tab`. FlowDeck follows one rule: **a server page loads data and renders one client view**. The theme lives in a client `Providers` file because it contains functions.

### Background work

Web code never imports worker code. It calls `jobs.send(name, payload)`, validated against the contracts in `src/platform/jobs/contracts.ts`; the worker registers a handler per job name. Queues are BullMQ on PostgreSQL (schema `bullmq`), so jobs survive restarts and are backed up with everything else. A job runs every 60 seconds re-checking every unfinished run, so missed webhooks only delay updates.

### Logging

`pino` writes one JSON line per event to stdout, with no transports (they use worker threads that break under bundling). It works in server actions, route handlers and the worker; Next.js already treats pino as an external package. App Service collects stdout into Log Analytics. If `APPLICATIONINSIGHTS_CONNECTION_STRING` is set, OpenTelemetry sends traces to Application Insights and each log line carries its `traceId`. Logging happens only in the action wrapper, the job wrapper, the outbound clients and `instrumentation.ts` (`onRequestError`), never in components.

## Local setup

Requirements: Node.js 22.12+, Docker.

```bash
cp .env.example .env            # fill in secrets; DEV_LOGIN=true lets you sign in without Entra
docker compose up -d            # Postgres 17 with pgvector
npm install
npm run db:setup                # extensions (vector, pg_trgm) + BullMQ schema
npm run db:push                 # FlowDeck tables (use db:generate + db:migrate for real environments)
npm run seed                    # built-in roles + default approval rule
npm run dev                     # web on http://localhost:3000
npm run worker:dev              # second terminal
```

With `DEV_LOGIN=true`, emails in `DEV_ADMIN_EMAILS` become platform admins.

## Microsoft Entra ID

1. App registration with redirect URI `https://<host>/api/auth/callback/microsoft`.
2. App roles: `FlowDeck.User` (baseline) and `FlowDeck.Admin` (platform admins).
3. Enterprise application: "Assignment required" = Yes. Assign each team's security group with `FlowDeck.User` and the platform admin group with `FlowDeck.Admin`. Group assignment needs Entra ID P1/P2, and only direct members count.
4. Token configuration: add the groups claim, "Groups assigned to the application".
5. Optional, to pick groups by name in Admin: set `ENTRA_SERVICE_PRINCIPAL_ID` and grant the Graph application permission `Application.Read.All`.
6. In FlowDeck, Admin, Access: bind groups to roles, optionally scoped to a category, workflow or environment. Changes apply at each person's next sign-in (sessions last 12 hours).

## GitHub

1. Admin, Connections: add a **runs connection** for the organisation (fine-grained PAT or GitHub App) and an **approver token** from an account that is a required reviewer on protected environments (a different account from the runs connection).
2. Set `CATALOG_REPOSITORY` to the DevOps repository and copy `devops-repo-kit/` into it.
3. Webhook to `https://<host>/api/webhooks/github` (JSON, secret = `GITHUB_WEBHOOK_SECRET`). Events: workflow runs, workflow jobs, deployment reviews, deployment statuses, pushes.

## Deploying to Azure

One image, two App Service apps: **web** (`node server.js`, with a staging slot) and **worker** (startup command `npx tsx src/worker/index.ts`, Always On). All state lives in Azure Database for PostgreSQL Flexible Server (add `VECTOR` and `PG_TRGM` to `azure.extensions`). `.github/workflows/deploy.yml` builds the image, runs migrations, deploys to the staging slot, waits for health, swaps, then updates the worker. No Redis is used.

## Tests

`npm test` runs the domain tests (permissions, approval eligibility, input validation, phases and job graph, search ranking, doc parsing). Integration tests against a real Postgres (Testcontainers) and Playwright journeys are the next layer to add.

## Not in this release

Ask DevOps assistant, Teams notifications, catalog quality page, shared saved inputs, a public API, and the assistant running workflows by saved-input name.
