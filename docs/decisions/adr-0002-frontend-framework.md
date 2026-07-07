# ADR-0002: Frontend — Vite + React SPA with TanStack Router/Query

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** frontend

## Problem

Drovano's product surface is a Linear/Attio-class dashboard: dense,
keyboard-first, sub-100ms perceived interactions (PRD §5), living almost
entirely behind auth. We must pick the framework/rendering posture before
the design system or client data layer can be built. Forces: the perceived-
speed NFRs; an optimistic client data layer (ADR-0003) that wants to own
data flow; SEO irrelevant in-app; a marketing site with opposite needs.

## Alternatives considered

### Option A — Vite 8 + React 19.2 + TanStack Router v1 + TanStack Query v5, SPA-first

- Client-owned rendering and data flow — exactly what an optimistic/
  local-first data layer wants; no server-rendering framework fighting it.
- TanStack Router: de facto type-safe SPA router (typed params/search,
  loaders); Vite 8 stable with Rolldown (10–30x build speedups).
- Weaknesses: no SSR out of the box (irrelevant behind auth; app-shell
  cold load budgeted at < 2.5s in PRD); router is v1-mature but younger
  than React Router.
- Evidence: every reference-class product is a client-heavy SPA, none are
  RSC apps — Linear (React SPA + sync engine), Attio (bespoke client-heavy
  SPA, own reconciler), Notion (SPA + WASM SQLite) (research §2).

### Option B — Next.js 16 (App Router / RSC)

- Largest ecosystem; Turbopack default; Cache Components; one framework
  for app + marketing.
- Weaknesses: server-centric data flow is the wrong axis for an optimistic
  dashboard and actively fights a client data layer; documented,
  persistent SPA-mode awkwardness; complexity/billing sentiment cycle.
- Evidence: [SPA discussions](https://github.com/vercel/next.js/discussions/60365);
  zero reference-class adoption for the core app (research §2).

### Option C — TanStack Start

- Same router with SSR/server functions; cheapest later migration.
- Weaknesses: **v1 RC, not GA** (official site verified 2026-07-06; a
  third-party "GA'd March 2026" claim was refuted). Not a foundation bet
  under our stability standards.

### Option D — React Router 7 framework mode / Remix lineage

- Stable, mature. But Remix 3 is a different non-React product (beta,
  explicitly not production-ready) — team direction strategically
  ambiguous; weaker type-safe-routing story than TanStack.

## Research

`docs/research/technology-stack-2026.md` §2 (versions verified
2026-07-06: Vite 8.0 stable, React 19.2, TanStack Router 1.170.x, Query
5.101.x; TanStack Start RC; Next 16.3). Reference-architecture evidence
(Linear/Attio/Notion/Superhuman) with sources there.

## Decision

The product app is a Vite 8 + React 19.2 SPA using TanStack Router v1 and
TanStack Query v5; the marketing site is a separate deploy (Next 16 or
Astro — decided when built, M4) and never constrains the app.

## Why this option

1. The data layer is the product (the unanimous reference-class lesson);
   SPA-first lets ADR-0003's layer own data flow without framework fights.
2. Type-safe routing end-to-end matches CODING_STANDARDS' single-source
   typing chain.
3. Marketing/SEO needs are real but belong to a separate artifact with a
   separate deploy cadence.
4. TanStack Start (same router) remains a cheap migration if in-app SSR
   ever becomes necessary — the decision is reversible where it matters.

## Trade-offs accepted

- Two frontend artifacts (app + marketing) instead of one framework.
- No SSR for the app shell; cold-load budget must be met with code
  splitting, preloading, and CDN — measured in CI (TESTING.md).
- We forgo the Next.js ecosystem's gravitational conveniences.

## Future impact

- Easier: ADR-0003's collections/sync path; Electron/desktop wrapper
  later (Linear pattern); keeping perceived-speed budgets.
- Harder: any future SEO-relevant in-app surface (public record pages)
  would need TanStack Start migration or a separate rendered surface.
- Revisit: TanStack Start GA + 6 months of stability (adopt for server
  functions if needed); React 19.x `<Activity/>`-class features changing
  SPA cost calculus; if the marketing site and app ever need to merge.
