# Prompt 02 Brief — Platform Skeleton (M1 begins)

> **Status:** brief for the next working session, written 2026-07-07 at
> the close of Prompt 01 (M0). Prompt 01 record:
> [`prompt-01-foundation.md`](prompt-01-foundation.md).

## Progress log

- **Session 2, continued (2026-07-07):** TASK-0009 landed
  (`@drovano/permissions`, 36-case matrix) and TASK-0010's audit writer
  (`writeAuditEntry` in `@drovano/db`, transactional + fail-closed).
  TASK-0010's OTel/Sentry wiring is deliberately deferred to pair with
  TASK-0017 — Sentry DSN and platform accounts are credentials the user
  must provide; batch those requests. **Remaining M1:** telemetry wiring
  (0010b), design track (0011–0015), app shell (0016), environments
  (0017, blocked on credentials), perf budgets (0018), client data layer
  (0019), realtime gateway (0020).

- **Session 2 (2026-07-07):** TASK-0008 landed and green: better-auth
  1.6.23 in `@drovano/identity` (argon2id, TOTP MFA, organizations,
  invitations), identity tables in `@drovano/db` (global per ADR-0011),
  workspaces + workspace_members (tenant-scoped, RLS), the
  `provision_tenant()` SECURITY DEFINER primitive, and the first
  `apps/api` Hono skeleton. 30 tests green workspace-wide.
  **Next up: TASK-0009 (permission service) and TASK-0010 (audit writer +
  OTel/Sentry).** Notes: the permission service should model org roles
  (owner/admin/member, from better-auth `members`) and workspace roles
  (`workspace_members.role`) behind one `can(principal, action, resource)`
  interface; audit writer wraps the pattern already used by
  provision_tenant (insert in the same transaction as the mutation).

- **Session 1 (2026-07-07):** TASK-0004…0007 landed and green
  (commit `080c8af`): monorepo scaffold, CI gates, `@drovano/db` with RLS
  and nine tenant-isolation tests through the app role, and the
  verify-docs checker.
  **Next up: TASK-0008 (auth)** — the isolation-tests gate is satisfied.
  Notes for the auth session: research current better-auth 1.6.x docs
  before designing (drizzle adapter + schema generation + organization
  plugin APIs move fast); the auth tables must reconcile with the
  `tenants` anchor table (see `packages/db/src/schema.ts` — organizations
  map 1:1 onto `tenants`, they do not replace it); TASK-0008 also pulls in
  the first `apps/api` Hono skeleton, since better-auth mounts as an HTTP
  handler.

## Starting state

M0 is complete: vision, research, PRD, architecture, ADR-0001…0010,
standards, design language, roadmap, and backlog are committed. **No
application code exists.** Prompt 02 lifts the no-code mandate and begins
M1 (`ROADMAP.md`).

## Prompt 02 should accomplish

Work the M1 backlog in dependency order, honoring every standard already
set (CODING_STANDARDS.md, TESTING.md, SECURITY.md, CONTRIBUTING.md —
production-ready only, no placeholders):

1. **TASK-0005 / TASK-0006** — monorepo scaffold + CI gates. First PR-able
   unit; everything else builds on it.
2. **TASK-0007** — `packages/db` with RLS-as-code and the Testcontainers
   tenant-isolation harness. _The isolation tests are the milestone's
   soul; do not proceed to auth until they're green._
3. **TASK-0008 / TASK-0009 / TASK-0010** — auth + orgs, permission
   service, audit + telemetry.
4. **TASK-0011 / TASK-0012** — token set and typography (design track can
   run parallel to backend tasks).
5. As capacity allows: TASK-0004 (verify-docs script), TASK-0013…0016
   (components, interaction spec, app shell), TASK-0017 (environments).

A realistic single session lands 1–3 of these well rather than all of
them thinly. Depth over breadth; every task Done means tests, states,
a11y, docs, CHANGELOG — per the PR checklist.

## Constraints carried forward

- Pin versions per the research (Drizzle 0.45.x, not 1.0-rc; TanStack DB
  pinned; better-auth pinned) — revisit triggers live in the ADRs.
- Every table: `tenant_id`, RLS policy, `FORCE ROW LEVEL SECURITY`,
  tenant-leading indexes (multi-tenancy.md checklist).
- No new dependencies without the CONTRIBUTING.md justification.
- Update `CHANGELOG.md` and task statuses in `BACKLOG.md` as work lands;
  create per-task files from the template when a task starts.

## Open items Prompt 02 may hit

- Neon account/keys, Vercel/Render/Sentry accounts (TASK-0017) — **will
  require credentials from the user**; batch these requests.
- Typeface purchase (TASK-0012) — shortlist + rendering tests can be
  done; the purchase itself is a user decision (money).
- If Drizzle 1.0 has GA'd by session time, re-check the ADR-0006 revisit
  trigger before pinning.

## Risks to watch while implementing

- RLS footguns (owner bypass, missing `SET LOCAL`, index order) — the
  multi-tenancy.md rules are the checklist; test them, don't trust memory.
- Turborepo Boundaries is experimental — if it fights back, fall back to
  ESLint import rules + TS references and note it in ADR-0001.
- Scope creep into M2 (object graph) — resist; the skeleton must be
  boringly solid first.
