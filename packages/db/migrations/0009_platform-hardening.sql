-- Platform-surface hardening (TASK-0029) — companion to 0008.

-- api_keys is GLOBAL (the ADR-0011 exception, same reasoning as the auth
-- tables): a bearer-key lookup runs under the app role BEFORE the tenant
-- is known (hash → row → tenant_id). Full DML, no RLS — every read path
-- scopes by the found row's tenant_id immediately, and only the sha256
-- hash of the secret is ever stored.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE api_keys TO drovano_app;
--> statement-breakpoint
-- webhooks is ordinary tenant-scoped domain data: full DML under RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE webhooks TO drovano_app;
--> statement-breakpoint
ALTER TABLE webhooks FORCE ROW LEVEL SECURITY;
