# AI System Architecture

> **Status:** v1.0, 2026-07-07. Decision record: [ADR-0010](../decisions/adr-0010-ai-layer.md);
> execution substrate: [ADR-0007](../decisions/adr-0007-jobs-durable-execution.md).
> Product requirements: [`docs/PRD.md`](../PRD.md) §3.5. Security
> requirements: [`SECURITY.md`](../../SECURITY.md) (AI section). UX rules:
> [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) §3.

## 1. Position

AI in Drovano is **infrastructure operating the same levers as humans**,
not a chatbot layer. Three consequences structure everything below:

1. **Agents are principals** (identity, scoped grants, audit) — never a
   service account with god-mode.
2. **Agent side effects are journaled durable steps** — no tool call that
   mutates state executes outside Trigger.dev.
3. **Workflow-first, agent-when-earned** (Anthropic guidance): most v1
   "AI" is deterministic pipelines with LLM steps, not open-ended agent
   loops. One agent with good tools before multi-agent anything.

## 2. Layers

```
┌──────────────────────────────────────────────────────────────┐
│ Surfaces: embedded (ghost text, AI attributes) · assistive   │
│ (side panel, meeting artifacts) · immersive (NL query, chat) │
├──────────────────────────────────────────────────────────────┤
│ Workers: record keeper · meeting assistant · research asst.  │
│ (named principals; scoped grants; session logs)              │
├──────────────────────────────────────────────────────────────┤
│ Harness (packages/ai): Vercel AI SDK v7 core; thin tool      │
│ loops / ToolLoopAgent; Claude Agent SDK for heavyweight runs │
├──────────────────────────────────────────────────────────────┤
│ Tools: the modules' typed operations + retrieval tools       │
│ (permission-filtered) — same operations humans invoke        │
├──────────────────────────────────────────────────────────────┤
│ Execution: Trigger.dev v4 durable runs; approvals=waitpoints │
├──────────────────────────────────────────────────────────────┤
│ Models: provider-routed (AI SDK); no training on tenant data │
└──────────────────────────────────────────────────────────────┘
```

## 3. The three v1 workers

Each is a named principal with a documented scope; depth over breadth
(the 2025 agent-startup churn lesson).

| Worker | Trigger | Scope (grants) | Consequential gate |
|---|---|---|---|
| **Record keeper** | Email/calendar sync events; schedule | read comms signals; create/update People, Companies; propose merges; fill AI attributes | merges & overwrites of human-entered values require acceptance |
| **Meeting assistant** | Meeting ended; upcoming meeting | read related records + transcript; propose summary, tasks, attribute updates; draft follow-up | everything provisional-until-accepted; **sending email always human-gated** |
| **Research assistant** | On-demand | web research tools; fill requested attributes with cited sources | writes are provisional; sources attached |

Worker runs are **sessions**: a session log records what was read (queries,
records, documents), what was proposed, what was accepted/rejected, token
cost, and duration — surfaced in-product (PRD trust metrics). The Linear
AgentSession model is the explicit UX reference.

## 4. Retrieval pipeline

Per ADR-0010, the researched 2026 consensus:

1. **Indexing:** notes, documents, transcripts, emails are chunked
   (recursive, 256–512 tokens, 10–20% overlap) with **contextual
   retrieval** — an LLM-generated situating sentence prepended per chunk
   before embedding (−49% retrieval failure; −67% with reranking, per
   Anthropic's published evals) — into per-domain pgvector tables
   (halfvec + HNSW + iterative scans) alongside a BM25/full-text index.
2. **Query:** hybrid (BM25 + dense, top 50–150) → cross-encoder rerank
   (Cohere Rerank 3.5/4.0) → top 5–8 chunks to the model.
3. **Exposure:** retrieval is an **agent tool** (with query-decomposition
   freedom) for worker/assistant surfaces; one-shot RAG only for
   latency-sensitive Q&A (⌘K answers).
4. **Permissions:** every retrieval query runs under the caller's tenant
   GUC *and* permission filters — an agent can never retrieve what its
   grantor couldn't read. This is tested per `TESTING.md` (isolation +
   allow/deny matrices on the retrieval path).
5. **Exit:** at ~10M+ vectors or hard hybrid-search requirements,
   migrate embeddings to Turbopuffer namespace-per-tenant (the
   Cursor/Notion-validated path); the per-domain-table layout keeps this a
   data move, not a redesign.

## 5. Security posture (binding, from SECURITY.md)

- **Prompt injection is assumed, not hoped away** (Notion 3.0
  exfiltration is the named threat). Defenses: least-privilege tool
  allowlists per worker; untrusted content (inbound email, web pages,
  uploaded docs) is marked and never grants instructions authority;
  consequential actions human-gated; no tool that can exfiltrate
  (web fetch, email send) coexists with untrusted-content reading in the
  same session without a human gate between.
- Provider posture: no training on tenant data (contractual); BYO-region
  routing when residency demands; provider outage degrades AI features,
  never CRUD.
- Cost containment: per-workspace spend caps and per-worker budgets are
  platform features (PRD §6), enforced in the harness, visible in the
  session log.

## 6. Evaluation & quality

Two levels per `TESTING.md`: deterministic scaffolding tests (stubbed
LLM responses through real pipelines — prompts render, tools dispatch,
permissions filter, provisional states persist) run in CI; **scenario
evals** (real models on curated fixtures: meeting → expected extractions;
messy inbox → expected graph) run scheduled with tracked scores. Every
accepted/rejected proposal in production feeds an eval-improvement loop
(rejection reasons are product telemetry). Prompts and eval fixtures are
versioned in-repo next to the workers they test.
