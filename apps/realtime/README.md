# @drovano/realtime

The realtime gateway (ADR-0003; `docs/architecture/system-overview.md`):
deliberately thin. Session-authenticated WebSockets receive coarse
per-tenant invalidation events fanned out from Redis pub/sub; clients
refetch through the authorized API. The upgrade path is CDC → ElectricSQL
shapes — same bet, adopted incrementally.

## Security model

- The **server** decides the tenant: a connection's session cookie is
  validated with better-auth and its _active organization_ selects the
  channel. Clients never name a channel — nothing to spoof.
- Events carry no data (`{ resource: 'workspaces' }` only); reads always
  go back through the permission-checked API.
- No session or no active organization → the upgrade is refused (401).

## Running

Env: `DATABASE_URL` (app role — session lookups only), `AUTH_SECRET`,
`BASE_URL`, `REDIS_URL`, `PORT` (default 3001). `pnpm dev` locally; the
web app's Vite proxy forwards `/realtime` here. The API publishes when
its own `REDIS_URL` is set (no Redis → both sides no-op cleanly).

Tests run the full loop against real Postgres + Redis containers:
authenticated connect, tenant-scoped delivery, cross-tenant silence,
malformed-payload resilience, cleanup on disconnect.
