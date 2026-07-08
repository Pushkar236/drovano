# @drovano/platform

Platform surface (TASK-0029): API keys that authenticate the public REST
API, webhook subscriptions, and the v1 webhook dispatcher.

- **API keys** — secrets are `drv_<48 hex>`, shown once at creation; only
  the sha256 hash is stored. The `api_keys` table is GLOBAL (the ADR-0011
  exception): bearer lookup runs before the tenant is known, so every
  read path here filters by `tenant_id` explicitly instead of relying on
  RLS. `api.manage` (owner/admin) gates every management operation at the
  router layer.
- **Webhooks** — tenant-scoped RLS-normal subscriptions. Deliveries are
  signed with HMAC-SHA256 of the raw body in `X-Drovano-Signature`
  (`sha256=<hex>`); the `whsec_` signing secret is shown once.
- **Dispatcher** — fire-and-forget in v1: one POST per active matching
  subscription, per-delivery timeout, **no retries and no delivery log**.
  A durable queue replaces this when automations land (M3).

Services follow the house shape: they take a `TenantTransaction` from
`withTenant` and write transactional audit entries (`api-key.create`,
`api-key.revoke`, `webhook.create`, `webhook.remove`). The one deliberate
exception is `findApiKeyBySecret(db, secret)`, which takes a plain
database handle — it IS the tenant-discovery step.
