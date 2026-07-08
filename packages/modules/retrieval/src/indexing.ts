/**
 * Indexing (TASK-0035): source text → chunks (+ optional contextual
 * situating sentence, + optional embeddings) → the `chunks` table.
 * Re-indexing a source replaces its chunks atomically within the
 * caller's transaction.
 */
import { chunks, type ChunkSourceType, type TenantTransaction } from '@drovano/db';
import { and, eq } from 'drizzle-orm';

import { chunkText, type ChunkingOptions } from './chunking.js';
import type { Embedder } from './embedder.js';
import { RetrievalError } from './errors.js';

/**
 * Contextual retrieval (ai-system.md §4): an LLM-written sentence
 * situating the chunk in its document, prepended before embedding.
 * Optional — arrives with a live language model key.
 */
export type Contextualizer = (input: { document: string; chunk: string }) => Promise<string>;

export interface IndexSourceInput {
  tenantId: string;
  sourceType: ChunkSourceType;
  sourceId: string;
  /** Permission anchor; chunks without one are tenant-visible. */
  recordId?: string | undefined;
  text: string;
  embedder?: Embedder | undefined;
  contextualizer?: Contextualizer | undefined;
  chunking?: ChunkingOptions | undefined;
}

export interface IndexSourceResult {
  chunkCount: number;
  embedded: boolean;
}

/** The text that carries a chunk's meaning for both index sides. */
export function embeddableText(content: string, context: string | null): string {
  return context === null || context === '' ? content : `${context}\n${content}`;
}

export async function indexSource(
  tx: TenantTransaction,
  input: IndexSourceInput,
): Promise<IndexSourceResult> {
  const pieces = chunkText(input.text, input.chunking ?? {});

  // Replace-set: stale chunks must never survive a re-index.
  await tx
    .delete(chunks)
    .where(and(eq(chunks.sourceType, input.sourceType), eq(chunks.sourceId, input.sourceId)));
  if (pieces.length === 0) {
    return { chunkCount: 0, embedded: false };
  }

  const contexts: (string | null)[] = [];
  for (const piece of pieces) {
    contexts.push(
      input.contextualizer === undefined
        ? null
        : await input.contextualizer({ document: input.text, chunk: piece }),
    );
  }

  let embeddings: (number[] | null)[] = pieces.map(() => null);
  if (input.embedder !== undefined) {
    const vectors = await input.embedder.embed(
      pieces.map((piece, index) => embeddableText(piece, contexts[index] ?? null)),
    );
    if (vectors.length !== pieces.length) {
      throw new RetrievalError(
        'invalid-input',
        `Embedder returned ${String(vectors.length)} vectors for ${String(pieces.length)} chunks.`,
      );
    }
    embeddings = vectors;
  }

  await tx.insert(chunks).values(
    pieces.map((piece, index) => ({
      tenantId: input.tenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      recordId: input.recordId ?? null,
      seq: index,
      content: piece,
      context: contexts[index] ?? null,
      embedding: embeddings[index] ?? null,
    })),
  );

  return { chunkCount: pieces.length, embedded: input.embedder !== undefined };
}

export async function removeSource(
  tx: TenantTransaction,
  input: { sourceType: ChunkSourceType; sourceId: string },
): Promise<void> {
  await tx
    .delete(chunks)
    .where(and(eq(chunks.sourceType, input.sourceType), eq(chunks.sourceId, input.sourceId)));
}
