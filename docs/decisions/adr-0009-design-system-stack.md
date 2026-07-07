# ADR-0009: Design-system technology — Tailwind v4 + DTCG tokens, Base UI, Motion

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** design, frontend

## Problem

`DESIGN_SYSTEM.md` (Strata) defines the design _language_; this ADR fixes
the technology that implements it: token pipeline, styling engine,
headless primitives, motion. Forces: WCAG 2.2 AA encoded in tokens;
co-equal dark/light from one primitive set; owned component code with no
stock aesthetic leaking; a data-grid-heavy product.

## Alternatives considered

### Option A — DTCG tokens → CSS custom properties via Tailwind v4 `@theme`; Base UI primitives; TanStack-class grid machinery; Motion library

- Tailwind v4 is CSS-first: `@theme` makes design tokens _be_ CSS custom
  properties — the token system and the styling engine are one artifact,
  OKLCH-native.
- W3C DTCG token format hit its first stable version (2025.10) — the
  portable, tool-agnostic source format for the three-tier architecture.
- Base UI: the successor energy of the headless space — Radix development
  slowed post-WorkOS acquisition; Base UI v1.0 shipped Dec 2025 from the
  Radix/Floating-UI/MUI lineage authors. Headless = Strata owns every
  pixel.
- Motion (the library) + View Transitions API both production-ready for
  the token-based motion system.
- Weaknesses: Base UI is a young v1; Tailwind-in-components requires
  discipline (semantic tokens only — lint-enforced).
- Evidence: `docs/research/premium-saas-design-language.md` (sources for
  DTCG 2025.10, Base UI v1.0, Radix post-acquisition trajectory, Tailwind
  v4 @theme, WCAG 2.2 focus/target rules).

### Option B — shadcn/ui as the component base

- Fast start, huge mindshare, copy-in ownership model (which we do adopt
  _as a pattern_).
- Rejected as a base: its Radix underpinnings and recognizable default
  aesthetic violate Strata's "no stock component aesthetic may leak"
  rule; we'd spend the saved time un-styling it.

### Option C — CSS-in-JS (vanilla-extract / StyleX)

- Typed styles, real modules. But runtime/zero-runtime trade-offs,
  smaller talent pool, and Tailwind v4 already closed the token-pipeline
  gap that used to justify it.

### Option D — Radix UI primitives

- The 2021–24 default, proven. But development visibly slowed after the
  WorkOS acquisition; betting new primitives on it in 2026 is betting on
  the past.

## Research

`docs/research/premium-saas-design-language.md` (snapshot 2026-07-06) —
typography, OKLCH ramps, density, motion durations, WCAG 2.2 specifics,
and the component-layer survey feeding `DESIGN_SYSTEM.md`.

## Decision

Design tokens authored in DTCG format (three tiers: primitive → semantic
→ component), compiled to CSS custom properties and consumed through
Tailwind CSS v4 `@theme`; components built on Base UI headless primitives
with fully owned code; data grid on TanStack-class virtualization
machinery styled by Strata; motion via the Motion library + View
Transitions, driven by the Strata motion tokens.

## Why this option

1. Tokens-as-CSS-custom-properties makes theming (dark/light remap) and
   AA-in-tokens mechanically enforceable — contrast checks run against
   token values in CI, not against screenshots.
2. Headless + owned code is the only path to "premium is restraint plus
   consistency" — no fighting someone else's aesthetic.
3. DTCG portability keeps Figma/tooling integrations open without
   custom formats.
4. Every piece is independently replaceable (tokens outlive any library).

## Trade-offs accepted

- We build more component code than a shadcn adopter (the cost of a
  design language that is an asset; specs in `docs/design-system/`
  amortize it).
- Base UI v1 youth — pinned versions; primitives wrapped in our own API
  so a swap stays behind one layer.
- Tailwind utility discipline requires lint enforcement (semantic-token-
  only classes in components).

## Future impact

- Easier: marketing/product/docs visual consistency from one token set;
  theming (including future high-contrast); design-tool sync via DTCG.
- Harder: contributors accustomed to shadcn defaults must learn Strata's
  primitives (mitigated by specs + Storybook).
- Revisit: Base UI stagnation or a Radix revival (swap behind the wrapper
  layer); DTCG spec revisions; if component-spec velocity in M1 proves too
  slow, re-scope which components are bespoke vs wrapped.
