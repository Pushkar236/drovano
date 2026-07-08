# Prompt 04 — Zero-entry & the AI substrate (M3 begins)

> **Status:** mandate for M3, written 2026-07-08 at the close of M2.
> Prior records: [`prompt-01-foundation.md`](prompt-01-foundation.md),
> [`prompt-02-brief.md`](prompt-02-brief.md) (M1 log),
> [`prompt-03.md`](prompt-03.md) (M2 log).

## Progress log

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
