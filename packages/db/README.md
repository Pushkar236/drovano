# @drovano/db

The database layer: Drizzle schema with RLS policies as code, migrations,
and the tenant-scoped connection discipline. Governing decisions:
[ADR-0006](../../docs/decisions/adr-0006-database-multi-tenancy.md);
mechanics: [`docs/architecture/multi-tenancy.md`](../../docs/architecture/multi-tenancy.md).

## Public interface

- `createDb(options)` — the only constructor for database handles.
- `withTenant(db, tenantId, fn)` — **the one blessed way to touch tenant
  data.** Transaction + transaction-local `app.current_tenant_id` GUC;
  all RLS policies key on it.
- Schema exports (`tenants`, `auditLog`, …) for query building.
- `@drovano/db/testing` — `startTestDatabase()`: real-Postgres
  (Testcontainers, postgres:18) harness with owner and app-role
  connections, used by every integration test in the workspace.

## Schema layout

`src/schema/` is organized per domain: `core.ts` (tenancy anchor, audit
log, the canonical tenant predicate), `auth.ts` (identity-layer tables —
global by ADR-0011, consumed by better-auth via `@drovano/identity`),
`workspaces.ts` (tenant-scoped workspace tables). One drizzle-kit project,
one migration history.

## Invariants

1. Every tenant-scoped table: `tenant_id uuid` referencing `tenants`,
   tenant-leading composite indexes, one single-predicate RLS policy
   (`audit_log` in `src/schema/core.ts` is the exemplar — copy its shape).
2. The application connects as `drovano_app` (non-owner, no DDL);
   migrations and provisioning run as the privileged system role.
3. New migrations follow expand-and-contract; `FORCE ROW LEVEL SECURITY`
   on every new table (see migration 0001).
4. `audit_log` is append-only by grants: the app role has INSERT + SELECT
   only.

## Roles in production (Neon)

`drovano_app` is created NOLOGIN by migration 0001. In each environment a
login role is granted into it (`GRANT drovano_app TO <login role>` with
`SET ROLE`, or the login role is created `IN ROLE drovano_app`); the API's
connection string uses that login. Tenant provisioning and cross-tenant
jobs (export, delete) use the owner role, which on Neon carries BYPASSRLS
via `neon_superuser` — exactly why those paths need their own explicit
tenant scoping and isolation tests (multi-tenancy.md §2 rule 6).

## Commands

- `pnpm generate` — drizzle-kit migration generation from `src/schema.ts`.
- `pnpm test` — integration tests against ephemeral Postgres 18
  (requires a running Docker daemon).
