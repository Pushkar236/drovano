/**
 * Embedding seam: indexing and search take an optional Embedder so the
 * pipeline degrades to BM25-only when no OpenAI key is present (the
 * zero-cost posture) and tests can inject deterministic vectors.
 */
import type { ModelRouter } from '@drovano/ai';
import { embedMany } from 'ai';

export interface Embedder {
  embed: (texts: string[]) => Promise<number[][]>;
}

/** Undefined when embeddings are disabled — callers fall back to BM25. */
export function createAiEmbedder(router: ModelRouter): Embedder | undefined {
  if (!router.embeddingsEnabled) return undefined;
  const model = router.embeddingModel();
  return {
    embed: async (texts) => {
      const { embeddings } = await embedMany({ model, values: texts });
      return embeddings;
    },
  };
}
