# ADR-0011: Identity-layer tables are global, not tenant-RLS-scoped

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** security, data

## Problem

`docs/architecture/multi-tenancy.md` originally stated "every table
carries `tenant_id` — no exceptions." Implementing auth (ADR-0008) breaks
that absolute: a user spans organizations (multi-org membership is a core
product behavior), and better-auth reads/writes the identity tables during
request authentication — _before_ any tenant context exists, outside
`withTenant`. An RLS policy keyed on the tenant GUC would return zero rows
for every login. The invariant needs a documented amendment, not a silent
carve-out.

## Alternatives considered

### Option A — Identity tables are global; isolation is semantic; tenant-scoped edges carry tenant_id

- `users`, `sessions`, `accounts`, `verifications`, `organizations`,
  `members`, `invitations`, `two_factors` are global. Rows are reachable
  only via session tokens and user ids (better-auth's own access paths);
  the app role has table grants but no DDL.
- Everything tenant-scoped stays under RLS: `workspaces` and
  `workspace_members` (the user↔tenant-data edge) carry `tenant_id` with
  the canonical policy.
- Weakness: cross-tenant reads of auth rows are prevented by application
  logic, not the database backstop.

### Option B — Users duplicated per tenant (user rows carry tenant_id)

- Restores the absolute invariant. But it breaks multi-org membership
  (one human = N accounts), doubles every credential/MFA enrolment, and
  makes invitations of existing users incoherent. Product-breaking.

### Option C — RLS on auth tables keyed to session context

- Would require a per-request "current user/session" GUC and rewriting
  better-auth's adapter access paths; the auth bootstrap (finding the
  session from a cookie) inherently precedes any such context. Circular.

### Option D — Separate auth database

- Stronger blast-radius isolation, but a second failure domain, no
  cross-DB FKs (workspace_members.user_id), and it contradicts
  ARCHITECTURE.md principle 1 (one Postgres competence) for no attack the
  simpler model doesn't already handle.

## Research

Better-auth adapter behavior and schema from `@better-auth/cli generate`
(1.6.23, run 2026-07-07); pattern precedent: every multi-org SaaS with
pooled tenancy (including the AWS SaaS Lens pool-model guidance) treats
identity as a global plane with org membership as the scoping edge.

## Decision

Identity-layer tables are global. The tenancy invariant is amended to:
**every table carrying tenant data has `tenant_id` + RLS; identity tables
are the documented exception**, with these compensating controls:

1. No tenant domain data may ever be added to identity tables.
2. `workspace_members` (the principal↔tenant edge) is tenant-scoped and
   RLS-protected; org-scoped auth rows (`members`, `invitations`) are
   keyed by `organizationId`, which _is_ the tenant id.
3. The app role's grants on identity tables are DML-only; append-only and
   read-only postures elsewhere are unaffected.
4. Organization creation provisions the tenant row atomically via the
   `provision_tenant()` SECURITY DEFINER function — the app role has no
   INSERT on `tenants`.

## Why this option

1. It reflects reality: identity is a global plane in every pooled-tenancy
   architecture; pretending otherwise (Option B) breaks the product.
2. The database backstop still guards what it exists to guard — tenant
   _data_. Session-token-keyed access is the industry-standard control for
   the identity plane.
3. Zero vendor-adapter surgery; better-auth stays upgradeable.

## Trade-offs accepted

- A SQL-injection-class bug in an identity query could theoretically reach
  other users' auth rows without an RLS net (mitigated: all access goes
  through better-auth + Drizzle parameterized queries; no hand-written SQL
  touches these tables).
- Auditors will ask about the exception; this ADR is the answer.

## Future impact

- Easier: multi-org membership, invitations, SSO later (IdP users are
  global by nature), agent principals (also global, org-scoped by grants).
- Harder: any future "hide that a user exists at all across tenants"
  requirement would need application-level filtering.
- Revisit: if enterprise silo tenancy (ADR-0006 bridge) arrives, decide
  whether silo tenants get identity replicas or keep the shared plane;
  if better-auth ever supports pluggable row filters, reassess Option C.
