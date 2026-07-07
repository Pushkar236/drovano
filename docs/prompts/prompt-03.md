# Prompt 03 — The Object Graph (M2 begins)

> **Status:** mandate for M2, written 2026-07-07 at the close of M1.
> Prior records: [`prompt-01-foundation.md`](prompt-01-foundation.md),
> [`prompt-02-brief.md`](prompt-02-brief.md) (M1 progress log).

## Progress log

- **Session 1 (2026-07-07):** TASK-0021 done — typed-EAV engine
  (migrations 0004/0005), `@drovano/crm` services, permission vocabulary
  extended, **1M-record NFR proven locally** (bulk-load seeding pattern
  in the benchmark; the naive single-statement seed killed the
  container — twice). Next: TASK-0022 (People/Companies/Deals standard
  objects — decide seeding via provision_tenant extension vs first-touch
  creation), then relations (TASK-0023).

## Why this milestone is next

`ROADMAP.md` sequences M2 after the walking skeleton, and M1 closed with
all 17 tasks done: RLS-verified tenancy in production, auth +
organizations, permission service, audit writer, Strata tokens/components/
shell, tRPC contracts with the optimistic-mutation pattern, realtime
invalidation, and CI-enforced quality + performance budgets. Every M2
feature lands on proven rails. The object graph is the product's spine
(PROJECT.md law 1) — nothing in M3 (zero-entry, AI workers) has value
until records exist to maintain.

## M2 scope (ROADMAP.md; tasks TASK-0021…0031)

Work in dependency order; the storage engine gates everything:

1. **TASK-0021 — records + typed-EAV hybrid** (`data-model.md` §4).
   Benchmarks against the 1M-records-per-workspace NFR are part of the
   task, not an afterthought; the latency-budget suite gets endpoint
   classes for record reads/list queries as they appear.
2. **TASK-0022/0023** — People/Companies/Deals with system attributes;
   typed bidirectional relations with tombstoning.
3. **TASK-0024** — lists with list-scoped attributes + saved views.
4. **TASK-0025/0026/0027** — table view (virtualized, inline edit, full
   keyboard grid per DESIGN_SYSTEM §5/interaction.md), kanban +
   pipelines, record timeline + peek panel.
5. **TASK-0028/0029** — CSV import (mapping + dedupe); public API v1 read
   paths + webhook skeleton (ADR-0005 — derive from the same Zod schemas).
6. **TASK-0030/0031** — ADRs: meeting-bot vendor vs native capture;
   enrichment providers (research before deciding, per the ADR template).

## Constraints & structure notes carried from M1

- New tenant-scoped tables copy the `audit_log` exemplar shape exactly
  (tenant_id + RLS policy + tenant-leading indexes + FORCE RLS + explicit
  grants in the companion migration). Isolation tests per resource are
  non-negotiable (TESTING.md rule 4).
- Every mutation follows the `workspaces.rename` exemplar: zod → `can()`
  with reason → mutate + audit in one tenant transaction → post-commit
  invalidation publish. Extend the permission Action union + matrix rows
  (the completeness test enforces this).
- The `crm` module package is born here (`packages/modules/crm`): its
  routers live in the module and `api-contracts` composes them —
  migrate the workspaces router to this structure while touching it.
- Route-level code splitting in the web app when the records surfaces
  land (bundle budget note in `apps/web/bundle-budget.json`).
- Local machine: run heavy turbo pipelines with `--concurrency=2` — the
  full parallel matrix OOM'd once (2026-07-07).

## Open items needing the user (batch, don't drip)

- **Upstash Redis** (free tier) account/URL → deploy `@drovano/realtime`
  as a second Render service + set `REDIS_URL` on the API.
- Repo visibility: currently **public** (unblocked Render); private again
  requires granting Render's GitHub App.
- Rotate the Neon owner password (was shared in chat during bootstrap).
- Email provider (Resend/Postmark free tier) when invitation emails
  should really send.

## Exit (ROADMAP.md)

A workspace can model its business and work its pipeline keyboard-first
within all performance budgets — deliberately pre-AI; the AI-native test
is M3's exit.
