# Prompt 03 — The Object Graph (M2 begins)

> **Status:** mandate for M2, written 2026-07-07 at the close of M1.
> Prior records: [`prompt-01-foundation.md`](prompt-01-foundation.md),
> [`prompt-02-brief.md`](prompt-02-brief.md) (M1 progress log).

## Progress log

- **Session 1, TASK-0029 done (2026-07-08):** shipped as designed with
  two deviations worth recording. (1) The dispatcher HTTP impl lives in
  `@drovano/platform` (not apps/api) — the module owns domain logic and
  the Testcontainers test proves the signature against a live local
  receiver; apps/api only wires `createWebhookDispatcher({db, onError})`
  into the request context. (2) Migrations 0008/0009 were applied to
  Neon over the HTTPS SQL endpoint (`https://<endpoint-host>/sql`,
  `neon-connection-string` header) because the local network RESET every
  TLS connection to port 5432 that day — the applier replicated
  drizzle's bookkeeping exactly (sha256 of file text +
  journal `when` into `drizzle.__drizzle_migrations`), then production
  state was verified (FORCE RLS + policy + grants). Keep that trick for
  future 5432 outages. M2 at 9/11. Next: **TASK-0030/0031 — research
  ADRs** (meeting-bot vendor vs native capture; enrichment providers) —
  research → decide → write `docs/adr/`; then the M2 milestone review +
  write prompt-04 (M3: zero-entry, AI workers).

- **Session 1, TASK-0029 in progress (2026-07-07):** design locked:
  `api_keys` table is GLOBAL per ADR-0011 precedent (bearer-hash lookup
  happens before the tenant is known — same reasoning as identity
  tables): id, tenant_id, name, key_prefix (display), key_hash (sha256),
  created_by, last_used_at, revoked_at. `webhooks` table is
  tenant-scoped RLS-normal: url, events jsonb, secret, active,
  created_by. Key format `drv_<48 hex>`; secret shown once at creation.
  New permission action `api.manage` (owner+admin only) + matrix rows.
  tRPC: `platform.apiKeys.create/list/revoke`,
  `platform.webhooks.create/list/remove`. REST on the Hono app:
  GET /v1/objects, /v1/records?object=<key>, /v1/records/:id — bearer
  auth middleware hashes the token, looks up api_keys, sets tenant via
  withTenant, reuses crm services; JSON errors {error:{code,message}}.
  Webhooks v1: `ctx.webhooks.dispatch(tenantId, {event, recordId})` on
  RequestContext (noop default; HTTP impl in apps/api) called next to
  invalidation.publish in record create/update/delete; HMAC-SHA256 of
  the body in X-Drovano-Signature (sha256=hex); fire-and-forget, NO
  retries in v1 (documented). Tests: REST auth (401 bad key, 200 +
  tenant-scoped data, revoked key rejected), member denied api.manage,
  dispatcher signature verified against a local http server.

- **Session 1, csv import (2026-07-07):** TASK-0028 done. M2 at 8/11.
  Next: **TASK-0029 (public API v1 read paths + webhook skeleton,
  ADR-0005)** — REST read endpoints on the Hono app (`/v1/objects`,
  `/v1/records?object=`, `/v1/records/:id`) deriving schemas from the
  same zod sources; auth via per-tenant API keys (new tenant-scoped
  `api_keys` table: hashed key, name, created_by, last_used_at; manage
  via tRPC + settings UI; key format `drv_<random>`); webhook skeleton:
  `webhooks` table (url, events, secret) + a dispatcher that POSTs
  signed (HMAC) invalidation-grade events post-commit — v1 delivers
  record.created/updated/deleted, no retries yet (documented). Then
  0030/0031 ADRs (research → decide), then the milestone review + write
  prompt-04.

- **Session 1, timeline+peek (2026-07-07):** TASK-0027 done. M2 at 7/11.
  Next: **TASK-0028 (CSV import)** — server: an import service in the
  crm module (parse rows → map columns to attribute keys → validate via
  the same VALIDATORS → batch-create records; dedupe by a chosen key
  e.g. email/domain: skip-or-update policy); wire as a mutation taking
  parsed rows (client parses CSV — keep the server payload structured
  JSON, cap rows per call, loop batches client-side); UI: upload +
  column-mapping step + dry-run preview (validate-only mode) + result
  summary (created/updated/skipped/errors per row). Reuse the bulk-load
  discipline only if benchmarks demand (normal imports are ≤ thousands
  of rows; the 50k-CTE path is for seed-scale). Then TASK-0029 public
  REST + webhooks, 0030/0031 ADRs.

- **Session 1, kanban (2026-07-07):** TASK-0026 done. M2 at 6/11.
  **Bundle is at 230/240 KiB — do route-level code splitting
  (lazy routes) as the FIRST step of the next web change.** Next:
  TASK-0027 (record timeline + peek panel — v1 source: audit_log rows
  filtered by resourceId=recordId via a crm.records.activity procedure;
  peek panel = the shell's context panel fed by a selected record).

- **Session 1, grid (2026-07-07):** TASK-0025 fully done (engine +
  surface + grid). M2 at 5/11. Next: **TASK-0026 (kanban + pipelines)** —
  lanes from a list's select-typed attribute (groupBy in ViewConfig);
  server: listListEntries already returns both planes; UI: lane columns,
  card = record summary, move-card = setListEntryValues optimistic;
  plus a "create pipeline" flow (createList + stage attribute with
  options). Then TASK-0027 (timeline + peek panel — needs an
  activity/timeline read model; audit_log rows per record are the v1
  source), 0028 CSV import (reuse bulk-load discipline), 0029 public
  REST, 0030/0031 ADRs.

- **Session 1, crm surface (2026-07-07):** TASK-0025 part 2 done — the
  full CRM tRPC surface (routers stayed in api-contracts per the
  boundary note; revisit if a second consumer appears). **Part 3 (the
  grid UI) is what remains of TASK-0025:** apps/web records surface —
  route `/o/$objectKey` driven by `crm.objects`; TanStack DB collection
  per (object, view-config) keyed on the query input; virtualized rows
  (add `@tanstack/react-virtual` to the catalog); keyboard grid per
  interaction.md (arrows/Home/End/PageUp/PageDown/Enter to edit/Esc to
  cancel) built on the ui Table shell styles; inline cell edit riding
  `crm.records.update` optimistically; `records` realtime resource
  already publishes. Wire nav + palette entries per object. Tests:
  keyboard model + optimistic edit + axe (mock trpc like
  shell.test.tsx does auth).

- **Session 1, view engine (2026-07-07):** TASK-0025 part 1 done —
  `queryRecords` (EXISTS-probe filters, correlated-subquery sorts,
  keyset/offset pagination split). **Part 2 next: the CRM tRPC surface**
  — per api-contracts README invariant 2, define `crmRouter` IN
  `@drovano/crm` (module exports its router; needs @trpc/server +
  @drovano/permissions deps there — check boundaries: module may depend
  on shared+data only, so the trpc init/context types must come from a
  shared place… simplest boundary-clean route: keep routers in
  api-contracts for now (contracts tier may import modules) and revisit
  when a second consumer appears; do NOT fight the boundary rules).
  Routers needed: objects.list (definitions+attributes for the tenant),
  records.query (ViewConfig execution), records.create/update/delete,
  lists CRUD + entries, views CRUD — each following the rename exemplar
  (can() + audit in tx + invalidation publish). Part 3: the grid UI
  (virtualized table per DESIGN_SYSTEM §5, TanStack DB collection per
  view, inline edit riding records.update).

- **Session 1, lists (2026-07-07):** TASK-0024 done — lists + entry-plane
  typed-EAV + saved views (configs validated; execution engine — turning
  ViewConfig filters/sorts into SQL over the value tables — deliberately
  rides TASK-0025 with the table view that consumes it). M2 now 4/11.
  Next: **TASK-0025 (virtualized table view + keyboard grid)** — the
  biggest frontend unit; needs the view-config → query executor
  server-side plus records/lists tRPC routers, then the grid UI per
  DESIGN_SYSTEM §5 and interaction.md.

- **Session 1, relations (2026-07-07):** TASK-0023 done — write-time
  target integrity, reverse traversal, edge removal on soft delete.
  Many-to-many relation attributes deferred until a feature needs them
  (single-target attributes + reverse traversal cover the standard
  objects). Next: **TASK-0024 (lists + list-scoped attributes + saved
  views)** — the Attio-signature separation; design note: list entries
  are their own tenant-scoped table (list_id, record_id, position?) with
  list-scoped attribute values reusing the typed-EAV pattern keyed by
  (list_entry, attribute).

- **Session 1, continued (2026-07-07):** TASK-0022 done — standard-object
  catalog-as-code, seeded through `afterOrganizationProvisioned`
  (app-tier composition; modules stay decoupled). Existing dev/test
  tenants predating this are unseeded — `seedStandardObjects` is
  idempotent, so a backfill is one `withTenant` call when needed.
  Next: TASK-0023 (relations: typed bidirectional links + tombstoning —
  note `record_values.value_uuid` already stores relation targets; 0023
  adds referential behavior and reverse traversal).

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
