/**
 * Retrieval substrate (TASK-0035, ai-system.md §4): one tenant-scoped
 * `chunks` table backing hybrid search — BM25 via an expression GIN
 * tsvector index, dense via pgvector halfvec + HNSW (iterative-scan
 * friendly). `record_id` is the permission anchor: a chunk is
 * retrievable only when its record is (RLS scopes the tenant; the
 * search service filters soft-deleted records and runs the caller
 * through can()).
 *
 * Embeddings are nullable — the zero-cost posture indexes BM25-only
 * until an OpenAI key enables dense (ADR-0010); halfvec(1536) matches
 * text-embedding-3-small.
 */
import { sql } from 'drizzle-orm';
import {
  halfvec,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { appRole, currentTenantId, tenants } from './core.js';
import { records } from './graph.js';

/** Domains that feed the index (each arrives with its module). */
export const chunkSourceTypes = ['email', 'note', 'transcript', 'document'] as const;
export type ChunkSourceType = (typeof chunkSourceTypes)[number];

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    sourceType: text('source_type', { enum: chunkSourceTypes }).notNull(),
    /** Id in the source domain's table (no FK — those modules own it). */
    sourceId: uuid('source_id').notNull(),
    /** Permission anchor: visible iff this record is viewable. */
    recordId: uuid('record_id').references(() => records.id),
    /** Position within the source document (0-based). */
    seq: integer('seq').notNull(),
    content: text('content').notNull(),
    /** Contextual-retrieval situating sentence (LLM-generated, optional). */
    context: text('context'),
    embedding: halfvec('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('chunks_source_seq_uidx').on(table.sourceType, table.sourceId, table.seq),
    index('chunks_tenant_source_idx').on(table.tenantId, table.sourceType, table.sourceId),
    // BM25 side of hybrid search; queries repeat this exact expression.
    index('chunks_tsv_idx').using(
      'gin',
      sql`to_tsvector('english', coalesce(${table.context}, '') || ' ' || ${table.content})`,
    ),
    // Dense side: cosine over half-precision vectors (ai-system.md §4).
    index('chunks_embedding_idx').using('hnsw', table.embedding.op('halfvec_cosine_ops')),
    pgPolicy('chunks_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);
