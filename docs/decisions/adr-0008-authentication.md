# ADR-0008: Authentication — better-auth self-hosted; WorkOS as enterprise fallback

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** security, backend

## Problem

Choose the identity foundation for a product whose core domain model _is_
organizations, workspaces, memberships, and (uniquely) **agent
principals**. Forces: 100k+ organizations makes per-org vendor pricing an
existential cost axis; SECURITY.md requires argon2id, MFA, and an
SSO/SCIM path without ransom-tier gating (PRD §6); users/orgs must live
in our schema for RLS, audit, and the permission service to treat auth
data as domain data.

## Alternatives considered

### Option A — better-auth 1.6.x self-hosted on our Postgres, organization plugin from day one; WorkOS SSO/SCIM per-connection as enterprise fallback

- Users, orgs, sessions in **our schema** — auth data is domain data;
  agent principals extend the same tables; audit is first-class.
- Mature organization plugin (orgs, teams, invitations, custom + dynamic
  per-org roles); SSO plugin covers OIDC/OAuth2/SAML 2.0; SCIM 2.0
  server plugin now exists.
- $0 marginal cost at 100k+ orgs.
- Auth.js is now part of Better Auth (Sept 2025 maintainer transition) —
  it _is_ the TS-ecosystem default successor.
- Weaknesses: seed-stage vendor ($5M, Jun 2025); SAML/SCIM plugins young
  and enterprise-unproven.
- Evidence: research §5 (verified 2026-07-06: better-auth 1.6.23; the
  "WorkOS acquired Auth.js" claim is refuted — the real event was the
  Better Auth transition).

### Option B — Clerk

- Fastest time-to-auth; polished components; well-funded ($50M Series C).
- **Disqualified by the org meter:** $1/org/mo past 100 MAOs ($0.60 above
  100k) ≈ **$60–100k/mo at our target scale** — pricing that punishes
  exactly our success metric. Users also live in their cloud, outside
  RLS/audit.

### Option C — WorkOS AuthKit as primary

- Free to 1M MAU; clean enterprise machinery.
- But core auth still lives outside our schema, and SSO+SCIM at
  $125/connection/mo each becomes a tax on every enterprise deal rather
  than a fallback for early ones.

### Option D — Keycloak self-hosted

- Full IdP, no per-unit costs, battle-tested SAML.
- Wrong for a lean TS startup: Java operational burden + fast release
  train; an infrastructure project we'd staff instead of product.

## Research

`docs/research/technology-stack-2026.md` §5, with pricing verified
against official pages 2026-07-06 (Clerk, WorkOS `/pricing.md`).

## Decision

better-auth, self-hosted on our Postgres, with the organization plugin
from day one; argon2id + httpOnly SameSite session cookies + TOTP MFA per
SECURITY.md; SAML via the better-auth SSO plugin validated against real
Okta/Entra dev tenants **before** the first SSO deal; WorkOS SSO/SCIM at
$125/connection as the proven fallback, priced into the enterprise tier,
if the plugin proves too green.

## Why this option

1. Orgs/workspaces/principals are Drovano's core domain — outsourcing
   their storage would put our own data model behind someone's API and
   break the RLS/audit posture.
2. Unit economics: $0 vs ~$60–100k/mo at target scale is not a
   nuance.
3. Agent principals (law 2) need first-class residence in the identity
   tables; no vendor models non-human org members the way we need.
4. The fallback is genuinely proven (WorkOS is the industry's enterprise
   SSO bolt-on), so the young-vendor risk has a bounded blast radius —
   exactly one plugin's surface.

## Trade-offs accepted

- We own auth operations: token rotation, session security, upgrade
  cadence (mitigated: SECURITY.md controls, Renovate, pinned versions,
  auth paths in the integration-test suite with real IdP dev tenants).
- Seed-stage dependency for the security-critical path (mitigated:
  self-hosted — no service to disappear; schema is ours; migration to
  another library is data-preserving).
- No polished pre-built UI (fine — Strata owns every surface anyway).

## Future impact

- Easier: agent identity, audit-everything, per-workspace permissioning,
  enterprise pricing without SSO ransom.
- Harder: enterprise SSO edge cases land on us first (the WorkOS hatch
  bounds this).
- Revisit: before the first enterprise SSO/SCIM contract (go/no-go on
  the plugin vs WorkOS per the Okta/Entra validation); better-auth 2.x
  or Infrastructure-product pricing changes; any security advisory
  affecting the library (pinned + Renovate gives us the window).
