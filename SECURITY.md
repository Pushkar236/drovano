# Drovano Security Standards

Drovano will hold businesses' customer data, communications, documents, and
AI-generated work product. We build for an enterprise security posture from
day one, because security is architecture — it cannot be retrofitted.

## Threat model summary

Primary assets: tenant business data (contacts, deals, documents, messages),
credentials/tokens, AI prompts and outputs derived from tenant data.
Primary adversaries: external attackers (credential stuffing, injection,
scraping), malicious or compromised tenant users (cross-tenant access,
privilege escalation), malicious inputs to AI features (prompt injection,
data exfiltration via tool use), supply-chain compromise.

## Non-negotiable principles

1. **Tenant isolation is enforced in the database**, not only in application
   code. Every tenant-owned table carries the tenant key; Postgres Row-Level
   Security policies are the backstop for every access path (API, jobs,
   AI retrieval, analytics). Application-layer scoping is defense in depth
   on top, never the sole barrier.
2. **Least privilege everywhere.** Role-based access with the minimum default
   grants; service credentials scoped per service; no shared admin accounts;
   production access is audited and time-bound.
3. **Secure defaults.** New resources are private to their workspace. New
   API tokens get minimal scopes. New integrations request minimal OAuth
   scopes.
4. **All input is hostile** until validated. Every external boundary (HTTP,
   webhooks, file uploads, AI tool arguments, imported data) validates with
   schema-based validation (Zod) — types, ranges, sizes, formats — before any
   logic runs. Output encoding by default; no string-built SQL or HTML.
5. **Authentication:** modern session management with rotation, secure
   httpOnly SameSite cookies for the web app; short-lived tokens for the API;
   MFA support; SSO (OIDC/SAML) on the enterprise path; SCIM for
   provisioning later. Passwords hashed with a modern memory-hard algorithm
   (argon2id).
6. **Authorization is centralized.** One permission service answers every
   "may X do Y on Z" question; endpoints and tools declare required
   permissions; the deny path is tested (see TESTING.md). No ad-hoc
   permission checks scattered in handlers.
7. **Audit logging.** Security-relevant events (auth events, permission
   changes, data export, admin actions, AI actions on data, token
   creation/revocation) are written to an append-only audit log with actor,
   subject, tenant, timestamp, and origin. Audit logs are queryable per
   tenant (enterprise feature) and immutable to tenants.
8. **Secrets management.** No secrets in the repository, ever — enforced by
   pre-commit scanning (gitleaks) and CI. Secrets live in the platform's
   secret store per environment; rotation is documented per secret.
   Tenant-supplied credentials (integration tokens) are encrypted at rest
   with envelope encryption, keys separated from data.
9. **Encryption.** TLS 1.2+ everywhere in transit; encryption at rest for
   database, backups, and object storage; field-level encryption for
   high-sensitivity values (integration credentials, API keys).
10. **AI-specific security.** Model calls receive only the data the
    requesting user is permitted to read (retrieval runs under the user's
    permission context). Tool-using agents operate under an explicit,
    least-privilege tool allowlist per agent; destructive tools require
    confirmation policies. Prompt-injection defenses: instruction/data
    separation, output validation before tool execution, and audit of every
    agent action. Tenant data is never used to train shared models.

## Practices

- **OWASP ASVS** is the checklist baseline for every feature review;
  OWASP Top 10 (web) and OWASP LLM Top 10 (AI features) inform threat
  review per PR.
- **Dependency hygiene:** automated vulnerability scanning and update PRs
  (Renovate) with lockfile pinning; new dependencies reviewed per
  CONTRIBUTING.md.
- **Security headers:** strict CSP, HSTS, frame-ancestors, nosniff — verified
  by automated checks.
- **Rate limiting & abuse controls** on auth endpoints, public API, and
  AI endpoints (which also carry cost controls).
- **Backups & recovery:** automated encrypted backups, restore drills, RPO
  ≤ 24h / RTO ≤ 4h initially, tightening with scale.
- **Incident response:** SEV levels, on-call ownership, and a written
  runbook are defined before first production traffic (see ROADMAP.md M4).

## Reporting a vulnerability

Until a public program exists: report privately to the maintainers via the
repository owner. Do not open public issues for vulnerabilities. We commit
to acknowledging reports within 72 hours.
