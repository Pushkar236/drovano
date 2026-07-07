CREATE TABLE "list_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "list_entry_values" (
	"tenant_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"value_text" text,
	"value_number" numeric(20, 6),
	"value_boolean" boolean,
	"value_date" date,
	"value_timestamp" timestamp with time zone,
	"value_uuid" uuid,
	"value_jsonb" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_entry_values_entry_id_attribute_id_pk" PRIMARY KEY("entry_id","attribute_id")
);
--> statement-breakpoint
ALTER TABLE "list_entry_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"object_id" uuid,
	"list_id" uuid,
	"name" text NOT NULL,
	"type" text DEFAULT 'table' NOT NULL,
	"config" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "attribute_definitions_object_key_uidx";--> statement-breakpoint
ALTER TABLE "attribute_definitions" ALTER COLUMN "object_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD COLUMN "list_id" uuid;--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entry_values" ADD CONSTRAINT "list_entry_values_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entry_values" ADD CONSTRAINT "list_entry_values_entry_id_list_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."list_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_object_id_object_definitions_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."object_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_object_id_object_definitions_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."object_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_entries_list_record_uidx" ON "list_entries" USING btree ("list_id","record_id");--> statement-breakpoint
CREATE INDEX "list_entries_tenant_list_idx" ON "list_entries" USING btree ("tenant_id","list_id","id");--> statement-breakpoint
CREATE INDEX "list_entry_values_text_idx" ON "list_entry_values" USING btree ("tenant_id","attribute_id","value_text");--> statement-breakpoint
CREATE INDEX "lists_tenant_object_idx" ON "lists" USING btree ("tenant_id","object_id");--> statement-breakpoint
CREATE INDEX "saved_views_tenant_object_idx" ON "saved_views" USING btree ("tenant_id","object_id");--> statement-breakpoint
CREATE INDEX "saved_views_tenant_list_idx" ON "saved_views" USING btree ("tenant_id","list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_definitions_list_key_uidx" ON "attribute_definitions" USING btree ("list_id","key") WHERE "attribute_definitions"."list_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_definitions_object_key_uidx" ON "attribute_definitions" USING btree ("object_id","key") WHERE "attribute_definitions"."object_id" is not null;--> statement-breakpoint
CREATE POLICY "list_entries_tenant_isolation" ON "list_entries" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("list_entries"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("list_entries"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "list_entry_values_tenant_isolation" ON "list_entry_values" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("list_entry_values"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("list_entry_values"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "lists_tenant_isolation" ON "lists" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("lists"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("lists"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "saved_views_tenant_isolation" ON "saved_views" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("saved_views"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("saved_views"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));