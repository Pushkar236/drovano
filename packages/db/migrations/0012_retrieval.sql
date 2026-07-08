CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"record_id" uuid,
	"seq" integer NOT NULL,
	"content" text NOT NULL,
	"context" text,
	"embedding" halfvec(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_source_seq_uidx" ON "chunks" USING btree ("source_type","source_id","seq");--> statement-breakpoint
CREATE INDEX "chunks_tenant_source_idx" ON "chunks" USING btree ("tenant_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "chunks_tsv_idx" ON "chunks" USING gin (to_tsvector('english', coalesce("context", '') || ' ' || "content"));--> statement-breakpoint
CREATE INDEX "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" halfvec_cosine_ops);--> statement-breakpoint
CREATE POLICY "chunks_tenant_isolation" ON "chunks" AS PERMISSIVE FOR ALL TO "drovano_app" USING ("chunks"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid)) WITH CHECK ("chunks"."tenant_id" = (select nullif(current_setting('app.current_tenant_id', true), '')::uuid));