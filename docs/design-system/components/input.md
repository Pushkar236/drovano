# Input

> **Status:** v1.0, 2026-07-07 (TASK-0013). Implementation:
> `packages/ui/src/input/` on Base UI `Field`. Storybook `Strata/Input`;
> behavior in `input.test.tsx`.

## Anatomy

```
Field.Root
├── Field.Label        (required — no unlabeled inputs exist)
├── Field.Control      (the <input>)
├── Field.Description  (optional supporting copy)
└── Field.Error        (external error message)
```

Base UI wires ids/aria between parts automatically; the label is a real
`<label>` association, not a placeholder substitute.

## States

Rest / focus-visible (2px `focus-ring` + border tint) / **invalid**
(`error` prop: `border → status-danger-text`, message below in
`status-danger-text`, `aria-invalid` on the control) / disabled (sunken
surface, opacity). Error is a designed state (DESIGN_SYSTEM.md rule 9):
message says what happened and what to do, per voice.md (TASK-0015).

## API rules

- `label` is required by the type system.
- `error` carries **domain/server validation**; native constraint
  validation (via `required`, `pattern`, …) also renders through
  `Field.Error` when used with `validationMode`.
- Placeholder is a hint, never the label; never required information.

## Keyboard & a11y

Standard text-input model. Description and error are associated via
`aria-describedby` (Base UI). Height 32px meets the 24px minimum target
with margin.
