-- Object-graph hardening — companion to 0004 (multi-tenancy.md §2 rules).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  object_definitions, attribute_definitions, records, record_values
TO drovano_app;
--> statement-breakpoint
ALTER TABLE object_definitions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attribute_definitions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE records FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE record_values FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The typed-EAV contract at the database layer: exactly one value column
-- populated per row (the crm module also enforces this in code; the
-- database is the backstop — SECURITY.md).
ALTER TABLE record_values
  ADD CONSTRAINT record_values_single_kind_check
  CHECK (
    (
      (value_text IS NOT NULL)::int +
      (value_number IS NOT NULL)::int +
      (value_boolean IS NOT NULL)::int +
      (value_date IS NOT NULL)::int +
      (value_timestamp IS NOT NULL)::int +
      (value_uuid IS NOT NULL)::int +
      (value_jsonb IS NOT NULL)::int
    ) = 1
  );
