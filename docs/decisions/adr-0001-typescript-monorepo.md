# ADR-0001: TypeScript everywhere; pnpm + Turborepo monorepo

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** process, backend, frontend

## Problem

Drovano is one product across web client, API, background workers, AI
harness, scripts, and (later) SDKs. We need the language policy and the
repository/build tooling before any code exists. Forces: a small team that
must move across the whole stack; a modular monolith that needs enforced
package boundaries (ADR-0004); shared types between client, server, and
public API contracts; hiring pool.

## Alternatives considered

### Option A — TypeScript everywhere; pnpm 10 workspaces + Turborepo 2.x + TS project references

- One language across every layer; types flow from DB schema (Drizzle) to
  API contracts (Zod/tRPC) to client — the single-source-of-truth chain the
  standards demand.
- Turborepo: dominant in exactly our niche, free hosted + documented
  self-host remote cache, `turbo watch`, experimental **Boundaries** for
  module-constraint enforcement.
- pnpm: most-used workspace tool (State of JS 2024), catalogs for version
  alignment, strict node_modules.
- Weaknesses: Boundaries still experimental; Turborepo 3.0 telegraphed by
  2.9 deprecations; JS toolchain churn generally.
- Evidence: 5/5 inspected reference TS-SaaS repos use Turborepo, 0/5 Nx;
  3/5 pnpm (Cal.com, Dub, Midday, Supabase, Trigger.dev — repo inspection
  2026-07-06, see research §1).

### Option B — Nx

- Technically most powerful: generators, module constraints (mature, not
  experimental), distributed task execution, good TS project-references
  automation (`nx sync`).
- Weaknesses: Aug 2025 "s1ngularity" supply-chain attack (malicious `nx`
  releases exfiltrated ~2,349 secrets, 190+ orgs); monetization whiplash on
  self-hosted caching (paywalled 2024, restored 20.8, reportedly
  re-deprecated May 2026 pushing Nx Cloud). Heavier mental model.
- Evidence: [s1ngularity postmortem](https://nx.dev/blog/s1ngularity-postmortem),
  [Wiz analysis](https://www.wiz.io/blog/s1ngularity-supply-chain-attack);
  zero adoption in our reference class.

### Option C — Bun workspaces (Bun as PM + runtime)

- Fastest installs/tests; Midday proves Bun-as-packageManager works in
  production.
- Weaknesses: no task orchestration/caching (still needs Turborepo);
  Bun-as-runtime compat risk for a security-sensitive multi-tenant API; no
  Bun 2.0 exists despite blogspam (refuted, research appendix).

### Option D — Polyglot (e.g., Go/Rust API + TS front)

- Raw API performance; stronger concurrency primitives.
- Weaknesses: breaks the end-to-end type chain (the single most valuable
  DX asset for this product); splits a small team; our bottlenecks are
  data-layer and product iteration, not compute.

## Research

`docs/research/technology-stack-2026.md` §1 (versions verified 2026-07-06:
turbo 2.10.3, nx 23.0.1, Bun 1.3.14). Reference-repo inspection listed
there.

## Decision

TypeScript everywhere; pnpm 10 workspaces (with catalogs) + Turborepo 2.x
+ TypeScript project references; Turborepo Boundaries (tags) as the
module-constraint enforcement from the first package.

## Why this option

1. End-to-end type safety is a compounding product asset (DB → API →
   client → SDK) and demands one language.
2. Turborepo is the boring, dominant choice in our exact reference class
   with a free self-hostable cache — no vendor hostage risk.
3. Nx's power isn't needed below ~50 engineers, and its 2025 security and
   monetization history is a real trust cost.
4. pnpm strictness catches phantom dependencies that undermine boundary
   enforcement.

## Trade-offs accepted

- Boundaries is experimental — we back it with TS project references and
  ESLint import rules so no single mechanism is load-bearing.
- Single-language means accepting Node-class performance on the API tier;
  the architecture keeps hot paths in Postgres and caches.
- Turborepo 3.0 migration likely within 18 months.

## Future impact

- Easier: shared Zod contracts, generated SDKs, moving engineers across
  the stack, extracting modules to services (same language, same repo).
- Harder: any future non-TS service is a second-class citizen.
- Revisit: team > ~50 engineers or CI wall-times demand distributed task
  execution (consider Nx or Turborepo's answer); Bun-as-runtime once it
  has years of multi-tenant production credibility; Turborepo 3.0 release.
