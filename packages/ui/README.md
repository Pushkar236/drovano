# @drovano/ui

The Strata component library (DESIGN_SYSTEM.md §5, ADR-0009): Base UI
headless primitives, fully owned code and appearance, **semantic tokens
only** — no primitive token or raw color value may appear in component
CSS.

## Public interface

Batch 1 (TASK-0013): `Button`, `Input`, `Dialog`/`DialogClose`, `Menu`/
`MenuItem`/`MenuSeparator`, `Table` shell. One spec per component in
[`docs/design-system/components/`](../../docs/design-system/components/).

## Conventions

- One folder per component: `component.tsx` + `component.module.css` +
  `component.stories.tsx` + `component.test.tsx`. Styling is CSS Modules
  over the Strata CSS variables; Tailwind utilities are the _app-surface_
  layer (TASK-0016), not the library's.
- Overlay components (`Dialog`, `Menu`) take their trigger as a real
  element and merge semantics onto it via Base UI `render` — wrapper
  nodes in the accessibility tree are a bug (axe-tested).
- Every component ships its designed states; error/empty/loading are not
  afterthoughts (DESIGN_SYSTEM.md rule 9).

## Quality gates

- `pnpm test` — jsdom + Testing Library behavior tests + axe checks
  (color-contrast handled by the token contract; landmarks by app-level
  E2E).
- `pnpm storybook` (port 6106) — visual workbench with the Strata
  light/dark toolbar; addon-a11y set to error on violations.
- Visual regression screenshots gate merges once the library stabilizes
  (DESIGN_SYSTEM.md §7).
