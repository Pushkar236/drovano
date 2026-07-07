# Drovano Coding Standards

These standards exist so that any engineer (or agent) can open any file and
find the same shape of code. Consistency is a feature; cleverness is a cost.

## Language

- **TypeScript everywhere** (frontend, backend, tooling, scripts), `strict`
  mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` on.
- `any` is banned. `unknown` + narrowing at boundaries. `as` casts require a
  comment stating the invariant that makes them safe.
- Runtime validation (Zod) at every trust boundary; static types alone do
  not validate external data. Derive static types from schemas
  (`z.infer`) — one source of truth.

## Architecture rules

- **Modular monolith discipline:** modules (contacts, deals, auth, ai, …)
  expose an explicit public interface; nothing imports another module's
  internals. Dependency direction is enforced by lint rules, not convention.
- **Domain logic is framework-free.** Business rules live in pure functions
  and services that know nothing about HTTP, React, or the ORM. Frameworks
  are adapters at the edges.
- **One way to do each thing.** Data fetching, error handling, forms,
  mutations, permissions checks — each has exactly one blessed pattern,
  documented in `docs/architecture/`. New patterns require an ADR.
- **No duplicated logic.** Second occurrence: extract if the two call sites
  genuinely share a concept. Do not abstract coincidental similarity.

## Naming

- Names state intent in full words: `remainingSeatCount`, not `remSeats`.
- Files: `kebab-case.ts`. React components: `PascalCase` export in a
  kebab-case file. Types/interfaces: `PascalCase`, no `I` prefix.
- Booleans read as predicates (`isArchived`, `hasAccess`, `canEdit`).
- Functions are verbs; values are nouns. Event handlers: `handleX` /
  `onX` (prop).
- Database: `snake_case` tables and columns, singular table names are not
  used — plural (`contacts`), junction tables as `a_b` (`deal_contacts`).

## Errors

- Expected failures (validation, not-found, conflict, permission) are typed
  results or domain errors mapped to precise API error codes — never generic
  500s, never control flow via exceptions across module boundaries.
- Every error surfaced to a user is actionable: what happened, why, what to
  do. Raw error internals never reach the UI or the public API.
- Every caught error is either handled meaningfully or rethrown with
  context. Swallowed errors (`catch {}`) are lint failures.
- All async boundaries have failure behavior defined: timeout, retry policy
  (with backoff and idempotency), or explicit propagation.

## Components & UI code

- Components are small and single-purpose; extract when a component exceeds
  ~150 lines or gains a second responsibility.
- Server state via the blessed data layer (query/mutation hooks); local UI
  state via component state; global client state only for genuinely global
  concerns (theme, command palette, session).
- Every data surface implements loading, empty, and error states — these are
  designed states (see DESIGN_SYSTEM.md), not afterthoughts.
- Interactive elements are keyboard-accessible and labeled; semantic HTML
  first, ARIA only where semantics fall short.

## Comments & docs

- Comments explain **why** (constraints, invariants, links to decisions),
  never narrate what the code does.
- Every module has a `README.md`: purpose, public interface, invariants.
- Public API surface is documented from source (schema-derived OpenAPI).

## Tooling (enforced, not aspirational)

- **Formatter:** Prettier, zero config debates, runs on pre-commit.
- **Linter:** ESLint (typescript-eslint strict-type-checked) + dependency
  boundary rules + a11y rules. Zero warnings policy — warnings become
  errors in CI.
- **Typecheck:** `tsc --noEmit` in CI for every package.
- **CI gate:** build + lint + typecheck + tests must be green to merge.
  There is no override path for convenience.

## Git

- Conventional Commits (see CONTRIBUTING.md).
- `main` is always releasable. Feature flags over long-lived branches.
