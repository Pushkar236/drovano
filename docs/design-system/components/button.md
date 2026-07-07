# Button

> **Status:** v1.0, 2026-07-07 (TASK-0013). Implementation:
> `packages/ui/src/button/`. Validated in Storybook (`Strata/Button`) with
> axe; behavior tested in `button.test.tsx`.

## Anatomy

Native `<button>` (no primitive needed) with optional leading spinner.
`type` defaults to `"button"` — submitting is opt-in.

## Variants & usage

| Variant     | Use                                                                   | Surface                            |
| ----------- | --------------------------------------------------------------------- | ---------------------------------- |
| `primary`   | The one main action of a view — ember, at most one visible per region | `accent-solid` / `text-on-accent`  |
| `secondary` | Default for everything else                                           | `surface-raised` + `border-strong` |
| `ghost`     | Low-emphasis, dense contexts (toolbars, rows)                         | transparent                        |
| `danger`    | Destructive, always paired with confirmation for irreversible ops     | `status-danger-solid`              |

Sizes: `md` 32px (default), `sm` 28px — both 4px-grid multiples.

## States

Rest / hover / active (hover and active **darken** in both themes —
contract-pinned, tokens.md §1) / focus-visible (2px `focus-ring` outline,
offset 1px) / disabled (opacity, `cursor: not-allowed`) / **loading**
(spinner + `aria-busy="true"` + interaction blocked; label stays visible —
never replace text with only a spinner).

## Keyboard & a11y

Native button semantics: Enter/Space activate, focusable in DOM order.
Accessible name = children (icon-only buttons must pass `aria-label` —
enforced by axe in tests/Storybook). Spinner is `aria-hidden`; busy state
is announced via `aria-busy`.
