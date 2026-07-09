# Prompt 04 — Zero-entry & the AI substrate (M3 begins)

> **Status:** mandate for M3, written 2026-07-08 at the close of M2.
> Prior records: [`prompt-01-foundation.md`](prompt-01-foundation.md),
> [`prompt-02-brief.md`](prompt-02-brief.md) (M1 log),
> [`prompt-03.md`](prompt-03.md) (M2 log).

## Progress log

- **Session 3, TASK-0032 phase 2 COMPLETE — UI + schedule (2026-07-09):**
  the Gmail loop is now closed end to end IN PRODUCTION: the user
  connected pdkirange236@gmail.com (connection row verified in prod;
  org 'Pushkar Kirange' created after the workspace-missing diagnosis).
  Shipped on top of the core: (1) web Settings panel
  `GoogleConnectionsSettings` — list (api.manage; members see the
  denial reason), Connect anchor to /api/integrations/google/connect
  (same-origin navigation through the Vercel proxy), Sync now button
  with plain-language result + query invalidation; settings.test.tsx
  trpc mock EXTENDED with integrations (any new router used by the
  settings page must be added there or unrelated tests crash). (2)
  `syncAllGoogleConnections` sweep — enumerates organizations (auth
  table, tenant registry), per-tenant listConnections under RLS,
  per-connection error isolation (failure recorded in runs[], sweep
  continues). (3) Trigger.dev `schedules.task` id 'google-sync', cron
  */10 * * * *, skips gracefully when no Google client configured;
  per-run composition identical to record-keeper task. Loaded the
  project trigger-authoring-tasks skill (apps/api/.claude/skills)
  before authoring, per apps/api/CLAUDE.md. NOTE: the schedule only
  runs once tasks are DEPLOYED to Trigger cloud (needs prod env vars
  in the Trigger dashboard incl. Render's AUTH_SECRET — local
  AUTH_SECRET ≠ Render's, verified by hash) or while `pnpm
dev:trigger` is running locally against dev. REMAINING for 0032:
  calendar events ingestion (own sourceType), Trigger cloud prod
  deploy decision; web Vercel redeploy needed for the panel to appear
  (deploy path for web still manual/user-side).

- **Session 3, TASK-0032 phase 2 core shipped (2026-07-09):**
  `syncGmailConnection` at the app tier (apps/api/src/integrations/
  google-sync.ts) composes google + crm + retrieval per the phase-1
  design: counterparty (sender unless it IS the mailbox — then first
  other recipient) → Person by email eq (queryRecords probe; created
  with name when absent); Company by domain — STORED CANONICALLY AS
  `https://<domain>` because the domain attribute is url-typed and
  z.url() rejects bare domains (every writer must use this form);
  CONSUMER_DOMAINS (gmail/yahoo/outlook/…) never create companies.
  Existing people get company BACKFILLED only when unset — sync never
  overwrites values (record keeper proposals do that). Chunks:
  sourceId = uuidv5(`gmail:<connectionId>:<messageId>`, fixed
  namespace) since chunks.source_id is uuid and Gmail ids are hex;
  recordId anchor = person. Cursor: incremental listAddedSince,
  sync-token-expired → full-window fallback; full-mode cursor = max
  message historyId (BigInt compare); batch + cursor advance commit
  in ONE tx (crash = replay same window; replace-set dedupes).
  Google I/O happens OUTSIDE transactions. tRPC:
  integrations.google.list|sync (api.manage; sync via
  ctx.workers.googleSync — PRECONDITION_FAILED when Google not
  configured; unknown-connection → NOT_FOUND, api-error/refresh →
  BAD_GATEWAY); api-contracts gained @drovano/google dep. main.ts
  wires googleSync when the OAuth client exists. 5 new tests (51
  total in @drovano/api). ALSO fixed this session: OAuth callback now
  rides WEB_ORIGIN (f2775ce) — production serves the SPA + API behind
  the Vercel /api proxy (apps/web/.deploy/vercel.json rewrites), so
  cookies are first-party on drovano-web.vercel.app and NOTHING
  auth'd works on the bare onrender.com origin (users: connect via
  https://drovano-web.vercel.app/api/integrations/google/connect;
  Google console redirect URI must be the vercel.app form). Diagnosed
  the user's "Loading your objects failed": their gmail-address
  account has NO org membership in prod (the one org 'Test' belongs
  to their pccoepune.org account) — they must create a workspace on
  the home page or sign in with the other account. eslint ignores
  gained **/.trigger/** (build cache) and research/ (user scratch).
  REMAINING for 0032: calendar events ingestion, Trigger.dev schedule
  wrapping sync (load trigger-authoring-tasks skill first — see
  apps/api/CLAUDE.md), web settings UI for connections.

- **Session 3, ops gates cleared + Trigger.dev scaffold (2026-07-09):**
  user named all three held actions in one message — ALL EXECUTED:
  (1) `RENDER_API_KEY` GitHub Actions secret created → the CI deploy
  job is armed; every green main build now auto-deploys to Render.
  (2) Migrations 0014–0016 applied to production Neon via the HTTPS
  SQL script and verified (chunks.embedding = halfvec(384);
  google_connections has FORCE RLS, 1 policy, 4 drovano_app grants).
  (3) GOOGLE_CLIENT_ID/SECRET + REDIS_URL (Upstash, user-provided)
  set on the Render service and a deploy triggered — production now
  has Google connect mounted and Redis invalidation live. Upstash
  REST url/token also parked in apps/api/.env for later. Trigger.dev
  project ref arrived (`proj_rgmhezbieidrowrzmatd`) → scaffolded at
  the app tier: apps/api/trigger.config.ts (dirs src/trigger, node
  runtime, 3-attempt exponential retries) + first durable task
  `record-keeper` wrapping runRecordKeeper with PER-RUN composition
  (own createDb pool closed in finally — task containers must not
  share the server pool; AbortTaskRunError when no language key =
  permanent, no retry). @trigger.dev/sdk 4.5.2 (dep) +
  @trigger.dev/build 4.5.2 (devDep) via catalog; `.trigger/`
  gitignored; `dev:trigger`/`deploy:trigger` scripts. NOTE: `trigger
dev`/`deploy` CLI needs interactive login or a tr_pat_ token — user
  runs those. Also: README + brand assets merged to main by the user
  (332576b, their work). REMAINING USER ASKS: add the Render callback
  URL as a Google OAuth redirect URI; run `npx trigger.dev@latest
dev` once to verify the task registers; email provider; Neon
  password rotation; repo visibility. NEXT: TASK-0032 phase 2
  ingestion (design below in the phase-1 entry), then a Trigger.dev
  schedule wrapping the sync.

- **Session 2, TASK-0032 phase 1 shipped (2026-07-08):**
  `@drovano/google` module + `google_connections` table (migrations
  0015/0016, RLS-forced; unique (tenant_id, email); cursors
  gmail_history_id + calendar_sync_token on the row). Tokens NEVER
  rest in plaintext: AES-256-GCM, key = HKDF(AUTH_SECRET,
  'drovano-google-tokens') — rotating AUTH_SECRET fails safe (users
  reconnect). OAuth: read-only scopes (gmail.readonly,
  calendar.readonly, openid email), access_type=offline +
  prompt=consent (refresh token every time), account email resolved
  via the openid userinfo endpoint. Clients are PLAIN FETCH
  (injectable; no googleapis SDK — supply-chain posture): Gmail
  metadata-format messages + history.list incremental (404 →
  'sync-token-expired'), Calendar events + syncToken (410 → same).
  App tier: /api/integrations/google/connect (302 to consent) +
  /callback (HMAC state, 10-min TTL, session-bound; audits
  integration.google-connect). ALSO per user ask: better-auth
  trustedOrigins now configurable — WEB_ORIGIN env (Vercel URL) wired
  in main.ts; createAuth gained optional trustedOrigins. Render
  deploy EXPLICITLY AUTHORIZED this session ("deploy on render also
  keep it up to date") — WEB_ORIGIN + deploy trigger next. PHASE 2
  REMAINING (design intent): app-tier ingestion composing
  @drovano/google + crm + retrieval — upsert Person records by sender
  email (match on person email attribute, create if absent),
  auto-link Company by domain, indexSource each message
  (sourceType 'email', recordId = person) for retrieval, cursor
  advance per batch; calendar events → indexSource 'transcript'-like?
  NO — events get their own sourceType later; tRPC surface
  integrations.google.list/sync under api.manage; Trigger.dev
  schedule wraps the sync once proj ref exists.

- **Session 2, ADR-0015 local embeddings + credentials arrive
  (2026-07-08):** dense retrieval unblocked at $0 —
  `createLocalEmbedder()` (bge-small-en-v1.5 via
  @huggingface/transformers 4.2.0, q8 ONNX, lazy-loaded) behind the
  Embedder seam; verified live (384 dims; related texts cosine 0.857
  vs unrelated 0.550; ~6.7s first call incl. model download, fast
  after). `chunks.embedding` → halfvec(384) via migration 0014
  (drop/re-add — drizzle's bare ALTER TYPE can't cast across halfvec
  dims; column was all-NULL everywhere). main.ts precedence: OpenAI
  hosted if key, else local; `EMBEDDINGS=off` kill-switch for
  memory-tight hosts (bge adds ~150-200MB peak — Render free tier is
  512MB, WATCH FOR OOM after deploy; if it OOMs set EMBEDDINGS=off
  there). CREDENTIALS NOW IN apps/api/.env (gitignored):
  OPENROUTER_API_KEY, GOOGLE_CLIENT_ID/SECRET (formats verified —
  **TASK-0032 IS UNBLOCKED**), TRIGGER_SECRET_KEY (tr_dev_…;
  Trigger.dev scaffolding still needs the project ref `proj_…` from
  the dashboard). OPENROUTER_API_KEY is also set on the Render
  service via API. STILL GATED (user must name them): Render deploy
  of drovano-api (env var alone doesn't redeploy; prod still runs
  pre-M2 e972146), Neon apply of migration 0014 (0010–0013 are
  applied and verified). Hermes 3/4 on OpenRouter: `tools: false` —
  unusable for workers (everything is tool loops); could only serve
  the no-tool contextualizer seam. NEXT: TASK-0032 Gmail/GCal sync
  (creds ready), then Trigger.dev scaffolding once proj ref arrives.

- **Session 1, worker trigger wired (2026-07-08):** the record keeper
  is invocable over tRPC — `agents.workers.recordKeeper` (api.manage;
  spend-cap → TOO_MANY_REQUESTS; no key → PRECONDITION_FAILED). The
  seam is `WorkerRuns` on the request context, injected by main.ts
  (workers compose modules, so they cannot live at the contracts
  tier); main.ts now builds createModelRouter(env) + createAiEmbedder
  and passes `runRecordKeeper` bound to the fast tier. env.ts gained
  the optional AI keys. Tested by injecting the REAL worker with a
  stub model through the same seam main.ts uses. PRODUCTION NOTE: the
  Render service is still running a pre-M2 build and has no
  OPENROUTER_API_KEY env var — a live production run needs BOTH the
  redeploy AND the env var set (deploy-gated, user asks).

- **Session 1, ADR-0014 + production migrations (2026-07-08):** the
  founder supplied an OPENROUTER key ("use free and good models") — no
  Anthropic key exists. ADR-0014: router precedence Anthropic >
  OpenRouter; free tool-capable tier defaults (fast
  openai/gpt-oss-20b:free, balanced
  nvidia/nemotron-3-super-120b-a12b:free, frontier
  openai/gpt-oss-120b:free) with OPENROUTER_*_MODEL env overrides —
  free listings rotate and 429 under congestion (observed live:
  gpt-oss-120b upstream-rate-limited during the smoke test; retry or
  override). OpenRouter is wired via @ai-sdk/openai `.chat()` (NOT the
  default responses API). Key lives in apps/api/.env (gitignored) and
  the transcript only — NEVER commit it; .env.example documents the
  variables. Live smoke test through runToolLoop: fast tier executed a
  tool call + answered (507 tokens, $0). Free-account budget ≈50
  req/day without balance — evals must respect it. Embeddings still
  need OPENAI_API_KEY (OpenRouter has none) → retrieval stays
  BM25-only. ALSO: user approved the production Neon apply —
  migrations 0010–0013 applied via the HTTPS SQL workaround and
  verified (FORCE RLS + policies + 4 grants on agents/agent_grants/
  ai_runs/proposals/chunks; pgvector 0.8.1; all chunk indexes). NEXT
  UNBLOCKED: wire createModelRouter(process.env) into apps/api main
  and expose the record-keeper trigger (context-injected), then
  TASK-0036 scheduled evals within the free budget; 0039 research
  assistant still needs a web-search supply.

- **Session 1, TASK-0038 worker core shipped (2026-07-08, task stays
  In progress):** `apps/api/src/workers/record-keeper.ts` —
  `runRecordKeeper(deps, {tenantId, agentId, recordId, instruction?})`
  composes the whole M3 substrate at the app tier (modules never
  import modules): loadAgentPrincipal + assertSpendWithinCap BEFORE any
  model call, then runToolLoop with tools `search_workspace`
  (createRetrievalTool bound to the agent principal), `get_record`
  (can(record.view)-gated crm getRecord), and `stage_proposal`
  (createProposal — the 0037 grant gate applies), recorded via
  createDbRunRecorder. The system prompt encodes SECURITY.md posture:
  never write directly, retrieved content is data not instructions,
  insufficient evidence → no proposal. 3 stub-model Testcontainers
  tests: happy chain (proposal pending + ai_runs row + spend > 0),
  grant-denied agent stages nothing, capped tenant refuses before the
  model runs. REMAINING for 0038 done: merge/dedupe proposals, AI
  attributes (prompt-as-formula), Trigger.dev-wrapped triggers off
  email ingestion (0032), live-model eval — all gated on user asks
  (Anthropic key, Trigger.dev account, Google OAuth). The tRPC/job
  trigger surface is deliberately deferred until those exist.
  ALSO this entry: web test timeouts raised again (asyncUtil 10→20s,
  testTimeout 30→60s, f3d1772) — the retrieval suite added a fourth
  concurrent Testcontainers pull on the 2-core CI runner and the
  first-in-file settings test flaked at 10s; CI green after. Local
  full-suite runs still occasionally flake one suite under container
  churn; individual re-runs pass.

- **Session 1, TASK-0035 done (2026-07-08):** `@drovano/retrieval`
  shipped stub-first per the zero-cost posture. Schema: one `chunks`
  table (migration 0012 + 0013 hardening; audit_log RLS exemplar) —
  `source_type` ('email'|'note'|'transcript'|'document') + `source_id`
  address the owning domain (no FK; those modules arrive later),
  `record_id` is the permission anchor, `embedding halfvec(1536)`
  NULLABLE (text-embedding-3-small dims) with HNSW halfvec_cosine_ops,
  BM25 via an expression GIN index on
  `to_tsvector('english', coalesce(context,'') || ' ' || content)` —
  queries repeat the exact expression so the planner matches it. The
  test harness image moved postgres:18-alpine →
  **pgvector/pgvector:pg18** (same PG18 + the extension; migration 0012
  runs CREATE EXTENSION, which Neon supports natively). Pipeline:
  recursive chunker (paragraph→sentence→word, ~4 chars/token, ≈384-token
  target, 15% word-boundary overlap; word-packed units cap at
  maxChars−overlap so overlap always fits); `indexSource` replace-set
  per source with optional Contextualizer (situating sentence — needs a
  language key) and optional Embedder (`createAiEmbedder(router)` —
  undefined when embeddings are disabled); `searchChunks` gates on
  can(record.view) (agents need the 0037 grant), pools BM25 +
  cosine-dense candidates (default 50), fuses with RRF k=60, and passes
  through the Reranker seam (passthrough default; Cohere later).
  `createRetrievalTool` binds db+tenant+principal at construction —
  a harness run can never search as anyone else. 12 tests (6 pure
  chunking, 6 Testcontainers incl. RLS isolation, soft-delete
  filtering, agent-grant denial, tool tenant-binding). Neon apply of
  0012/0013 rides the same staged script as 0010/0011 (deploy-gated).
  NOTE for the next session: one full-suite run hit a transient
  @drovano/api failure under six concurrent Testcontainers pulls —
  passed clean on re-run; watch whether CI (serialized) ever shows it.

- **Session 1, TASK-0037 done (2026-07-08):** shipped as designed
  (entry below) with two deltas. (1) Error codes grew `not-permitted`
  (agent lacks the record.update grant when proposing — the module
  itself runs `can()`, defense in depth below the router) and
  `unknown-record` (proposal targets checked against live records, not
  left to the FK). (2) The module suite seeds its proposal-target
  record at the schema level (raw `object_definitions`/`records`
  inserts) because modules must not import modules even in tests —
  the full crm-composed path is covered in the api router suite
  instead. Verified end-to-end: accepting a proposal writes the values
  AND stamps `record.update` audit with the HUMAN reviewer's id;
  rejecting leaves the record untouched; reviews are terminal
  (CONFLICT on the second decision). 13 new tests (8 module, 5 api
  router), 60 permission tests carried. Migrations 0010/0011 are in
  the tree and proven by every Testcontainers run; the PRODUCTION
  Neon apply is staged in a scratchpad script but deploy-class actions
  are permission-gated this session — batched as a user ask alongside
  the Render/Vercel redeploys. Next: TASK-0035 (retrieval, stub-first)
  or TASK-0038 (record keeper — can now stage real proposals).

- **Session 1, TASK-0037 design locked (2026-07-08):** new module
  `packages/modules/agents` (@drovano/agents) + migration 0010/0011
  (companion) with three tenant-scoped RLS-normal tables copying the
  audit exemplar: `agents` (id uuidv7, tenant_id, name, worker — e.g.
  'record-keeper', active bool, created_by, created_at),
  `agent_grants` (tenant_id, agent_id FK cascade, action text,
  granted_by, created_at, unique (agent_id, action)), `ai_runs`
  (tenant_id, agent_id, model, steps, input_tokens, output_tokens,
  total_tokens, outcome text, error_message, created_at; index
  (tenant_id, created_at)). Permissions: `PrincipalContext` gains
  optional `agentGrants: ReadonlySet<string>`; the agent branch in
  `can()` changes from deny-all to: allow IFF the action type is in
  GRANTABLE_ACTIONS (exactly 'record.view' | 'record.create' |
  'record.update' | 'list.create' — never delete/manage actions) AND in
  the principal's grant set; reason strings name the grant. Matrix test
  gains agent rows (granted → allow for the four; everything else deny
  even when granted — fail closed on non-grantable). Services in the
  module: createAgent (audit agent.create), setAgentGrants (replace-set
  w/ audit agent.grants-set, validates grantable list), listAgents,
  `loadAgentPrincipal(tx, {tenantId, agentId})` → PrincipalContext
  (kind 'agent', grants loaded), `createDbRunRecorder(db)` implementing
  @drovano/ai's RunRecorder → inserts ai_runs inside withTenant,
  `spendThisMonth(tx, tenantId)` + `assertSpendWithinCap` (cap constant
  AI_MONTHLY_TOKEN_CAP = 5_000_000 v1, config later). Proposals
  (provisional-until-accepted): `proposals` table rides the SAME
  migration: (tenant_id, record_id FK, changes jsonb {attributeKey:
  value}, rationale text, proposed_by_agent FK, status
  'pending'|'accepted'|'rejected', reviewed_by, reviewed_at,
  created_at; index (tenant_id, status)); services createProposal
  (agent-only path, audit proposal.create), reviewProposal (human,
  can() record.update; accept applies via crm updateRecordValues with
  the HUMAN actor so provenance shows the acceptor, then audit
  proposal.accept/reject). tRPC `agents` router (api.manage for
  create/grants; record.view for list; record.update for review);
  proposals surface: agents.proposals.list/review. Tests: module
  Testcontainers suite (grants round-trip, agent principal allow/deny
  matrix vs granted set, run recording + monthly spend sum, proposal
  accept applies values + audit chain, RLS isolation for all four
  tables), api router suite (member can review proposals? no — review
  requires record.update which members hold; creating agents requires
  api.manage → member FORBIDDEN). UI deferred to the worker tasks
  (0038 renders proposals inline).

- **Session 1, TASK-0034 done (2026-07-08):** `@drovano/ai` shipped —
  router (tiers → Anthropic models `claude-haiku-4-5-20251001` /
  `claude-sonnet-5` / `claude-opus-4-8`; embeddings →
  OpenAI `text-embedding-3-small`; both key-gated, disabled ≠ crashed),
  `runToolLoop` with per-run hard caps + `RunRecorder` (noop default;
  TASK-0037 plugs session logs/spend accounting into that seam),
  scenario runner (the TASK-0036 scaffolding; **0036 stays open** until
  scheduled real-model evals exist — needs the API key), stub-model
  testing exports over `ai/test` MockLanguageModelV4. AI SDK pins:
  ai 7.0.17, @ai-sdk/anthropic 4.0.9, @ai-sdk/openai 4.0.8 (V4 provider
  spec: usage is nested `{inputTokens:{total,…}}`, finishReason is
  `{unified,raw}` — the testing helpers encode this). Next:
  **TASK-0032 (Gmail/GCal sync)** is BLOCKED on Google OAuth creds;
  **TASK-0035 (retrieval)** needs pgvector migration + chunking — can
  start stub-first; **TASK-0037 (agent trust)** is implementable now
  (permissions + db work, no keys needed) — prefer 0037 next so workers
  land on real grants.

## M2 milestone review (2026-07-08)

**M2 closed 11/11** (TASK-0021…0031). Against the ROADMAP exit — "a
workspace can model its business and work its pipeline keyboard-first
within all performance budgets":

- **Storage engine**: typed-EAV hybrid proven at the 1M-records NFR
  (bulk-load benchmark); custom objects/attributes without DDL.
- **Graph**: People/Companies/Deals seeded per tenant; relations with
  write-time integrity + reverse traversal; lists with the entry-plane
  typed-EAV (Attio-signature separation, proven by tests); saved views;
  view engine (EXISTS-probe filters, correlated-subquery sorts, keyset
  pagination).
- **Surfaces**: virtualized keyboard-first grid with optimistic inline
  edit; pipelines + kanban (menu-driven moves); record peek + audit-log
  timeline; CSV import with mapping/dedupe/dry-run.
- **Platform**: public REST v1 read paths behind hashed API keys;
  webhook skeleton with HMAC-signed fire-and-forget dispatch; `api.manage`
  permission; settings UI.
- **Decisions**: ADR-0012 (buy Recall.ai behind `MeetingCapture`),
  ADR-0013 (owned enrichment waterfall, PDL → Apollo).
- **Budgets**: initial js payload 107.9/180 KiB (measured from the Vite
  manifest, entry + static closure); css 5.1/12; latency-budget suite and
  full CI green on `main` (last run: ADR commit d99eb3f).
- **Test counts**: 29 crm + 6 platform + 34 api + 33 web + 57 permission
  matrix + db/identity/ui suites — all green.

**Deployment debt (needs the user, batched):** production Render API
still runs a pre-M2 build (auto-deploy never fired after 2026-07-07);
Vercel web is one commit behind (settings UI + payload fix). Both
redeploys were permission-gated this session. Also still open: Upstash
Redis URL (realtime), Neon owner-password rotation, email provider,
repo-visibility decision.

**Carried structure notes:** migrate the workspaces router into module
packages when next touched; drag-and-drop as a kanban enhancer; realtime
WS remains direct-to-gateway (Vercel rewrites cannot proxy websockets);
local turbo runs use `--concurrency=2`.

## Why this milestone is next

M2 delivered the pre-AI CRM — deliberately "not yet a product" (ROADMAP).
M3 is the AI-native test: connect email/calendar and watch the graph
build and maintain itself, every AI action attributed, reversible, and
logged (PROJECT law 2; ai-system.md). Everything lands on proven rails:
records/relations/lists for zero-entry writes, the audit trail for
attribution, the permission service for agent grants, Trigger.dev
(ADR-0007) for durable ingestion, and ADR-0010's AI-layer shape.

## M3 scope (ROADMAP; tasks TASK-0032…0041 minus 0041)

Dependency order; the AI harness gates the workers:

1. **TASK-0034 — `packages/ai` harness** (AI SDK v7, thin tool loops,
   provider routing, telemetry). First: it gates 0035-0039 and needs an
   Anthropic/OpenAI API key from the user (BLOCKING ask — batch it).
2. **TASK-0036 — eval scaffolding** (stubbed-LLM CI tests + scheduled
   scenario evals) lands WITH the harness, not after (TESTING.md AI
   rules are non-negotiable).
3. **TASK-0032 — Gmail/GCal two-way sync** (durable resumable ingestion
   per ADR-0007; auto-create/update People/Companies; timeline signals).
   Needs Google Cloud OAuth credentials from the user (BLOCKING ask).
4. **TASK-0035 — retrieval pipeline** (contextual chunking, hybrid
   BM25+dense, rerank; permission-filtered tools; pgvector tables).
5. **TASK-0037 — agent trust**: agent principals with scoped grants
   (replaces the deny-all agent branch in permissions), session logs,
   spend caps, provisional-until-accepted surfaces.
6. **TASK-0038/0039 — record keeper + research assistant workers.**
7. **TASK-0040 — enrichment waterfall v1** per ADR-0013 (PDL key needed
   — free tier covers development).
8. **TASK-0033 — Outlook/M365 parity** last (mirror of 0032 once its
   shape settles).

## Constraints carried into M3

- Every AI write is provisional-until-accepted with provenance; agents
  are first-class principals with scoped grants, never pseudo-humans
  (permissions service already fails closed for them).
- New tenant-scoped tables copy the audit_log exemplar (RLS + FORCE +
  grants companion migration + isolation tests).
- Trigger.dev v4 is the only job substrate (ADR-0007) — no ad-hoc cron.
- Zero-cost posture continues: free tiers, stubbed-LLM tests in CI (no
  live-model calls), spend caps from day one.
- Batch user asks; only block on true blockers (API keys, OAuth creds).

## Open items needing the user (batch, don't drip)

1. **LLM API key** (Anthropic recommended) — gates TASK-0034 onward.
2. **Google Cloud OAuth client** (Gmail/Calendar scopes) — gates 0032.
3. **Redeploys**: Render API (stale since pre-M2) + Vercel web.
4. Upstash Redis URL; Neon owner-password rotation; email provider;
   repo visibility (carried from M1/M2).

## Exit (ROADMAP)

Connect email/calendar → the graph builds and maintains itself; every AI
action attributed, reversible, logged. The AI-native test passes.
