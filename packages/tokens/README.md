# @drovano/tokens

Strata design tokens (ADR-0009; contract in
[`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md); specification in
[`docs/design-system/tokens.md`](../../docs/design-system/tokens.md)).

## Public interface

- `tokens.json` — the DTCG source of truth. Three tiers: primitives
  (`color.*`, `space.*`, `font.*`, `duration.*`, `easing.*`, `radius.*`,
  `z.*`) and the semantic tier (`theme.light.*` / `theme.dark.*`).
  Component tokens arrive with component specs (TASK-0013+).
- `@drovano/tokens/strata.css` — built artifact (`pnpm build`): primitives
  - light semantics in `:root`, dark remaps via `[data-theme='dark']` and
    `prefers-color-scheme`. Consumed by the app shell through Tailwind v4
    `@theme` (TASK-0016).
- Programmatic API: `loadTokens()`, `renderCss()`, and the OKLCH color
  math (`contrastRatio`, `isInSrgbGamut`) used by the contract tests.

## Invariants

1. **The contrast contract is the merge gate.** Every readable pairing is
   asserted ≥ WCAG AA in `src/contrast-contract.test.ts`; a palette change
   that breaks a floor is a failing build. New text-like semantic tokens
   must add contract rows (the completeness check fails otherwise).
2. Every color token must be inside the sRGB gamut (tested).
3. `theme.light` and `theme.dark` define identical keys (tested and
   enforced by the builder).
4. Components reference semantic tokens only — never primitives
   (ADR-0009; lint-enforced once components exist).
