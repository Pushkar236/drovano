# Changelog

All notable changes to Drovano are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/) once application code exists;
pre-application milestones are dated entries.

## [Unreleased]

### Added

- 2026-07-07 — Object-graph storage engine (M2 begins; TASK-0021):
  `object_definitions`/`attribute_definitions`/`records`/`record_values`
  — typed-EAV with one concrete column per value kind, a database CHECK
  enforcing single-kind rows, tenant-leading indexes, RLS + FORCE on all
  four (migrations 0004/0005); `@drovano/crm` module — definition and
  record services (13 attribute types zod-validated, cursor pagination,
  soft delete, provenance, transactional audit) with typed `CrmError`s;
  permission vocabulary grew record.view/create/update/delete +
  object.manage (matrix now 51 cases). **Scale NFR validated: all p95
  budgets green at 1,000,000 records / 2M values** through RLS on the
  app role (bulk-load seeding: drop indexes → batched CTE seed →
  rebuild); CI benchmarks run at 100k per PR.

- 2026-07-07 — **M1 complete** (TASK-0018 done): API p95 latency budgets
  enforced as benchmark tests over the real stack (single read < 150ms,
  list < 300ms, anonymous context resolution < 150ms — PRD §5), joining
  the bundle budgets in CI. All 17 M1 tasks closed; see
  `docs/prompts/prompt-03.md` for the M2 mandate.

- 2026-07-07 — Realtime gateway (TASK-0020, ADR-0003): `@drovano/realtime`
  — session-authenticated WebSockets where the server derives the tenant
  from the session's active organization (clients never name a channel;
  nothing to spoof); Redis pub/sub fan-out of coarse
  `{ resource }` invalidation events; API publishes after mutations
  (no-op without REDIS_URL); web client reconnects with backoff and
  invalidates the matching query key so TanStack DB live views refresh.
  Five integration tests run the full loop against real Postgres + Redis
  containers: authenticated connect, tenant-scoped delivery with
  cross-tenant silence, malformed-payload resilience, cleanup.

- 2026-07-07 — Client data layer + API live (TASK-0019 done, TASK-0017
  done): web app signs in (login/sign-up on better-auth client),
  onboards the first organization, and reads/writes real data through
  the blessed pattern — TanStack DB collection over the tRPC client with
  optimistic updates that roll back on server refusal (workspace rename;
  errors surfaced with the server's decision reason); session-gated
  shell, Workspaces surface, sign-out command; Vite dev proxy keeps
  cookies first-party; collection tests prove optimistic-then-converge
  and automatic rollback with server-faithful stubs. API deployed to
  Render (https://drovano-api.onrender.com, healthz verified, UptimeRobot
  monitors on api+web); js bundle budget consciously raised to 240 KiB
  for the data layer (route splitting planned for M2).

- 2026-07-07 — Environments live (TASK-0017 part 1, TASK-0010 complete):
  Neon Postgres 18.4 migrated (0000–0003) with the `drovano_app_login`
  role and a production RLS smoke test over the pooler (no-GUC → zero
  rows; direct tenant INSERT denied); web shell deployed to Vercel
  (https://drovano-web.vercel.app, SPA rewrites verified);
  `@drovano/telemetry` — Sentry (OTel-based) behind a service-owned
  interface, disabled without a DSN, PII off, wired into the API's
  onError with graceful flush; API production bundle via tsup (workspace
  source bundled, deps external) verified end-to-end against Neon
  (healthz + real signup); `render.yaml` blueprint for the API (build,
  pre-deploy migrations, health check, env contract). TASK-0012 resolved
  for M1 under the zero-cost constraint (tokenized system stacks).

- 2026-07-07 — Bundle budgets in CI (TASK-0018 part 1):
  `scripts/check-bundle-size.ts` enforces gzip budgets from
  `apps/web/bundle-budget.json` (js 120 KiB — currently 86.3; css 12 KiB
  — currently 4.6) after the production build; raising a budget is a
  reviewed change. API-latency budgets follow environments (TASK-0017).

- 2026-07-07 — App shell (TASK-0016, ADR-0002): `@drovano/web` — Vite 8 +
  React 19.2 SPA with TanStack Router; three-zone Strata shell (rail with
  collapse, canvas with focus-on-navigate h1s and skip link, peek panel);
  owned command surface (Ctrl/⌘K combobox+listbox with
  aria-activedescendant, filter, focus restore) with the command
  registry; light/dark/system theming persisted via `data-theme`;
  Tailwind v4 wired through a **generated** `@theme inline` bridge from
  the token source (`strata-tailwind.css`) so utilities can never drift
  from tokens; 9 shell tests (keymap, palette keyboard model, theme
  persistence, landmarks, axe); production build at ~89 kB gzip.

- 2026-07-07 — Interaction & voice specifications (TASK-0014, TASK-0015):
  `docs/design-system/interaction.md` — global keymap, the full ⌘K
  command-surface spec (three result groups, keyboard model, a11y
  wiring), focus-management rules, three-zone shell behaviors;
  `docs/design-system/voice.md` — product voice, the three unloved
  states' copy patterns, AI attribution language, destructive-action
  copy, transactional email rules.

- 2026-07-07 — Strata component library batch 1 (TASK-0013, ADR-0009):
  `@drovano/ui` — Button (4 variants, loading/disabled, darkening
  interaction states), Input (Base UI Field: wired label/description/
  error), Dialog and Menu (Base UI, trigger semantics merged onto real
  elements — no wrapper nodes in the a11y tree, axe-verified), Table
  shell (hairline seams, sticky header, tabular numerals); CSS Modules
  over semantic tokens only; Storybook 10 with light/dark toolbar and
  addon-a11y (error level); 19 behavior + axe tests in jsdom; shadow
  token type added to the token pipeline for the one legitimate overlay
  shadow; component specs in `docs/design-system/components/`.

- 2026-07-07 — Strata design tokens (TASK-0011, ADR-0009):
  `@drovano/tokens` — DTCG `tokens.json` (OKLCH graphite neutrals, single
  ember accent, semantic status hues, 4px-grid spacing, type scale,
  motion durations/easings, radii, z-scale; light/dark semantic tiers
  with enforced parity); OKLCH→sRGB color math; CSS build emitting
  `strata.css` (primitives + var()-referenced semantics, dark via
  `data-theme` and `prefers-color-scheme`); **WCAG AA contrast contract
  in CI** — 17 readable pairs × both themes + gamut + completeness checks
  (47 tests). The math forced one design rule: accent hover/active darken
  in both themes. Spec: `docs/design-system/tokens.md`.

- 2026-07-07 — Permission service & audit writer (TASK-0009, TASK-0010
  part 1): `@drovano/permissions` — pure, deny-by-default `can(principal,
action)` with reasons on every decision, org + workspace role rules,
  agents denied until scoped grants (TASK-0037); 36-case exhaustive
  allow/deny matrix test with completeness check. `writeAuditEntry` in
  `@drovano/db`: transactional, append-only, RLS-checked (mismatched
  tenant fails closed), with rollback and jsonb round-trip tests.

- 2026-07-07 — Authentication & organizations (TASK-0008, ADR-0008,
  ADR-0011): `@drovano/identity` module — better-auth 1.6 with argon2id
  password hashing, TOTP two-factor, email verification, and the
  organization plugin; organization creation provisions the tenant row,
  default "General" workspace, creator membership, and audit entry
  atomically via the `provision_tenant()` SECURITY DEFINER function;
  identity tables added to `@drovano/db` as documented-global tables
  (ADR-0011) with workspaces/workspace_members as RLS-scoped domain
  tables (migrations 0002/0003); `apps/api` Hono skeleton mounting the
  auth handler with zod-validated env and graceful shutdown; 11 new
  integration tests (signup, sign-in failures, provisioning, invitation
  acceptance with real email-verification flow, TOTP enrolment,
  workspace tenant isolation, HTTP-level auth routes).

- 2026-07-07 — M1 begins (Prompt 02, TASK-0004…0007): pnpm 10 + Turborepo
  monorepo with catalogs, Boundaries tags, and shared tsconfig presets
  (`@drovano/config`); CI quality gate (format, zero-warning ESLint
  strict-type-checked, typecheck, boundaries, tests, verify-docs, gitleaks)
  plus Renovate and pre-commit hooks; `@drovano/db` — Drizzle schema with
  RLS policies as code (`tenants`, append-only `audit_log`), migrations
  0000/0001 (non-owner `drovano_app` role, least-privilege grants, FORCE
  ROW LEVEL SECURITY), the `withTenant` tenant-scoping helper, and a
  Testcontainers real-Postgres-18 harness with nine tenant-isolation tests
  exercised through the app role; `scripts/verify-docs.ts` documentation
  consistency checker with unit tests.

- 2026-07-07 — Engineering foundation (Prompt 01, M0): repository and
  documentation structure; market, stack, and design research (snapshots
  dated 2026-07-06); product
  vision (`PROJECT.md`); PRD v1 (`docs/PRD.md`); architecture proposal
  (`ARCHITECTURE.md`, `docs/architecture/`); ADR-0001…ADR-0010; design
  philosophy (`DESIGN_SYSTEM.md`); engineering standards
  (`CODING_STANDARDS.md`, `TESTING.md`, `SECURITY.md`, `CONTRIBUTING.md`);
  roadmap (`ROADMAP.md`); initial backlog (`docs/tasks/BACKLOG.md`);
  Prompt 02 brief (`docs/prompts/prompt-02-brief.md`).
