# Multi-Tenancy

> **Status:** v1.0, 2026-07-07. Decision record: [ADR-0006](../decisions/adr-0006-database-multi-tenancy.md).
> Evidence: [`docs/research/technology-stack-2026.md`](../research/technology-stack-2026.md) §4.
> Security requirements: [`SECURITY.md`](../../SECURITY.md).

## 1. Model

**Pool model: shared schema, `tenant_id` on every row, Postgres Row-Level
Security as the database-enforced backstop.** The tenant is the
*organization*; workspaces partition data within a tenant via application
permissions, not separate RLS scopes.

- `tenant_id` is `uuidv7` (Postgres 18 native) — time-ordered, index-friendly.
- **Every table** carries `tenant_id`, including junction tables, embeddings
  tables, and the audit log. No exceptions; this discipline is what keeps
  every scale exit open.
- Application checks (permission service) are the primary control; RLS is
  the backstop that turns an application bug into a zero-row result instead
  of a cross-tenant leak.

## 2. RLS mechanics (the exact shape)

Chosen for compatibility with transaction-mode connection pooling and
verified against the researched footguns:

```sql
-- One policy per table, same shape everywhere:
CREATE POLICY tenant_isolation ON records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE records FORCE ROW LEVEL SECURITY;  -- binds even the table owner
```

Per-request, inside a transaction:

```sql
BEGIN;
SET LOCAL app.current_tenant_id = '<tenant uuid>';
-- ... all queries for this request ...
COMMIT;  -- SET LOCAL scope ends with the transaction
```

**Non-negotiable rules (each has a bite documented in research):**

1. `SET LOCAL` inside a transaction only — safe under
   PgBouncer/Neon transaction-mode pooling; no cross-connection leakage.
2. The application connects as a **non-owner role**; `FORCE ROW LEVEL
   SECURITY` on every table (owner and superuser silently bypass RLS
   otherwise).
3. **Composite indexes lead with `tenant_id`** — the #1 performance factor
   (~0.3 ms policy overhead at 50M rows/10k tenants when indexed).
4. Any function used in a policy must be `LEAKPROOF`-safe or wrapped in an
   initplan `(select ...)` so it evaluates once per query, not per row.
5. Policies stay **single-GUC-equality simple**. Complex authorization
   logic lives in the permission service, not in RLS — documented failure
   stories involve complex policies, not this shape.
6. RLS does **not** cover materialized views, `COPY` exports, logical
   replication consumers, or maintenance jobs — every such path implements
   explicit tenant scoping and carries a tenant-isolation test
   (`TESTING.md`).

RLS policies are **schema-as-code** in Drizzle (`pgPolicy`), reviewed like
any code, and covered by integration tests against real Postgres
(Testcontainers) that assert both isolation (tenant A cannot read B) and
bypass-resistance (query without GUC returns zero rows).

## 3. Background work and AI workers

Trigger.dev tasks receive `tenant_id` in their payload and open
transactions with the same `SET LOCAL` discipline via a shared `db`
helper — there is one blessed way to get a tenant-scoped connection and it
is the only exported way. Agent principals additionally pass through the
permission service with their scoped grants; retrieval queries carry the
tenant GUC *and* permission filters (see `ai-system.md` §4).

## 4. Known limits & scale exits

| Trigger | Exit | Why it stays open |
|---|---|---|
| Whale tenant dominates a table's working set | Partial indexes; table partitioning by `tenant_id` hash | tenant_id on every row |
| Write volume beyond one primary | Citus (distributes by `tenant_id`; documented at millions of tenants) or PlanetScale Postgres | same |
| Enterprise isolation/residency demands | Bridge to **silo databases** for that tier: control-plane catalog maps tenant → connection string; Neon database-per-tenant economics documented | one write path per operation makes routing a connection concern |
| Vectors ≥ ~10M or hybrid-search hardening | Turbopuffer namespace-per-tenant (ADR-0010) | embeddings already in separate per-domain tables |

Honesty note carried from research: there is no named public case study of
RLS specifically at 100k+ tenants; shared-schema + `tenant_id` scaling is
proven (it's just rows), and the counter-position (PlanetScale's
"app-layer scoping only") is answered by keeping policies trivial and
treating RLS as backstop, not authorization.

## 5. Tenant lifecycle

- **Provisioning:** row inserts only (org, workspace, memberships) — no
  DDL per tenant; sub-second, transactional.
- **Deletion/export:** GDPR-grade export and hard-delete jobs are built in
  M1 as operations, not afterthoughts; both are explicit-scoping paths
  with isolation tests.
- **Backups:** point-in-time for the pool; per-tenant restore = PITR clone
  + scoped extract (documented runbook before GA; enterprise tier gets
  per-tenant backup via silo exit).
