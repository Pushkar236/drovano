# Roadmap

> **Status:** v1.0, 2026-07-07. Milestones are scope-gated, not date-gated
> (quality bars are non-negotiable; speed is not optimized for). Task-level
> detail lives in [`docs/tasks/BACKLOG.md`](docs/tasks/BACKLOG.md); product
> scope in [`docs/PRD.md`](docs/PRD.md). Each milestone ends with a
> consistency review of docs against reality.

## M0 — Foundation (documentation) ✅ 2026-07-07

Everything in this repository: vision (`PROJECT.md`), research
(`docs/research/`), PRD, architecture + ADR-0001…0010, engineering
standards (`CODING_STANDARDS.md`, `TESTING.md`, `SECURITY.md`,
`CONTRIBUTING.md`), design language (`DESIGN_SYSTEM.md`), this roadmap,
and the initial backlog. **No application code** (by mandate).

## M1 — Platform skeleton & design system

**Goal:** a running, deployed, empty-but-real platform: monorepo, CI,
database with RLS, auth with organizations, the Strata token/component
foundation, and the testing/observability harness. "Walking skeleton" —
every architectural principle exercised once.

- Monorepo scaffold per ADR-0001 (pnpm, Turborepo, boundaries, shared
  configs); CI gates per CONTRIBUTING.md (build/lint/typecheck/tests).
- `packages/db`: Drizzle schema baseline, RLS policies as code, migration
  pipeline, Testcontainers integration harness; **tenant-isolation tests
  green before any feature table**.
- better-auth + organization plugin: signup, sessions, MFA, orgs,
  workspaces, invitations, roles (ADR-0008).
- Permission service package (allow/deny matrix tested); audit-log writer;
  OTel + Sentry wiring.
- Strata implementation start: DTCG token set (TASK-0011), typography
  selection (TASK-0012), first component specs + Storybook with axe checks
  (TASK-0013+), interaction/keyboard spec (TASK-0014), voice (TASK-0015).
- App shell: Vite SPA, TanStack Router, ⌘K skeleton, three-zone layout,
  dark/light.
- **Performance budgets from PRD §5 encoded in CI** (per TESTING.md) —
  enforced from this milestone on.
- Deploy: preview/staging/production environments live (Vercel + Render +
  Neon).

**Exit:** a new organization can sign up, create a workspace, invite a
member, and see an empty (designed) product — with RLS, audit, budgets,
and a11y checks all green in CI.

## M2 — The object graph & CRM core

**Goal:** the data model is real: objects/records/attributes/lists/views,
timeline, and the CRM standard objects — fast at scale.

- Records + typed-EAV hybrid storage with 1M-records-per-workspace
  benchmarks (data-model.md §4); custom objects/attributes without DDL.
- People/Companies/Deals; relations; lists with list-scoped attributes;
  table view (virtualized, inline edit, keyboard grid) and kanban;
  pipelines; saved views; CSV import with mapping + dedupe.
- Record timeline (append-only, provenance-carrying); record peek panel.
- Public API v1 read paths + webhooks skeleton (ADR-0005).
- Decisions due: meeting-bot vendor vs native capture; enrichment
  providers (DECISIONS.md "upcoming").

**Exit:** a workspace can model its business and work its pipeline
keyboard-first within all performance budgets — with zero AI yet, and
therefore not yet a product (by design; the AI-native test comes next).

## M3 — Zero-entry & the AI substrate

**Goal:** the record updates itself; the AI infrastructure (harness,
retrieval, agent trust) is production-real.

- Gmail/Google Calendar + Outlook/M365 two-way sync; auto-create/update
  of People/Companies; signals land on timelines (durable, resumable —
  ADR-0007).
- `packages/ai` harness (ADR-0010); retrieval pipeline (contextual +
  hybrid + rerank) with permission-filtered retrieval tools; pgvector
  tables; eval scaffolding + scheduled scenario evals (TESTING.md).
- Agent principals with scoped grants; session logs; provisional-until-
  accepted surfaces; spend caps (ai-system.md).
- **Record keeper** worker live (dedupe/merge proposals, AI attributes);
  **research assistant** live (cited web research).
- Enrichment waterfall v1.

**Exit:** connect email/calendar → watch the graph build and maintain
itself, every AI action attributed, reversible, and logged. The AI-native
test now passes.

## M4 — The wedge product & v1 GA

**Goal:** meeting intelligence end-to-end; reporting; packaging; GA
readiness.

- **Meeting assistant**: recording/transcription, summaries, extracted
  actions → proposed tasks, proposed attribute updates, drafted
  follow-ups (human-gated send), prep briefs (PRD §3.3).
- Tasks + calendar module complete; notes/documents with retrieval
  (⌘K NL answers); automation rules v1 with NL drafting.
- Analytics: pipeline/activity reporting + NL querying (PRD §3.5).
- Public API v1 complete + TypeScript SDK (Speakeasy) + **MCP server**;
  API docs.
- **Security hardening for GA (SECURITY.md):** external penetration test;
  **incident-response runbook written and drilled** (required before
  production); restore drill meeting RPO/RTO; prompt-injection red-team
  pass on all three workers.
- Pricing/packaging implementation (PRD §6: seats + one meter with caps);
  billing; marketing site (stack decision due — DECISIONS.md).

**Exit = v1 GA:** the PRD §8 activation and wedge metrics are measurable
and being measured; all NFR budgets green; security gates passed.

## Post-v1 themes (sequenced by evidence, not promised)

Enterprise tier (SAML at standard tier already; SCIM, audit export,
residency, silo isolation — ADR-0006 bridge); ElectricSQL shapes where
invalidation misses budgets (ADR-0003); marketplace & embedded apps;
Slack capture; email sequencing; mobile; additional AI workers (depth
first, per PRD §3.5); localization.

## Standing revisit triggers

Collected from ADRs — checked at every milestone boundary: Drizzle 1.0 GA
(lift pin); TanStack DB 1.0; TanStack Start GA + 6 months; Zero ~1.10+
with production logos; Turborepo 3.0; better-auth SSO go/no-go before
first enterprise deal; ~10M vectors → Turbopuffer; oRPC maturity; Neon
post-Databricks drift.
