# Decisions

Index of all Architecture Decision Records. Every major decision is
recorded as an ADR in [`docs/decisions/`](docs/decisions/) using
[`docs/templates/adr-template.md`](docs/templates/adr-template.md).
Decisions are made after research (see `docs/research/`), record the
alternatives considered, and name their revisit triggers. Changing a
decision means superseding its ADR, never editing history.

| ADR | Decision | Status | Tags |
|---|---|---|---|
| [ADR-0001](docs/decisions/adr-0001-typescript-monorepo.md) | TypeScript everywhere; pnpm 10 + Turborepo 2.x monorepo with TS project references and Boundaries | Accepted | process, backend, frontend |
| [ADR-0002](docs/decisions/adr-0002-frontend-framework.md) | Vite 8 + React 19.2 SPA with TanStack Router/Query; marketing site separate | Accepted | frontend |
| [ADR-0003](docs/decisions/adr-0003-client-data-layer.md) | TanStack DB collections + WS invalidation; ElectricSQL shapes as upgrade path; no hand-rolled sync engine | Accepted | frontend, data |
| [ADR-0004](docs/decisions/adr-0004-backend-modular-monolith.md) | Modular monolith on Hono 4.x with boundary-enforced module packages | Accepted | backend |
| [ADR-0005](docs/decisions/adr-0005-api-strategy.md) | tRPC v11 internal; public REST + OpenAPI from Zod v4; Speakeasy SDKs; tenant-scoped OAuth MCP server | Accepted | backend, ai |
| [ADR-0006](docs/decisions/adr-0006-database-multi-tenancy.md) | Postgres 18 on Neon; shared schema + tenant_id + RLS; Drizzle ORM + Kysely | Accepted | data, security, infra |
| [ADR-0007](docs/decisions/adr-0007-jobs-durable-execution.md) | Trigger.dev v4 as the single durable-execution substrate for jobs and AI workers | Accepted | backend, ai, infra |
| [ADR-0008](docs/decisions/adr-0008-authentication.md) | better-auth self-hosted with organization plugin; WorkOS as enterprise SSO/SCIM fallback | Accepted | security, backend |
| [ADR-0009](docs/decisions/adr-0009-design-system-stack.md) | DTCG tokens via Tailwind v4 `@theme`; Base UI primitives; Motion — implementing Strata | Accepted | design, frontend |
| [ADR-0010](docs/decisions/adr-0010-ai-layer.md) | Vercel AI SDK v7 + thin agent loops; contextual+hybrid+reranked RAG; pgvector → Turbopuffer exit | Accepted | ai, backend, data |

## Known upcoming decisions (no ADR yet)

Tracked so they aren't decided by accident:

- Meeting-bot vendor vs native capture (PRD §9.1 — due M2)
- Enrichment data providers and waterfall order (PRD §9.2 — due M2/M3)
- Marketing-site stack (Next 16 vs Astro — due M4, ADR-0002 defers it)
- Typeface purchase (TASK-0012 — recorded as a design-system spec, ADR
  only if it constrains licensing/embedding)
- Enterprise silo-tier activation (bridge model — trigger-based, see
  ADR-0006)
