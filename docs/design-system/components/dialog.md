# Dialog

> **Status:** v1.0, 2026-07-07 (TASK-0013). Implementation:
> `packages/ui/src/dialog/` on Base UI `Dialog`. Storybook
> `Strata/Dialog`; behavior in `dialog.test.tsx`.

## Anatomy

```
Dialog.Root (modal)
├── Dialog.Trigger   (merges onto the passed trigger element — no wrapper node)
└── Dialog.Portal
    ├── Dialog.Backdrop   (scrim: neutral-1000 @ 60%)
    └── Dialog.Popup      (surface-overlay, hairline border, radius-lg,
        │                  the ONE legitimate shadow: --shadow-overlay)
        ├── Dialog.Title        (accessible name)
        ├── Dialog.Description  (optional)
        ├── children
        └── footer              (right-aligned action row)
```

## Usage rules

- Dialogs are **modal and rare**: confirmations, focused single-task
  forms. Record inspection uses the peek panel (DESIGN_SYSTEM.md §5);
  inline editing beats modal editing (anti-pattern list).
- Footer order: dismiss (ghost, via `DialogClose`) then primary. Exactly
  one primary.
- Width caps at 28rem; content scrolls, the page never does.

## Motion

Enter/exit: opacity + 2% scale + 2% rise, `duration-base`, `ease-out`,
via Base UI's `data-starting-style`/`data-ending-style`. Disabled under
`prefers-reduced-motion`.

## Keyboard & a11y

Focus is trapped while open and returns to the trigger on close; Esc
closes; backdrop click closes. Title is the accessible name
(`aria-labelledby`), description wired via `aria-describedby`. Trigger
semantics merge onto the passed element — the a11y tree contains no
wrapper nodes (verified by axe in tests).
