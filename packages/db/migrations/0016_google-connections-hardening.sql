-- Google-connections hardening (TASK-0032) - companion to 0015.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE google_connections TO drovano_app;
--> statement-breakpoint
ALTER TABLE google_connections FORCE ROW LEVEL SECURITY;