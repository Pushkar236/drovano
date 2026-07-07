# @drovano/config

Shared configuration presets. Every workspace package extends these rather
than declaring its own compiler options (CODING_STANDARDS.md: one blessed
pattern per concern).

## Public interface

- `tsconfig/base.json` — strictness baseline every package inherits
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, no emit).
- `tsconfig/node.json` — base + NodeNext module resolution for backend and
  tooling packages. Frontend packages get a `dom.json` preset when the app
  shell lands (TASK-0016).

ESLint and Prettier are configured once at the repository root
(`eslint.config.mjs`, `.prettierrc.json`) and apply to all packages; they
are not duplicated here.

## Invariants

- Presets only ever get stricter; loosening a flag requires an ADR.
- No package may override the strictness flags locally.
