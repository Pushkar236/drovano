# Drovano Design System — "Strata"

Strata is Drovano's original design language. It is derived from principles
(researched in `docs/research/premium-saas-design-language.md`), not from any
company's identity. Its thesis:

> **Premium is restraint plus consistency.** A small number of absolute
> rules, applied without exception, on every surface — product, marketing,
> docs, emails. Every exception is a system bug.

Strata is named for its core structural idea: a business OS is layers of
work — and the interface expresses layering through **light and hairlines,
not decoration**.

## 1. Personality

Drovano should feel like a precision instrument that is calm to live in:

- **Precise, not cold.** Engineering-grade type and numerals; warm accent.
- **Dense, not cramped.** High information density on a strict grid.
- **Quiet, not empty.** Chrome recedes; the user's data is the interface.
- **Fast, felt.** Every interaction acknowledges within 100ms.
- **AI as a colleague, not a mascot.** No sparkle-badging; AI output is
  provisional, attributed, and where the work happens.

## 2. The absolute rules

These are the "few decisions, held absolutely." Changing any of them
requires an ADR.

1. **One accent.** A single warm accent hue (ember — an orange-copper
   family, deliberately counter to the cool-accent norm of the category) is
   used exclusively for: primary actions, selection, focus, and brand
   moments. Never for decoration. Semantic colors (success, warning,
   danger, info) appear only when they carry meaning.
2. **Neutral-heavy surfaces.** Everything else is a cool graphite neutral
   ramp, defined in OKLCH with fixed lightness steps so light/dark themes
   derive systematically.
3. **Structure is drawn with hairlines and light, not shadows.** Panels,
   tables, and cards separate via 1px hairline "seams" and (in dark mode) a
   lightness-elevation ladder. Drop shadows are reserved for true overlays
   (menus, dialogs, palette) — nothing else floats.
4. **Two typefaces, purchased with intent.** One sharp grotesque for UI and
   editorial; one monospace with tabular numerals for every ID, metric,
   timestamp, and table number. Hierarchy comes from weight and spacing,
   not size sprawl. UI body sits at 13–14px in work surfaces.
   (Final typeface selection is TASK-0012 — an evaluation with rendering
   tests across Windows/macOS, not a default to Inter.)
5. **4px grid, no off-grid values.** Two density contexts — *calm*
   (marketing, onboarding, empty states: generous whitespace) and *dense*
   (tables, boards, records: compact rhythm) — one spacing scale.
6. **Dark and light are co-equal themes.** Both ship at full quality from
   the first screen. Dark is designed (no pure black, elevation via
   lightness, re-tuned accent chroma), never inverted. Default follows
   system preference.
7. **Keyboard first.** The interaction model is designed keyboard-first;
   the pointer is the alternative. ⌘K opens the command surface: actions,
   navigation, search, and natural-language commands in one. Every palette
   entry teaches its shortcut inline. Every mouse action is key-reachable.
8. **Motion is a token system.** Three durations (`fast` ~120ms, `base`
   ~200ms, `slow` ~320ms), ease-out default, one signature spring for
   spatial moves. Animate enter/exit/reposition/feedback only — never data
   updates, never table cells. Everything respects `prefers-reduced-motion`.
9. **The three unloved states are designed surfaces.** Every data surface
   ships empty (headline + one-line explanation + single next action,
   per-scenario variants), loading (skeletons matched to final layout;
   spinners only for short blocking actions), and error (what happened,
   why, what to do — with a retry/repair action). A feature without these
   three states designed is incomplete.
10. **WCAG 2.2 AA is encoded in tokens, not audited later.** ≥24px hit
    targets in dense UI (hit-area expansion, not visual growth); a branded
    2px accent focus ring at ≥3:1 contrast; focus never obscured by sticky
    chrome; no color-only status encoding; every drag has a non-drag path.

## 3. AI surface rules

AI is infrastructure, not a feature to be badged.

- **Placement by task weight:** *embedded* (ghost text, inline suggestions,
  one-keystroke accept) for light transforms; *assistive* (contextual side
  panel) for content and analysis work; *immersive* (AI-primary canvas)
  only for genuinely open-ended work. Chat is the last resort, not the
  default. AI is never exiled to a sidebar that forces context switching
  away from the work.
- **Provisional until accepted:** AI-generated content is visually marked
  as a draft until a human accepts it. Accepting is one keystroke;
  rejecting is equally easy.
- **Attributed and auditable:** every AI-taken action is visibly attributed
  to the worker that performed it, with provenance (what it read, what it
  did) one interaction away.
- **Consequential actions gate on humans:** sending, deleting, sharing
  externally, or spending money always requires human confirmation unless a
  user has explicitly delegated that class of action.

## 4. Token architecture

- **Standard:** W3C DTCG token format (first stable version 2025.10).
- **Three tiers:** primitive (`neutral-800`, `space-4`, `ember-500`) →
  semantic (`color-text-primary`, `surface-raised`, `color-focus-ring`) →
  component (`button-primary-bg`). Components reference semantic tokens
  only; nothing references a primitive directly except the semantic layer.
- **Naming:** kebab-case, `category-property-variant-state`; semantic names
  state intent, never appearance.
- **Color space:** OKLCH for all ramps; fixed lightness/chroma steps per
  hue so contrast is provable and dark variants derive systematically.
- **Implementation:** CSS custom properties as the single source of truth,
  surfaced through Tailwind CSS v4 `@theme`. Light/dark = remapping
  semantic tokens over one primitive set; components are theme-ignorant.
- **Elevation:** light mode = hairline seams + rare overlay shadow; dark
  mode = base surface + 3 raised steps of increasing lightness.

## 5. Component layer

- Headless, accessible primitives (Base UI class) with **owned component
  code** styled entirely by Strata tokens — we own every component's source
  and appearance; no stock component aesthetic may leak through.
- Data grid and virtualization use dedicated, proven machinery (TanStack
  class) beneath Strata styling; tables are the heart of a business OS and
  get first-class investment: viewport virtualization, inline edit with
  inline validation, full keyboard grid model (arrows/Home/End/PageUp/
  PageDown/Enter/Esc), tabular right-aligned numerals, bulk-select with a
  sticky action bar, saved views.
- Layout is the three-zone pattern: navigation rail/sidebar (collapsible to
  icons) · work canvas · contextual panel (record peek/inspector). Record
  inspection prefers the peek panel over full navigation.

The formal component specifications and token values are produced in M1
(`docs/design-system/` — see its README) and validated in Storybook with
automated a11y checks.

## 6. Anti-patterns (rejected explicitly)

- Gradient meshes, glow-on-dark, full-surface glassmorphism, neumorphism,
  gratuitous 3D — fast-dating surface effects.
- "Powered by AI" badges and sparkle iconography.
- Stock shadcn/Radix visual defaults reaching production.
- Spinners where skeletons belong; layout shift on load.
- Modal-first editing where inline editing preserves context.
- Shadow-based card soup; decoration standing in for hierarchy.

## 7. Governance

- Token changes: PR + design-system owner review. New components: spec in
  `docs/design-system/` first, then implementation with Storybook story +
  axe checks. Visual regression screenshots gate merges once the component
  library exists (M1).
- This document is the contract; `docs/design-system/` holds the evolving
  specifications; ADR-0009 records the technology choices behind it.
