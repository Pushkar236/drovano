# @drovano/identity

Identity module: the better-auth instance (email/password with argon2id,
TOTP MFA, organizations + invitations), tenant provisioning, and the
outbound-mail boundary. Governing decisions:
[ADR-0008](../../../docs/decisions/adr-0008-authentication.md) (auth
vendor and posture), [ADR-0011](../../../docs/decisions/adr-0011-identity-tables-global.md)
(identity tables are global, not RLS-scoped).

## Public interface

- `createAuth(options)` — constructs the better-auth instance over a
  `Database` handle. Mounted over HTTP by `apps/api`; server-side flows
  available via `auth.api.*`.
- `createDevMailer(write)` / `Mailer` — the mail boundary; production
  wires a real provider (pending vendor decision).
- `hashPassword` / `verifyPassword` — argon2id (OWASP baseline).
- `provisionTenant(db, input)` — idempotent tenant provisioning via the
  `provision_tenant()` SECURITY DEFINER function.

## Invariants

1. **Organization id = tenant id.** Every organization created through
   better-auth is provisioned as a tenant (same uuid) with a default
   "General" workspace and an audit entry, via the
   `afterCreateOrganization` hook. Nothing else creates tenants.
2. Auth tables live in `@drovano/db` (`src/schema/auth.ts`) and are
   global — see ADR-0011. Workspaces are tenant-scoped domain tables, not
   the vendor's "teams" feature.
3. Passwords are argon2id, never the library default (scrypt).
4. better-auth is pinned (catalog); upgrades re-run
   `@better-auth/cli generate` and diff against `schema/auth.ts`.
