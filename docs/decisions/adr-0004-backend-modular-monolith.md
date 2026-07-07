# ADR-0004: Backend — modular monolith on Hono

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** backend

## Problem

Choose the service topology and HTTP framework for a platform that must
serve 100k+ tenants, host seven domain modules (system-overview.md), and
keep one write path per operation for humans, API, and agents. Forces:
small team; strict tenancy discipline; the certainty that *some* work
(jobs, AI workers, realtime) runs outside the request path from day one.

## Alternatives considered

### Option A — Modular monolith on Hono 4.x, boundary-enforced module packages

- One deployable API; modules as packages with published interfaces,
  enforced by Turborepo Boundaries + TS project references (ADR-0001) +
  lint rules (CODING_STANDARDS).
- Hono: ~47M weekly downloads; runs Node/Bun/Workers/Deno; first-class
  `@hono/zod-openapi` and `@hono/trpc-server` — the exact pair ADR-0005
  needs, proven cohabiting in production (Midday's API).
- Weaknesses: younger than Fastify in pure-Node ops lore; portability
  breadth is a feature we only partially use.
- Evidence: research §3; [Midday api package.json](https://github.com/midday-ai/midday/blob/main/apps/api/package.json)
  (repo-verified 2026-07-06).

### Option B — Modular monolith on Fastify 5

- Most mature pure-Node option; best plugin/encapsulation model;
  equally defensible. Weaker native pairing for zod-openapi + tRPC on one
  server; Node-only.

### Option C — NestJS

- Batteries-included structure, familiar to enterprise hires; Cal.com
  chose it for their public API v2.
- Weaknesses: heavy DI ceremony contradicts our "framework-free domain
  logic" standard; the module system would compete with our own package
  boundaries rather than reinforce them.

### Option D — Microservices from the start

- Independent scaling/deploys per module.
- Weaknesses: the researched consensus is firmly modular-monolith-first
  (Shopify's 2.8M-line stance; AWS guidance on premature decomposition).
  Drovano's scale problem is the **data layer** (partitioning, pooling,
  RLS), not service count. Microservices would multiply the tenancy
  discipline surface and destroy iteration speed for a small team.

## Research

`docs/research/technology-stack-2026.md` §3 (framework versions npm-
verified 2026-07-06: Hono 4.12.27, Fastify 5.10.0, NestJS 11.1.27).
Widely-quoted "microservices regret" percentages trace only to weak
aggregators and are **not** load-bearing here; the architecture argument
is.

## Decision

A single deployable modular monolith on Hono 4.x, with domain modules as
boundary-enforced packages, plus separately-deployed workers
(Trigger.dev, ADR-0007) and a thin realtime gateway; services are
extracted only on evidence of divergent scaling or compliance needs.

## Why this option

1. One write path per operation (architecture principle 3) is trivially
   auditable in a monolith and painful across services.
2. Module packages give the *option* of extraction without paying the
   distributed-systems tax now — boundaries are compile-time-real.
3. Hono's zod-openapi + tRPC cohabitation directly serves ADR-0005's
   split API strategy on one server.
4. Runtime portability (Node → Workers) is a free hedge.

## Trade-offs accepted

- Whole-API deploys (mitigated: fast CI, feature flags, small artifact).
- One runtime's blast radius for bugs (mitigated: RLS backstop, typed
  errors, per-module test suites).
- Team must maintain boundary hygiene — CI enforcement, not culture, is
  the mechanism.

## Future impact

- Easier: cross-module features (the product's whole premise);
  refactoring while young; auditing the write path.
- Harder: genuinely independent scaling of one hot module before its
  extraction (mitigated by extracting workers early — already separate).
- Revisit: any module showing divergent scaling (extract it — the
  realtime gateway and workers are already outside); enterprise
  compliance demanding isolated processing; Hono ecosystem stagnation
  (Fastify remains the named fallback with the same module packages).
