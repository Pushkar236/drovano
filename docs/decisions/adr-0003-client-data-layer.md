# ADR-0003: Client data layer — TanStack DB collections, Electric shapes as upgrade path

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** frontend, data

## Problem

The PRD demands < 100 ms perceived interactions and Linear-class speed
(the researched durable moat users _feel_). That requires optimistic
writes, instant local reads, and live updates. The 2026 question: adopt a
sync engine, hand-roll one, or structure a conventional cache to grow into
sync? Forces: sync engines are young; Linear's engine took years of
build-out; our server stack is Postgres-centric (ADR-0006), which all
serious sync engines require.

## Alternatives considered

### Option A — TanStack DB collections now (Query/tRPC-backed + WS invalidation), ElectricSQL shapes per-collection when earned

- Typed client collections, differential-dataflow live queries, optimistic
  transactions with rollback — backend-agnostic loaders, so zero server
  lock-in; v0.6 added SQLite persistence + nested includes.
- Electric: read-path sync of Postgres "shapes" over plain HTTP
  (CDN-cacheable), writes stay in our API — the least-invasive real sync
  engine, with the strongest production evidence of any (Google, Supabase,
  Trigger.dev at "millions of updates/day").
- Weaknesses: TanStack DB is **beta** (contained: it's a client library
  over our own API — worst case we fall back to plain Query); Electric
  adds replication-slot ops when adopted.
- Evidence: [tanstack.com/db](https://tanstack.com/db/latest),
  [Electric "app-ready" post](https://electric-sql.com/blog/2026/03/25/tanstack-db-0.6-app-ready-with-persistence-and-includes),
  [electric-sql.com/sync](https://electric-sql.com/sync) (research §2).

### Option B — Zero (Rocicorp)

- The most complete query-driven sync engine; 1.0 stable June 2026,
  self-hostable over a Postgres read replica.
- Weaknesses at 1.0: no named production customers found; no SSR; weak
  rejected-write handling; 232 KB gzipped client; Postgres-read-replica
  operational commitment on day one.

### Option C — Hand-roll a Linear-style sync engine

- Total control; the proven end state for perceived speed.
- Weaknesses: Linear's took years (client object graph, bootstrap
  strategies, delta protocol, rebase). The research verdict is explicit:
  **do not hand-roll in 2026** — the ecosystem now offers the pieces.

### Option D — Plain TanStack Query + invalidation only

- Boring, zero risk. But no optimistic-transaction or live-query
  substrate; every feature pays its own optimistic-UI tax; retrofit cost
  later.

### Option E — Convex / full BaaS

- Sync at the core, but replaces our backend — maximal lock-in,
  incompatible with the modular monolith and RLS posture.

## Research

`docs/research/technology-stack-2026.md` §2 (sync-engine reality check,
verified 2026-07-06) and §8 (realtime). Linear sync-engine sources
(Artman's talks; CTO-endorsed reverse engineering) in
`ai-native-platform-landscape.md` §2.

## Decision

Structure the client around TanStack DB collections from day one, backed
by tRPC/Query loaders + coarse per-workspace WebSocket invalidation
(Redis pub/sub); adopt ElectricSQL shapes per-collection when read-path
sync earns its keep (activity feeds, live lists); re-evaluate Zero at
~1.10+; Yjs only if/when collaborative doc editing demands CRDTs.

## Why this option

1. Gets optimistic transactions + live queries (the felt-speed mechanics)
   immediately, with the beta risk contained client-side.
2. The invalidation → shapes path means the realtime bet and the sync bet
   are the same bet, adopted incrementally (ARCHITECTURE.md coherence
   note).
3. Electric is the only sync engine with reference-class production
   evidence; its HTTP/CDN model keeps writes in our permission/audit path
   — non-negotiable for law 2 (agent-operable, audited operations).
4. Avoids both the hand-roll tax and betting the core on an unproven
   engine.

## Trade-offs accepted

- Beta dependency (TanStack DB) in the client hot path — pinned, with a
  documented fallback to plain Query.
- Coarse invalidation means some over-refetching until shapes arrive —
  acceptable at v1 data volumes.
- No offline mode (explicitly out of scope, PRD §7); Linear's lesson is
  that speed, not offline, was the killer benefit.

## Future impact

- Easier: per-collection migration to real sync; desktop app later;
  presence features (kept off the DB path on PartyKit/Durable Objects).
- Harder: features written against collection semantics need care if we
  ever abandoned the library (mitigated by its backend-agnostic design).
- Revisit: TanStack DB 1.0 (lift pin); Electric adoption trigger = first
  feature where invalidation-refetch measurably misses perf budgets; Zero
  at ~1.10+ with named production logos and SSR/error-handling closed.
