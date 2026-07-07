# @drovano/api

The Drovano API: a single deployable Hono modular monolith (ADR-0004).
`src/app.ts` is a pure function of its dependencies (modules); `src/main.ts`
is the only file that reads the environment.

## Currently mounted

- `GET /healthz` — liveness.
- `/api/auth/*` — better-auth (identity module, ADR-0008): sign-up/in/out,
  email verification, password reset, organizations, invitations, TOTP MFA.

Domain module routers (tRPC + public REST, ADR-0005) mount here as they
land in M2+.

## Running locally

Requires `DATABASE_URL`, `AUTH_SECRET` (≥32 chars), `BASE_URL`; optional
`PORT` (default 3000). `pnpm dev` from this directory. Email flows print
to stdout via the dev mailer until an email provider is provisioned.
