# @drovano/api-contracts

The internal API surface (ADR-0005): request context, tRPC procedures,
and the app router. Clients import only `AppRouter` (a type) — zero
runtime coupling; `apps/api` mounts the router over HTTP.

## Structure

- `context.ts` — per-request context: better-auth session → principal
  loaded once via the identity module; procedures never query membership.
- `trpc.ts` — `publicProcedure` → `authedProcedure` (session) →
  `tenantProcedure` (active organization + principal). Fail closed.
- `routers/` — composed into `appRouter`. `workspaces.rename` is the
  optimistic-mutation exemplar: validate → `can()` with reason → mutate +
  audit in one tenant transaction → return the new truth.

## Invariants

1. Every mutation follows the exemplar shape; no mutation skips `can()`
   or the transactional audit entry.
2. Routers call module services and the db; they contain wiring, not
   business rules. As modules grow (M2), their routers migrate into the
   module packages and this package only composes.
3. The public REST/OpenAPI surface (TASK-0029) derives from the same Zod
   schemas — contracts never fork.
