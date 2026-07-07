-- Tenancy hardening (docs/architecture/multi-tenancy.md §2).
-- Companion to 0000 (which creates the drovano_app role before its
-- policies): least-privilege grants and FORCE ROW LEVEL SECURITY —
-- everything drizzle-kit cannot express.

GRANT USAGE ON SCHEMA public TO drovano_app;
--> statement-breakpoint
-- Least privilege, granted explicitly per table (no blanket default
-- privileges): tenants is read-only for the app (provisioning is a
-- system-role operation); audit_log is append-only by construction.
GRANT SELECT ON TABLE tenants TO drovano_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE audit_log TO drovano_app;
--> statement-breakpoint
-- FORCE binds even the table owner to RLS, so an owner-credential mistake
-- in application code fails closed instead of leaking across tenants.
-- (Superusers/BYPASSRLS still bypass — which is why provisioning paths
-- carry their own isolation tests.)
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Drizzle's text enum is type-level only; enforce the actor taxonomy in
-- the database as well (SECURITY.md: the database is the backstop).
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_actor_kind_check
  CHECK (actor_kind IN ('human', 'agent', 'integration', 'system'));
