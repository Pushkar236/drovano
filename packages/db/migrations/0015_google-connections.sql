CREATE TABLE "google_connections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"gmail_history_id" text,
	"calendar_sync_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_connections_tenant_email_uidx" ON "google_connections" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "google_connections_tenant_idx" ON "google_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "google_connections_tenant_isolation" ON "google_connections" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("google_connections"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("google_connections"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));