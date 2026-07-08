-- Embedding dimensions 1536 → 384 (ADR-0015: local bge-small-en-v1.5).
-- No embeddings exist yet anywhere (column shipped nullable and unused),
-- so drop/re-add is safe and avoids a halfvec cross-dimension cast.
DROP INDEX "chunks_embedding_idx";--> statement-breakpoint
ALTER TABLE "chunks" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "embedding" halfvec(384);--> statement-breakpoint
CREATE INDEX "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" halfvec_cosine_ops);
