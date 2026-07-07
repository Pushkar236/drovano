# ADR-0010: AI layer — AI SDK v7, thin agent loops, contextual+hybrid RAG on pgvector

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** ai, backend, data

## Problem

Fix the AI foundation: SDK/abstraction, agent-orchestration posture,
retrieval pipeline, and vector storage. Forces: AI is the product's
premise (the AI-native test, PRD §1); agent side effects must be durable
and auditable (ADR-0007, ai-system.md); retrieval must respect tenant +
permission boundaries; provider lock-in is a real risk; the 2025 lesson
that framework maximalism (LangChain-style) ages badly.

## Alternatives considered

### Option A — Vercel AI SDK v7 core; hand-rolled/`ToolLoopAgent` loops per Anthropic guidance; Claude Agent SDK for heavyweight workers; contextual + hybrid + reranked RAG; pgvector now → Turbopuffer at scale

- AI SDK v7: the dominant TS abstraction (~16M weekly downloads);
  provider routing, `ToolLoopAgent`, `needsApproval` human-in-the-loop,
  stable MCP support, reranking API, telemetry.
- Orchestration per the Anthropic canon (Building Effective Agents,
  context engineering, long-running harnesses): workflow-first, one agent
  plus good tools before multi-agent, invest in tools and context over
  framework choice.
- Claude Agent SDK where a worker genuinely needs an autonomous harness
  (subagents, hooks, compaction) — evaluated per worker, not default.
- RAG: contextual retrieval (−49% failure; −67% with reranking, Anthropic
  evals) + hybrid BM25+dense (top 50–150) → Cohere Rerank 3.5/4.0 → top
  5–8; retrieval exposed as an agent tool; one-shot RAG for
  latency-sensitive Q&A.
- Vectors: pgvector 0.8 (halfvec + HNSW + iterative scans — the
  multi-tenant filtered-search fix) in per-domain tables; Turbopuffer
  namespace-per-tenant at ~10M+ vectors (Cursor/Notion-validated exit).
- Weaknesses: AI SDK is Vercel-stewarded (mitigated: it's OSS and an
  abstraction — providers stay swappable); Claude Agent SDK pre-1.0 and
  Claude-only.
- Evidence: research §6 (verified 2026-07-06: `ai@7.0.15`; Anthropic
  primary sources linked there).

### Option B — LangChain/LangGraph 1.0

- 1.0 shipped; graph orchestration; big ecosystem.
- Rejected as core: abstraction maximalism is the documented failure
  mode; nobody strong in the reference class starts on it in 2026; our
  workers are workflow-shaped, not graph-shaped.

### Option C — Mastra

- Batteries-included TS agent framework on AI SDK routing; real momentum.
- Young 1.0; its batteries (memory, RAG modules) duplicate what our
  architecture already places elsewhere (Postgres, Trigger.dev).

### Option D — Direct provider SDKs only

- Zero abstraction tax. But we'd hand-roll provider routing, streaming
  UI protocol, tool typing, and telemetry that AI SDK gives for free;
  multi-provider is a product requirement (routing, fallback, BYO-region).

### Option E — Dedicated vector DB from day one (Qdrant/Turbopuffer/Pinecone)

- Better at extreme scale. But a second stateful system before evidence,
  outside RLS (tenant isolation would be app-layer only), against
  ARCHITECTURE.md principle 1. Pinecone's namespace caps specifically
  bite multi-tenant SaaS.

## Research

`docs/research/technology-stack-2026.md` §6 (SDK/orchestration/RAG/MCP)
and §4 (pgvector). Both research threads independently converged on
pgvector-first → Turbopuffer. Security threat model for agents:
SECURITY.md + the Notion 3.0 injection demo
(`ai-native-platform-landscape.md` §3).

## Decision

Vercel AI SDK v7 as the model/streaming/tool layer; agent loops kept
thin (hand-rolled or `ToolLoopAgent`) running as Trigger.dev durable
steps; Claude Agent SDK evaluated per heavyweight worker; retrieval =
contextual chunking + hybrid BM25/dense + cross-encoder rerank, exposed
as a permission-filtered agent tool; embeddings on pgvector 0.8 in
per-domain tables with the Turbopuffer exit planned at ~10M+ vectors.

## Why this option

1. Thin loops over typed module operations keep agents inside the same
   permission/audit path as humans — law 2 is structural.
2. The retrieval pipeline is the published state of the art with primary-
   source evals, and its permission filtering falls out of RLS + the
   permission service rather than a parallel security model.
3. pgvector-first keeps one database until scale _evidence_ (not
   anticipation) justifies a second system; the exit is pre-planned, so
   it's a data move, not a redesign.
4. Every layer is independently swappable: models (AI SDK routing),
   harness (thin loops), vectors (per-domain tables), execution
   (ADR-0007).

## Trade-offs accepted

- Multiple AI dependencies (AI SDK, rerank API, embedding provider) —
  each behind an interface in `packages/ai`.
- pgvector ops: HNSW handles deletes poorly → periodic
  `REINDEX CONCURRENTLY` under heavy re-ingest; partial indexes for whale
  tenants (runbook item).
- Rerank adds a network hop to retrieval (budgeted in PRD latency NFRs;
  skippable on the one-shot path).

## Future impact

- Easier: adding workers (harness + grants + tools); model upgrades;
  BYO-region routing for residency; usage metering (runs journaled).
- Harder: features assuming pgvector-local joins must keep the
  Turbopuffer exit in mind (embeddings stay in per-domain tables, joined
  by id, never foreign-keyed into hot queries).
- Revisit: ~10M vectors or hard hybrid-search requirements (Turbopuffer);
  Claude Agent SDK 1.0 (promote from per-worker evaluation to default
  heavyweight harness); AI SDK WorkflowAgent maturity vs Trigger.dev
  overlap; reranker/embedding benchmarks on our own corpus in M2.
