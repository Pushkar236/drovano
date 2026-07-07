# Drovano Architecture

> **Status:** v1.0, 2026-07-07. This is the summary; detail documents live
> in [`docs/architecture/`](docs/architecture/). Every technology choice
> here is governed by an ADR in [`DECISIONS.md`](DECISIONS.md) — this
> document states _what_; the ADRs record _why and what else we considered_.
> Evidence base: [`docs/research/technology-stack-2026.md`](docs/research/technology-stack-2026.md).

## Shape of the system

Drovano is a **modular monolith with enforced module boundaries**, one
Postgres database as the center of gravity, one durable-execution substrate
for background work and AI workers, and a client built SPA-first around an
optimistic local data layer. Services are extracted only when scaling or
compliance demands diverge — the boundaries are designed so extraction is a
deployment change, not a rewrite (ADR-0004).

```
┌────────────────────────────────────────────────────────────────┐
│  Clients                                                       │
│  Web app: Vite + React SPA (TanStack Router/Query/DB)          │
│  Marketing site (separate deploy) · Public API consumers · MCP │
└──────────────┬─────────────────────────────┬───────────────────┘
               │ tRPC (internal)             │ REST/OpenAPI + MCP (public)
┌──────────────▼─────────────────────────────▼───────────────────┐
│  API — Hono modular monolith                                   │
│  modules: identity · orgs · crm · work · knowledge ·           │
│           intelligence · platform  (boundary-enforced packages)│
│  cross-cutting: permission service · audit writer · telemetry  │
└──────┬────────────────────┬────────────────────┬───────────────┘
       │                    │                    │
┌──────▼──────┐   ┌─────────▼─────────┐   ┌──────▼──────────────┐
│ Postgres 18 │   │ Trigger.dev v4    │   │ Realtime gateway    │
│ RLS · uuidv7│   │ jobs + AI workers │   │ thin WS + Redis     │
│ pgvector    │   │ durable steps     │   │ pub/sub invalidation│
└─────────────┘   └───────────────────┘   └─────────────────────┘
```

## Load-bearing decisions (index)

| Concern                  | Decision                                                                                                                                       | ADR                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Language & repo          | TypeScript everywhere; pnpm 10 + Turborepo 2.x monorepo, TS project references, Boundaries                                                     | [ADR-0001](docs/decisions/adr-0001-typescript-monorepo.md)      |
| Frontend                 | Vite 8 + React 19.2 + TanStack Router/Query, SPA-first; marketing site separate                                                                | [ADR-0002](docs/decisions/adr-0002-frontend-framework.md)       |
| Client data layer        | TanStack DB collections + WS invalidation now; ElectricSQL shapes as the upgrade path; no hand-rolled sync engine                              | [ADR-0003](docs/decisions/adr-0003-client-data-layer.md)        |
| Backend                  | Modular monolith on Hono 4.x, boundary-enforced module packages                                                                                | [ADR-0004](docs/decisions/adr-0004-backend-modular-monolith.md) |
| API strategy             | tRPC v11 internal; REST + OpenAPI from Zod v4 public; Speakeasy SDKs; tenant-scoped OAuth MCP server                                           | [ADR-0005](docs/decisions/adr-0005-api-strategy.md)             |
| Database & tenancy       | Postgres 18 on Neon; shared schema + `tenant_id` (uuidv7) + RLS; Drizzle ORM + Kysely                                                          | [ADR-0006](docs/decisions/adr-0006-database-multi-tenancy.md)   |
| Jobs & durable execution | Trigger.dev v4 (self-hostable) as the single substrate for jobs and AI workers                                                                 | [ADR-0007](docs/decisions/adr-0007-jobs-durable-execution.md)   |
| Auth                     | better-auth self-hosted + organization plugin; WorkOS as enterprise SSO/SCIM fallback                                                          | [ADR-0008](docs/decisions/adr-0008-authentication.md)           |
| Design-system stack      | Tailwind v4 `@theme` + DTCG tokens, Base UI primitives, Motion                                                                                 | [ADR-0009](docs/decisions/adr-0009-design-system-stack.md)      |
| AI layer                 | Vercel AI SDK v7 + thin loops per Anthropic guidance; Claude Agent SDK for heavyweight workers; contextual + hybrid + reranked RAG on pgvector | [ADR-0010](docs/decisions/adr-0010-ai-layer.md)                 |

## Detail documents

| Document                                                                       | Contents                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md) | Module map, request lifecycles, deployment topology, observability       |
| [`docs/architecture/multi-tenancy.md`](docs/architecture/multi-tenancy.md)     | Tenancy model, RLS mechanics, pooling, scale exits                       |
| [`docs/architecture/data-model.md`](docs/architecture/data-model.md)           | Object graph: objects/records/attributes/lists, timeline, context stream |
| [`docs/architecture/ai-system.md`](docs/architecture/ai-system.md)             | AI workers, agent trust infrastructure, retrieval pipeline               |

## Principles the architecture must never violate

1. **Postgres is the center of gravity.** Tenancy (RLS), vectors
   (pgvector), audit, and sync (CDC) compound on one operational
   competence. Every table carries `tenant_id` — this preserves every
   scale exit (Citus, PlanetScale Postgres, silo-per-enterprise-tenant).
2. **Tenant isolation is enforced in the database**, not only in
   application code. Any access path that bypasses RLS (jobs, exports,
   analytics) implements explicit tenant scoping and is tested for it
   (`TESTING.md` rule: tenant-isolation test per queryable resource).
3. **Every mutation is a typed, permissioned, audited operation** —
   invocable identically by humans (UI), integrations (API), and AI
   workers (tools). There is one write path per operation.
4. **Agent side effects are journaled durable steps.** No AI worker calls a
   side-effecting tool outside the durable-execution substrate; approvals
   are waitpoints.
5. **The client is optimistic; the server is authoritative.** Perceived
   < 100 ms interactions come from the client data layer; correctness
   comes from server validation + rebase on conflict.
6. **Boundaries before services.** Module packages may only import each
   other's published interfaces (enforced in CI). Extraction is earned by
   evidence of divergent scaling, never by fashion.
7. **Observability is OTel from day one** so backends stay swappable;
   audit log is domain data in Postgres, not a logging afterthought.

## Vendor-risk register

Tracked because several picks are young; each ADR names its revisit
trigger. Summary: better-auth (seed-stage), Drizzle 1.0 (RC — pin 0.45.x),
TanStack DB (beta — contained client-side), TanStack Start (RC — not used),
Zero (re-evaluate ~1.10+), Neon (Databricks-owned), Turborepo 3.0
(telegraphed). Full analysis in the stack research appendix.
