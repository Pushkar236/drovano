/**
 * Hybrid search (ai-system.md §4): BM25 (expression-indexed tsvector)
 * and dense (halfvec cosine) candidate pools fused with reciprocal
 * rank fusion, then passed through the rerank seam. Every query runs
 * under the caller's tenant GUC AND permission gate — an agent can
 * never retrieve what its grantor couldn't read: the principal must
 * hold record.view, and chunks anchored to soft-deleted records are
 * excluded.
 */
import { chunks, records, type ChunkSourceType, type TenantTransaction } from '@drovano/db';
import { can, type PrincipalContext } from '@drovano/permissions';
import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';

import type { Embedder } from './embedder.js';
import { RetrievalError } from './errors.js';
import { passthroughReranker, type Reranker } from './rerank.js';

export interface SearchInput {
  tenantId: string;
  /** Whoever is asking — human or agent — evaluated through can(). */
  principal: PrincipalContext;
  query: string;
  /** Results returned after fusion + rerank (default 8). */
  limit?: number | undefined;
  /** Candidate pool per retrieval mode before fusion (default 50). */
  candidates?: number | undefined;
  sourceTypes?: ChunkSourceType[] | undefined;
  /** Enables the dense side; absent → BM25-only (no-key posture). */
  embedder?: Embedder | undefined;
  reranker?: Reranker | undefined;
}

export interface SearchHit {
  chunkId: string;
  sourceType: ChunkSourceType;
  sourceId: string;
  recordId: string | null;
  seq: number;
  content: string;
  context: string | null;
  /** Fused relevance score (RRF; higher is better). */
  score: number;
}

const RRF_K = 60;

interface CandidateRow {
  chunkId: string;
  sourceType: ChunkSourceType;
  sourceId: string;
  recordId: string | null;
  seq: number;
  content: string;
  context: string | null;
}

export async function searchChunks(
  tx: TenantTransaction,
  input: SearchInput,
): Promise<SearchHit[]> {
  const decision = can(input.principal, { type: 'record.view' });
  if (!decision.allowed) {
    throw new RetrievalError('not-permitted', decision.reason);
  }
  const query = input.query.trim();
  if (query.length === 0) {
    throw new RetrievalError('invalid-input', 'Search query must not be empty.');
  }
  const limit = input.limit ?? 8;
  const candidates = input.candidates ?? 50;

  const selection = {
    chunkId: chunks.id,
    sourceType: chunks.sourceType,
    sourceId: chunks.sourceId,
    recordId: chunks.recordId,
    seq: chunks.seq,
    content: chunks.content,
    context: chunks.context,
  };
  // Chunks anchored to a record are visible only while it is; RLS has
  // already scoped everything to the tenant.
  const visibility = or(isNull(chunks.recordId), isNull(records.deletedAt));
  const sourceFilter =
    input.sourceTypes === undefined || input.sourceTypes.length === 0
      ? undefined
      : inArray(chunks.sourceType, input.sourceTypes);

  const tsv = sql`to_tsvector('english', coalesce(${chunks.context}, '') || ' ' || ${chunks.content})`;
  const tsquery = sql`websearch_to_tsquery('english', ${query})`;
  const lexical: CandidateRow[] = await tx
    .select(selection)
    .from(chunks)
    .leftJoin(records, eq(chunks.recordId, records.id))
    .where(and(sql`${tsv} @@ ${tsquery}`, visibility, sourceFilter))
    .orderBy(desc(sql`ts_rank_cd(${tsv}, ${tsquery})`))
    .limit(candidates);

  let dense: CandidateRow[] = [];
  if (input.embedder !== undefined) {
    const [queryVector] = await input.embedder.embed([query]);
    if (queryVector !== undefined) {
      const distance = cosineDistance(chunks.embedding, queryVector);
      dense = await tx
        .select(selection)
        .from(chunks)
        .leftJoin(records, eq(chunks.recordId, records.id))
        .where(and(isNotNull(chunks.embedding), visibility, sourceFilter))
        .orderBy(asc(distance))
        .limit(candidates);
    }
  }

  // Reciprocal rank fusion across the two pools.
  const fused = new Map<string, { row: CandidateRow; score: number }>();
  for (const pool of [lexical, dense]) {
    pool.forEach((row, rank) => {
      const entry = fused.get(row.chunkId) ?? { row, score: 0 };
      entry.score += 1 / (RRF_K + rank + 1);
      fused.set(row.chunkId, entry);
    });
  }
  const ranked = [...fused.values()].sort((a, b) => b.score - a.score);

  const reranker = input.reranker ?? passthroughReranker;
  const order = await reranker.rerank(
    query,
    ranked.map((entry) => ({ content: entry.row.content, context: entry.row.context })),
  );

  return order
    .slice(0, limit)
    .map((index) => ranked[index])
    .filter((entry): entry is { row: CandidateRow; score: number } => entry !== undefined)
    .map((entry) => ({ ...entry.row, score: entry.score }));
}
