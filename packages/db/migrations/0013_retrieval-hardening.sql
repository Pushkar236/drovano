-- Retrieval hardening (TASK-0035) — companion to 0012.
-- chunks is ordinary tenant-scoped domain data: full DML under RLS,
-- forced so even the table-owner path cannot bypass the policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE chunks TO drovano_app;
--> statement-breakpoint
ALTER TABLE chunks FORCE ROW LEVEL SECURITY;
