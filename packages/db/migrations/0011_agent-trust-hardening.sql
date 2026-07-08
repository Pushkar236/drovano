-- Agent-trust hardening (TASK-0037) — companion to 0010.
-- All four tables are ordinary tenant-scoped domain data: full DML under
-- RLS, forced so even the table owner path cannot bypass the policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  agents, agent_grants, ai_runs, proposals
TO drovano_app;
--> statement-breakpoint
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agent_grants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_runs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE proposals FORCE ROW LEVEL SECURITY;
