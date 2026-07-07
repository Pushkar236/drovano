# Table (shell)

> **Status:** v1.0, 2026-07-07 (TASK-0013). Implementation:
> `packages/ui/src/table/`. Storybook `Strata/Table`; behavior in
> `table.test.tsx`.
> **Scope note:** this is the _presentation shell_ — semantic-HTML
> primitives establishing the dense-context pattern for simple tables.
> The real data grid (virtualization, inline edit, full keyboard grid
> model, bulk select, saved views) is TASK-0025 (M2) and consumes these
> visual rules; it is specced separately when built.

## Anatomy & visual rules

`Table / TableHead / TableBody / TableRow / TableHeaderCell / TableCell` —
real `<table>` semantics, `scope="col"` headers.

- **Hairline seams, no boxes** (DESIGN_SYSTEM.md rule 3): row separation
  by 1px `border-hairline` bottom borders only; no vertical rules, no
  zebra striping.
- Dense context: 32px rows, `text-base` (13px), header in `text-sm`
  medium `text-secondary`, sticky.
- Hover: `surface-sunken`. Selected: `accent-subtle` + `aria-selected`.
- **`numeric` cells: mono, `tabular-nums`, right-aligned** — every ID,
  metric, timestamp, and amount (DESIGN_SYSTEM.md rule 4).
- Cells truncate with ellipsis; the row height never grows.

## A11y

Tables carry an accessible name (`aria-label` or caption). Column headers
are `<th scope="col">`. Selection state is exposed via `aria-selected`.
The shell has no keyboard grid model by design — that arrives with the
data grid (arrows/Home/End/PageUp/PageDown/Enter/Esc per
DESIGN_SYSTEM.md §5).
