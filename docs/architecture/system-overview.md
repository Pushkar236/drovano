# System Overview

> **Status:** v1.0, 2026-07-07. Summary at [`ARCHITECTURE.md`](../../ARCHITECTURE.md);
> technology rationale in the ADRs ([`DECISIONS.md`](../../DECISIONS.md)).

## 1. Repository & module map

One pnpm/Turborepo monorepo (ADR-0001). Planned layout (created in M1):

```
apps/
  web/            Vite + React SPA (the product)
  api/            Hono modular monolith (HTTP entry)
  workers/        Trigger.dev task definitions (jobs + AI workers)
  marketing/      Marketing site (separate deploy, separate stack allowed)
packages/
  modules/        One package per domain module (see below)
  db/             Drizzle schema, migrations, RLS policies, seeds
  api-contracts/  Zod schemas + tRPC routers + OpenAPI generation
  permissions/    Centralized permission service (pure, framework-free)
  ui/             Strata component library (Base UI + tokens)
  tokens/         DTCG design tokens → CSS custom properties
  ai/             Agent harness, tools, retrieval pipeline
  telemetry/      OTel setup, logger, audit writer
  config/         Shared tsconfig/eslint/prettier presets
scripts/          Repo automation (TypeScript, tsx)
docs/             This documentation set
```

### Domain modules

Each module is a package exporting: Drizzle schema fragments, Zod
contracts, a service layer (the *only* write path for its aggregates),
tRPC routers, and Trigger.dev tasks. Modules import only each other's
published interfaces — enforced by Turborepo Boundaries tags + TS project
references in CI (ADR-0004).

| Module | Owns |
|---|---|
| `identity` | Users, sessions, MFA, agent principals |
| `orgs` | Organizations, workspaces, memberships, invitations, roles |
| `crm` | Objects, records, attributes, lists, views, pipelines |
| `work` | Tasks, calendar sync, meetings |
| `knowledge` | Notes, documents, indexing hooks |
| `intelligence` | AI workers, automation rules, analytics queries |
| `platform` | API keys, webhooks, MCP server, integrations |

Cross-cutting packages (`permissions`, `telemetry`/audit, `db`) are
dependencies of modules, never the reverse.

## 2. Request lifecycles

**Interactive read (dashboard):** SPA renders from TanStack DB collections
(in-memory, live queries) → cache miss/invalidation triggers tRPC fetch →
Hono handler opens a transaction, `SET LOCAL app.current_tenant_id`,
executes Drizzle query under RLS → response normalizes into collections.

**Interactive write:** optimistic apply to the local collection →
tRPC mutation → handler: authenticate → resolve permission via
`permissions` → transaction with tenant GUC → module service performs the
typed operation → audit row written in the same transaction → WS
invalidation event published (Redis pub/sub, per-workspace channel) →
other clients refetch affected collections. On failure the optimistic
change rolls back with a designed error state.

**Public API:** same module services behind REST routes generated from the
same Zod schemas (`@hono/zod-openapi`); API-key/OAuth auth resolves to a
principal + workspace; identical permission and audit path. MCP server
wraps the public surface with tenant-scoped OAuth (ADR-0005).

**Background / AI:** signals (email sync, calendar webhooks, meeting
ended) enqueue Trigger.dev runs. Every side-effecting step is a journaled
durable step executing the same typed operations under an **agent
principal** with scoped grants; human approvals are waitpoints
(ADR-0007, `ai-system.md`).

## 3. Deployment topology (MVP → scale)

**MVP (M1–M4):** Vercel (SPA + marketing) · Render containers (API,
realtime gateway, Trigger.dev self-host optional — start on their cloud) ·
Neon Postgres (with pgvector) · Upstash/managed Redis (pub/sub + cache).
Environments: `preview` (per-PR), `staging`, `production`; migrations run
as a release step, expand-and-contract only.

**Scale triggers (recorded in ADRs):** enterprise VPC/compliance demands →
SST v3 on AWS (ECS Fargate); ~10M+ vectors → Turbopuffer
namespace-per-tenant; whale tenants → read replicas, then Citus/PlanetScale
Postgres or silo databases for the enterprise tier.

## 4. Observability & operations

- **OTel JS SDK 2.x** everywhere from the first service: traces (HTTP,
  DB, LLM calls with token counts), metrics (perf budgets from
  `docs/PRD.md` §5 as SLOs), logs. Sentry as the single pane; Axiom for
  high-volume event/audit log analytics.
- **Audit log is domain data:** append-only Postgres table, written
  transactionally with mutations, queryable in-product (record timeline,
  actor history), optionally streamed out. It is not derived from
  telemetry.
- Health: `/healthz` per service; synthetic checks on the golden path
  (login → open workspace → mutate record).
- Backups: Neon PITR; restore drills per `SECURITY.md` (RPO ≤ 24h,
  RTO ≤ 4h at v1).

## 5. What we deliberately did not build

- **No microservices** — 100k tenants is a data-layer problem, not a
  service-count problem (research §3; ADR-0004).
- **No hand-rolled Linear-style sync engine** — the client data layer +
  invalidation delivers the perceived speed; Electric shapes are the
  earned upgrade (ADR-0003).
- **No GraphQL** — single first-party client; tRPC gives contract safety
  without the gateway tax (ADR-0005).
- **No Kubernetes at MVP** — containers on a PaaS until evidence demands
  otherwise.
