-- The application role must exist before any policy references it.
-- Non-owner, no DDL, NOLOGIN: each environment grants it to a login role
-- (packages/db/README.md "Roles in production"). Grants and FORCE RLS
-- live in migration 0001.
DO $$
BEGIN
  CREATE ROLE drovano_app NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- idempotent across environments
END
$$;
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_tenant_created_idx" ON "audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE POLICY "audit_log_tenant_isolation" ON "audit_log" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("audit_log"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("audit_log"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "tenants_tenant_isolation" ON "tenants" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("tenants"."id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("tenants"."id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));