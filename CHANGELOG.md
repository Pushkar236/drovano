# Changelog

All notable changes to Drovano are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/) once application code exists;
pre-application milestones are dated entries.

## [Unreleased]

### Fixed

- 2026-07-08 — Initial payload 203 → 107.9 KiB: the shell was dragging
  @tanstack/db into the entry through `data/workspaces.ts` (it only
  needed the query client — now in `lib/query.ts`) and @base-ui/react
  through the statically-imported peek panel (now `React.lazy`, loaded
  when a peek first opens). Also pinned a gitleaks false positive
  (fake `drv_…` prefix in a test fixture) by fingerprint.

### Added

- 2026-07-08 — Agent trust infrastructure (TASK-0037): agents are
  first-class principals with SCOPED GRANTS, never roles —
  `@drovano/agents` (create/list agents, replace-set grants,
  `loadAgentPrincipal` feeding the same `can()` gate humans use, with a
  `GRANTABLE_ACTIONS` allowlist that fails closed and strips all grants
  from inactive agents), session logs (`ai_runs` via a best-effort
  `RunRecorder` + 5M-token/month tenant spend cap), and the
  provisional-until-accepted surface: agent writes land as `proposals`
  and become record values only when a human reviewer accepts — the
  status flip and the crm `updateRecordValues` (as the HUMAN actor)
  share one transaction at the contracts tier. New `agents` tRPC router
  (manage under `api.manage`, review under `record.update`), RLS-forced
  migrations 0010/0011, 13 new integration tests. Production Neon apply
  is staged (deploy-class action — awaiting approval).

- 2026-07-08 — AI harness (M3 opens: TASK-0034, eval scaffolding from
  TASK-0036): `@drovano/ai` — tier-based model router (`fast`/`balanced`/
  `frontier` → Anthropic; embeddings → OpenAI; missing keys disable the
  capability instead of failing boot), `runToolLoop` (bounded
  `generateText` over typed tools with hard `maxSteps`/`maxOutputTokens`
  caps and a `RunRecorder` seam for TASK-0037 session logs),
  `defineScenario`/`runScenarios` eval scaffolding, and stub-model
  testing exports — CI never calls a live model (TESTING.md AI rules).
  8 stubbed-model tests green. Live runs await an Anthropic API key
  (batched user ask).

- 2026-07-08 — Decision records closing M2 (TASK-0030/0031): ADR-0012
  buys meeting capture (Recall.ai — $0.50/hr usage-only, market-leading
  coverage) behind an owned `MeetingCapture` interface after the native
  path priced out at ~3-5 engineers with no official Google Meet media
  API; ADR-0013 supplies enrichment through an owned waterfall over
  direct providers — People Data Labs first (pay-per-match, free dev
  tier), Apollo second when measured match rates justify it — rejecting
  aggregator subscriptions and enterprise-only Clearbit on bundle unit
  economics and provenance.

- 2026-07-08 — Public API v1 + webhook skeleton (TASK-0029): REST read
  paths on the Hono app — `GET /v1/objects`, `/v1/records?object=<key>`,
  `/v1/records/:id` — reusing the SAME crm services as tRPC, behind
  bearer API keys (`drv_<48 hex>`, sha256 hash stored, secret shown
  once). New `@drovano/platform` module owns keys + webhooks; `api_keys`
  is the documented GLOBAL exception (ADR-0011 reasoning: the hash
  lookup IS tenant discovery) while `webhooks` is tenant-scoped under
  FORCE RLS (migrations 0008/0009, applied to production). New
  `api.manage` permission (owner/admin; matrix now 57 cases).
  `platform.apiKeys.*` / `platform.webhooks.*` tRPC routers + settings
  UI (secrets shown once, revoke/remove). Record create/update/delete
  dispatch signed webhook events (HMAC-SHA256 of the body in
  `X-Drovano-Signature: sha256=<hex>`) next to cache invalidation —
  fire-and-forget, no retries in v1 (documented; queue lands with M3
  automations). 6 platform + 34 api + 33 web + 57 permission tests
  green; dispatcher signature verified against a live local receiver.

- 2026-07-07 — CSV import (TASK-0028): `crm.records.import` takes
  structured rows (client parses + maps columns) so validation, dedupe,
  and writes go through the SAME services as manual entry — no bulk side
  door around audit or relation checks; per-row errors with indexes,
  dedupe by a text-like attribute (skip or update, in-file duplicates
  handled), dry-run classifies without writing, 500-row calls batched
  client-side, one `record.import` audit summary per call. Import page
  at `/o/$objectKey/import`: owned RFC 4180 parser (quoted fields,
  embedded commas/newlines/escaped quotes — unit-tested, no dependency),
  header auto-mapping, dedupe picker, dry-run preview, per-row error
  listing. 29 web + 26 api + 29 crm tests green.

- 2026-07-07 — Record timeline & peek panel (TASK-0027): the audit trail
  IS the timeline — `crm.records.activity` reads the same transactional
  audit rows every mutation already writes (no second write path to
  drift), newest first, uuidv7-id cursor. The shell's context panel goes
  live: Space on a grid row (or any surface calling `openPeek`) inspects
  the record — values plus its activity feed with human action phrasing
  and non-human actors marked — without leaving the view; Esc-free close
  button, per-record query caching. 23 web + 25 api tests green.

- 2026-07-07 — Route-level code splitting + live deploy refresh: every
  page component lazy-loads via `lazyRouteComponent`; the bundle budget
  now measures the INITIAL payload (entry + static-import closure walked
  from the Vite manifest — route chunks are lazy and unbudgeted), and
  the js budget tightened 240 → 180 KiB (initial payload measured 155.9
  KiB, down from 230 KiB summed). Web redeployed to Vercel with all M2
  surfaces and a new `/api/*` rewrite proxying to the Render API — the
  deployed app now authenticates first-party (verified:
  `/api/auth/get-session` 200 through the proxy); realtime WS stays
  direct-to-gateway when it deploys (Vercel rewrites don't proxy
  websockets).

- 2026-07-07 — Pipelines & kanban (TASK-0026): `createPipeline` (list +
  system `stage` select attribute in one call; API + service + tests);
  `/lists` index with the create-pipeline flow; `/lists/$listId` board —
  lanes from the stage options plus a No-stage lane, cards moved through
  an explicit menu (the non-drag path ships first per DESIGN_SYSTEM rule 10) with optimistic entry-plane updates that roll back on refusal;
  entries collection per list; attribute `config` now exposed by
  `crm.objects`. Entity truth verified untouched by stage moves through
  the API. 22 web + 24 api tests green; bundle 230/240 KiB (route
  splitting is next M2 UI touch).

- 2026-07-07 — Records grid (TASK-0025 complete): `/o/$objectKey` surface
  with object tabs, driven by live definitions; virtualized rows
  (@tanstack/react-virtual) at 32px dense rhythm; roving-focus keyboard
  grid (arrows/Home/End/PageUp/PageDown, Enter to edit, Esc to cancel)
  with ARIA grid semantics; optimistic inline cell edit riding
  crm.records.update with automatic rollback + surfaced reasons; new
  record creation through the collection; Records nav + palette entry.
  Test learnings baked in: an ACTIVE ResizeObserver polyfill for
  jsdom+virtual-core, and server-faithful stubs must return fresh
  objects (identity aliasing hid updates). 19 web tests green; bundle
  191.6/240 KiB.

- 2026-07-07 — Lists & saved views (TASK-0024): `lists`, `list_entries`,
  `list_entry_values` (typed-EAV on the ENTRY plane — the Attio-signature
  separation: process state like pipeline stage lives on list entries,
  entity truth on records stays untouched, proven by test), and
  `saved_views` (zod-validated filters/sorts/groupBy/columns over an
  object or list) — migrations 0006/0007 with scope CHECKs, single-kind
  CHECK, RLS + FORCE, applied to Neon. attribute_definitions now scopes
  to object XOR list (partial unique indexes). `list.create` joins the
  permission matrix (member-level; 54 cases). CRM services:
  create/add/remove/setEntryValues/listEntries hydrating both value
  planes per entry.

- 2026-07-07 — Relations (TASK-0023): relation writes verify their target
  exists, isn't deleted, and matches the configured object — cross-tenant
  targets fail identically to nonexistent ones (RLS, nothing leaked);
  reverse traversal (`listIncomingRelations`, riding the value_uuid
  index) answers "who points here"; deleting a record removes incoming
  edges (nothing dangles, per data-model invariant 5) with the count in
  the delete audit. 'user'-typed values point at principals and survive
  record deletion by design.

- 2026-07-07 — Standard objects (TASK-0022): catalog-as-code in
  `@drovano/crm` — Company, Person, Deal with system attributes
  (relations wired by object key at seed time; deal stages deliberately
  deferred to pipeline lists, TASK-0024/0026); seeded idempotently on
  organization creation via a new `afterOrganizationProvisioned` hook on
  `createAuth`, composed at the app tier so modules never import each
  other; verified through real org creation in the API suite.

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
