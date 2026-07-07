# Menu

> **Status:** v1.0, 2026-07-07 (TASK-0013). Implementation:
> `packages/ui/src/menu/` on Base UI `Menu`. Storybook `Strata/Menu`;
> behavior in `menu.test.tsx`.

## Anatomy

```
Menu.Root
├── Menu.Trigger      (merges onto the passed trigger element)
└── Menu.Portal → Menu.Positioner (sideOffset 4)
    └── Menu.Popup    (surface-overlay + hairline + --shadow-overlay)
        ├── MenuItem  (28px rows; data-highlighted → surface-sunken)
        ├── MenuItem danger (status-danger-text)
        └── MenuSeparator (hairline)
```

## Usage rules

- Menus hold **actions**, not navigation (nav lives in the rail/⌘K).
- Every menu action must also be reachable elsewhere (⌘K or a visible
  control) — menus are shortcuts, never the only path.
- Destructive items: `danger` + last position + separator above; menus
  never perform irreversible actions directly (confirm via Dialog).
- Submenus allowed one level deep; deeper means the interaction is wrong.

## Keyboard & a11y

Base UI provides the full menu-button pattern: Enter/Space/ArrowDown on
trigger opens with first item focused, arrow keys rove, typeahead jumps,
Enter activates, Esc closes and restores focus. Roles
(`menu`/`menuitem`), `aria-haspopup`/`aria-expanded` on the trigger —
verified by axe with the popup open.
