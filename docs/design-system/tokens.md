# Strata Tokens — Specification

> **Status:** v1.0, 2026-07-07 (TASK-0011). Source of truth:
> [`packages/tokens/tokens.json`](../../packages/tokens/tokens.json)
> (DTCG). This document records the _rationale_; values live in the file
> and are validated in CI. Governing contract:
> [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md); technology: ADR-0009.

## The deal these tokens make

WCAG 2.2 AA is **encoded, not audited**: `packages/tokens/src/
contrast-contract.test.ts` asserts every readable pairing (17 pairs × both
themes) plus sRGB gamut and theme parity, in CI, on every change to
`tokens.json`. The palette can evolve — the floors cannot.

Aesthetic refinement is expected: these values were chosen by principle
and proven by math; they get tuned against real rendered components in
Storybook (TASK-0013+) through normal PRs, with the contract as the
guardrail. What is _not_ provisional: the ramp structure, the semantic
vocabulary, and the floors.

## 1. Color

**Neutrals ("graphite"):** one cool ramp, hue 255, chroma ≤ 0.012, fifteen
fixed lightness steps from `neutral-0` (white) to `neutral-1000`
(L 0.13 — never pure black). Fixed steps are what make the dark theme a
_remap_, not a redesign.

**Accent ("ember"):** a single warm orange-copper ramp, hue 52 —
deliberately counter to the category's cool accents (research:
`premium-saas-design-language.md`). Used exclusively for primary actions,
selection, focus, and brand moments (DESIGN_SYSTEM.md rule 1).

**Semantic hues** (green/amber/red/blue) exist only to carry meaning
(success/warning/danger/info), three steps each: `400` (dark-theme text),
`600` (solid), `700` (light-theme text). Subtle status backgrounds arrive
with component specs when a real component needs them.

**Interaction-state rule discovered by the math:** accent hover/active
must _darken_ in both themes — a lighter hover on dark (`ember-500`) drops
white-text contrast to ~3.2:1, below AA. The contract now pins all three
button states ≥ 4.5:1.

## 2. Semantic tier

Both themes define the identical key set (builder + test enforced):

| Group    | Tokens                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Surfaces | `surface-base`, `surface-raised`, `surface-overlay`, `surface-sunken` — light separates by hairlines on near-white; dark is the elevation ladder 950 → 900 → 850 (DESIGN_SYSTEM.md rule 3) |
| Text     | `text-primary`, `text-secondary`, `text-muted`, `text-accent`, `text-on-accent`                                                                                                            |
| Borders  | `border-hairline` (structure), `border-strong` (inputs, emphasis)                                                                                                                          |
| Accent   | `accent-solid`, `accent-hover`, `accent-active`, `accent-subtle`, `focus-ring`                                                                                                             |
| Status   | `status-{success,warning,danger,info}-{text,solid}`                                                                                                                                        |

Components reference **only** this tier. CSS variables:
`--color-<semantic-name>` referencing `var(--color-<primitive>)`, so
the cascade stays single-sourced and dark mode swaps ~24 declarations.

## 3. Space, type, motion, radius, z

- **Space:** 4px grid as rem (`space-1` = 4px … `space-24` = 96px, with
  0.5-steps only at the small end). No off-grid values, ever (rule 5).
- **Type scale:** `xs` 11 → `3xl` 32px; work-surface body is `base`
  (13px)/`md` (14px). Hierarchy comes from `weight`
  (400/500/600) and spacing, not size sprawl. Families are **interim
  system stacks** — the purchased grotesque + mono land via TASK-0012 and
  only change two tokens.
- **Motion:** `duration-fast` 120ms / `base` 200ms / `slow` 320ms,
  `ease-out` default. The signature spring and `prefers-reduced-motion`
  handling live in the interaction layer (TASK-0014, TASK-0016).
- **Radius:** 4/6/8/12 + `full`. **Z-scale:** dropdown 1000 → toast 1400;
  only true overlays float.

## 4. Consumption

`pnpm build` in `packages/tokens` emits `dist/strata.css`. The app shell
(TASK-0016) imports it and maps the variables through Tailwind v4
`@theme`; explicit theme choice uses `data-theme="light|dark"` on the
root element, otherwise the system preference applies.

## 5. Change policy

Token changes are PRs against `tokens.json` reviewed by the design-system
owner (DESIGN_SYSTEM.md §7). The CI contract is the hard floor; visual
regression screenshots become a second gate once the component library
exists (M1, TASK-0013+).
