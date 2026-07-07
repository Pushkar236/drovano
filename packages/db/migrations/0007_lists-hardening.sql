-- Lists hardening — companion to 0006 (multi-tenancy.md §2 rules).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  lists, list_entries, list_entry_values, saved_views
TO drovano_app;
--> statement-breakpoint
ALTER TABLE lists FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE list_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE list_entry_values FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE saved_views FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Attribute scope: exactly one of object_id / list_id (data-model.md §2 —
-- attributes are defined on an object OR on a list).
ALTER TABLE attribute_definitions
  ADD CONSTRAINT attribute_definitions_scope_check
  CHECK ((object_id IS NOT NULL)::int + (list_id IS NOT NULL)::int = 1);
--> statement-breakpoint
-- FK for list-scoped attributes (drizzle-level reference would be circular).
ALTER TABLE attribute_definitions
  ADD CONSTRAINT attribute_definitions_list_id_fk
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE;
--> statement-breakpoint
-- Entry values must point at real attribute definitions.
ALTER TABLE list_entry_values
  ADD CONSTRAINT list_entry_values_attribute_fk
  FOREIGN KEY (attribute_id) REFERENCES attribute_definitions(id) ON DELETE CASCADE;
--> statement-breakpoint
-- Same single-kind discipline as record_values.
ALTER TABLE list_entry_values
  ADD CONSTRAINT list_entry_values_single_kind_check
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
--> statement-breakpoint
-- Saved views target exactly one of an object or a list.
ALTER TABLE saved_views
  ADD CONSTRAINT saved_views_scope_check
  CHECK ((object_id IS NOT NULL)::int + (list_id IS NOT NULL)::int = 1);
