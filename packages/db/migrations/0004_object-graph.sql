CREATE TABLE "attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb,
	"system" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attribute_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "object_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "object_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "record_values" (
	"tenant_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"value_text" text,
	"value_number" numeric(20, 6),
	"value_boolean" boolean,
	"value_date" date,
	"value_timestamp" timestamp with time zone,
	"value_uuid" uuid,
	"value_jsonb" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_values_record_id_attribute_id_pk" PRIMARY KEY("record_id","attribute_id")
);
--> statement-breakpoint
ALTER TABLE "record_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"created_by_kind" text NOT NULL,
	"created_by_id" uuid,
	"updated_by_kind" text NOT NULL,
	"updated_by_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_object_id_object_definitions_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."object_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_definitions" ADD CONSTRAINT "object_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_values" ADD CONSTRAINT "record_values_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_values" ADD CONSTRAINT "record_values_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_values" ADD CONSTRAINT "record_values_attribute_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_object_id_object_definitions_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."object_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_definitions_object_key_uidx" ON "attribute_definitions" USING btree ("object_id","key");--> statement-breakpoint
CREATE INDEX "attribute_definitions_tenant_object_idx" ON "attribute_definitions" USING btree ("tenant_id","object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "object_definitions_tenant_key_uidx" ON "object_definitions" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "record_values_text_idx" ON "record_values" USING btree ("tenant_id","attribute_id","value_text");--> statement-breakpoint
CREATE INDEX "record_values_number_idx" ON "record_values" USING btree ("tenant_id","attribute_id","value_number");--> statement-breakpoint
CREATE INDEX "record_values_timestamp_idx" ON "record_values" USING btree ("tenant_id","attribute_id","value_timestamp");--> statement-breakpoint
CREATE INDEX "record_values_uuid_idx" ON "record_values" USING btree ("tenant_id","attribute_id","value_uuid");--> statement-breakpoint
CREATE INDEX "records_tenant_object_created_idx" ON "records" USING btree ("tenant_id","object_id","id");--> statement-breakpoint
CREATE POLICY "attribute_definitions_tenant_isolation" ON "attribute_definitions" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("attribute_definitions"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("attribute_definitions"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "object_definitions_tenant_isolation" ON "object_definitions" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("object_definitions"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("object_definitions"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "record_values_tenant_isolation" ON "record_values" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("record_values"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("record_values"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "records_tenant_isolation" ON "records" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("records"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("records"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));