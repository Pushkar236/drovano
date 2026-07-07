# Interaction — Keyboard, Command Surface, Focus

> **Status:** v1.0, 2026-07-07 (TASK-0014). Governing contract:
> [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) rules 7–8, 10. First
> implementation target: the app shell (TASK-0016); the full grid model
> arrives with the data grid (TASK-0025).

## 1. Principles

1. **Keyboard-first**: the interaction model is designed at the keyboard;
   the pointer is the alternative. Every pointer action has a key path.
2. **⌘K is the front door**: actions, navigation, and search live in one
   command surface; every palette entry teaches its shortcut inline.
3. **Focus is never lost, trapped incorrectly, or obscured** (WCAG 2.2:
   focus-not-obscured; our sticky chrome must scroll-margin around it).
4. Shortcuts are **mnemonic and flat** — single keys in list contexts
   (Linear-class), modifier chords only for globals.

## 2. Global keymap (reserved now, implemented per surface)

| Key                  | Action                                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| `⌘K` / `Ctrl+K`      | Open command surface                                                    |
| `⌘/` / `Ctrl+/`      | Keyboard-shortcut reference overlay                                     |
| `⌘\` / `Ctrl+\`      | Toggle navigation rail                                                  |
| `⌘.` / `Ctrl+.`      | Toggle context panel (peek)                                             |
| `Esc`                | Close topmost surface (palette → dialog → menu → peek), never navigates |
| `g` then `h`/`i`/`t` | Go-to sequences (home, inbox, tasks — grow per module)                  |
| `?` (in lists)       | Same as ⌘/                                                              |

Windows/Linux use `Ctrl`; labels render the platform-correct modifier.
Single-key shortcuts are suppressed while focus is in a text control.

## 3. Command surface (⌘K) specification

- **One input, three result groups**: Actions (verbs in current context),
  Navigation (go to…), Search (records — lands with M2 data). Natural-
  language commands join in M3 (PRD §3.5).
- Opens as a top-centered overlay (`surface-overlay`, `--shadow-overlay`),
  input autofocused; background inert.
- Filtering is instant per keystroke (< 50 ms budget, PRD §5); empty
  result state is a designed state ("No matches — try …", voice.md).
- **Keyboard model**: `↑/↓` move selection (wrapping), `Enter` runs,
  `Esc` closes and restores focus to the invoking element, `⌘K` toggles.
  Selection follows pointer hover; pointer click runs.
- Each row: name, context hint, and its shortcut (teaching inline);
  selected row uses `surface-sunken`, `aria-selected`.
- A11y: `role="dialog"` container with a `combobox` input +
  `listbox`/`option` results wired via `aria-activedescendant`; selection
  changes are announced.

## 4. Focus management rules

- Focus ring: 2px `focus-ring` outline, offset 1px, `:focus-visible`
  only — never suppressed, never replaced by color alone.
- Overlays trap focus while open and **restore focus to the trigger** on
  close (Base UI provides this; regressions are test failures).
- Route changes move focus to the new view's `h1`/main landmark;
  announcements via a polite live region.
- Skip link ("Skip to content") is the first tabbable element of the app
  shell.
- Hit targets ≥ 24×24 px in dense UI via hit-area expansion, not visual
  growth (DESIGN_SYSTEM.md rule 10).

## 5. Motion in interaction

Durations/easings come only from tokens (`fast` for menus/hover, `base`
for dialogs/panels, `slow` for spatial moves). Animate enter/exit/
reposition/feedback — never data updates, never table cells. All motion
collapses under `prefers-reduced-motion` (component CSS already complies;
the shell must too).

## 6. Three-zone shell behaviors (TASK-0016 contract)

- **Rail** (left): collapsible to icons (`⌘\`), keyboard-navigable list,
  current location marked with `aria-current="page"`.
- **Canvas** (center): owns the document title and the `h1` focus target.
- **Peek panel** (right): non-modal; `Esc` closes when focus is inside;
  opening does not steal focus from the canvas unless invoked by keyboard.
