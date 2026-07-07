# @drovano/web

The Drovano product app: Vite + React SPA (ADR-0002) wearing the Strata
shell. Implements [`docs/design-system/interaction.md`](../../docs/design-system/interaction.md)
§2/§3/§6: three-zone layout (rail · canvas · peek), the global keymap,
and the owned command surface (⌘K/Ctrl+K).

## Structure

- `src/router.tsx` — code-based TanStack Router; `createTestRouter` gives
  tests a memory history.
- `src/shell.tsx` — three zones, keymap, focus management (route change →
  h1, palette restores its invoker).
- `src/command-palette.tsx` + `src/commands.ts` — the command surface and
  its registry (combobox/listbox with `aria-activedescendant`); modules
  contribute commands as they land.
- `src/theme.ts` — light/dark/system via `data-theme`, persisted.
- Styling: Tailwind v4 utilities generated from the token bridge
  (`@drovano/tokens/strata-tailwind.css`) — semantic tokens only.

## Commands

`pnpm dev` · `pnpm build` · `pnpm test` (jsdom: shell behavior, palette
keyboard model, theme persistence, axe).
