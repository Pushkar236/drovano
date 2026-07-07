# Prompt 02 Brief — Platform Skeleton (M1 begins)

> **Status:** brief for the next working session, written 2026-07-07 at
> the close of Prompt 01 (M0). Prompt 01 record:
> [`prompt-01-foundation.md`](prompt-01-foundation.md).

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
