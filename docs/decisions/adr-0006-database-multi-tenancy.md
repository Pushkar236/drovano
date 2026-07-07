# ADR-0006: Database & tenancy — Postgres 18 on Neon; shared schema + RLS; Drizzle + Kysely

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** data, security, infra

## Problem

The most consequential decision in the system: the database, the tenancy
model for 100k+ organizations, and the ORM. Forces: tenant isolation is a
hard security requirement (SECURITY.md non-negotiable #1: enforced in the
database, not only app code); sub-second tenant provisioning; user-defined
schema (custom objects) without DDL; vectors, audit, and sync all want to
live near the data; a small team that can operate exactly one database
technology well.

## Alternatives considered

### Option A — Postgres 18 (Neon) · shared schema + `tenant_id` (uuidv7) + RLS · Drizzle ORM + Kysely

- The AWS-prescribed pool model; `SET LOCAL app.current_tenant_id` policy
  shape is transaction-pooling-safe; ~1–5% overhead done right; native
  `uuidv7()` in PG18; pgvector in the same database (ADR-0010).
- Neon: serverless Postgres, PITR, branch-per-preview-environment,
  documented database-per-tenant control-plane pattern for the future
  enterprise silo tier.
- Drizzle: the **only major TS ORM with RLS policies as schema-code**
  (`pgPolicy`); SQL-proximate; light enough for workers. Kysely for
  gnarly typed reporting SQL.
- Weaknesses: RLS footguns are real (owner bypass, leaky functions,
  index discipline — all codified in `multi-tenancy.md`); Drizzle 1.0 is
  RC (pin 0.45.x); Neon is Databricks-owned (alignment risk).
- Evidence: research §4 with AWS/PgBouncer/Supabase/Bytebase sources;
  `docs/architecture/multi-tenancy.md` records the exact mechanics.

### Option B — Schema-per-tenant

- Strong logical isolation, per-tenant restore.
- **Disqualified at target scale:** pg_catalog bloat, O(N) migrations
  (45+ minute deploys reported), practical ceiling in the low thousands
  of tenants.

### Option C — Database-per-tenant

- Strongest isolation; Neon economics make it feasible.
- Wrong as the _default_: connection/control-plane complexity for 100k
  tenants, cross-tenant analytics pain. Right as the **enterprise-tier
  exit**, which Option A's row discipline keeps open (bridge model).

### Option D — App-layer scoping only, no RLS (PlanetScale's position)

- Simpler mental model, no policy overhead.
- Rejected: one application bug = cross-tenant leak with no backstop. Our
  answer to the "RLS at scale" critique is trivial single-GUC policies +
  RLS-as-backstop-not-authorization.

### Option E — Prisma 7 instead of Drizzle

- Legitimate again (Rust engine gone, TS/WASM compiler); but no
  first-class RLS (tenancy via client-extension wrappers), and reference
  users remain on v6 — migration churn without the RLS payoff.

## Research

`docs/research/technology-stack-2026.md` §4 (verified 2026-07-06:
Postgres 18, Drizzle 0.45.2 / 1.0.0-rc.4, Prisma 7.8.0, pgvector 0.8.4;
market consolidation: Neon→Databricks, Crunchy→Snowflake, PlanetScale
Postgres GA). Honesty note: no named public RLS-at-100k-tenants case
study exists; Citus documents millions of tenants on tenant_id sharding.

## Decision

Postgres 18 on Neon; pool model — shared schema, `tenant_id` (uuidv7) on
every row, RLS with `SET LOCAL` GUC policies as the database-enforced
backstop, non-owner app role, `FORCE ROW LEVEL SECURITY`; Drizzle ORM
(pinned 0.45.x until 1.0 GA) with policies as schema-code; Kysely for
reporting; custom objects via the typed-EAV hybrid (data-model.md §4),
never DDL.

## Why this option

1. Only Postgres lets tenancy, vectors, audit, full-text, and CDC-based
   sync compound on one operational competence (ARCHITECTURE.md
   principle 1).
2. The pool model is the only choice that preserves _every_ exit —
   Citus, PlanetScale Postgres, and silo-per-enterprise all key on
   `tenant_id`-on-every-row.
3. RLS as backstop converts the worst bug class (cross-tenant leak) into
   a zero-row result; Drizzle makes the policies reviewable code.
4. Neon's branching gives per-PR preview databases — a testing-strategy
   force multiplier (TESTING.md).

## Trade-offs accepted

- RLS discipline forever: every table, every migration, every index
  reviewed against the checklist; enforced by the verify-docs/lint
  tooling (TASK-0004 successor scripts) and integration tests, not memory.
- Neon vendor risk under Databricks (mitigated: it's vanilla Postgres;
  exit is pg_dump-shaped).
- Drizzle RC timing risk (mitigated: pinned stable 0.45.x).
- Typed-EAV read paths are more complex than concrete columns (accepted
  for DDL-free customization; hot paths use concrete tables).

## Future impact

- Easier: enterprise silo tier (bridge model), scale-out sharding,
  Electric/CDC sync, per-PR environments.
- Harder: any future non-Postgres storage must justify itself against
  the compounding-competence principle.
- Revisit: Drizzle 1.0 GA (lift pin, adopt Relational Queries v2);
  sustained write saturation of one primary (Citus vs PlanetScale
  bake-off); first enterprise deal demanding silo/residency (activate
  bridge pattern); Neon pricing/priority drift post-Databricks.
