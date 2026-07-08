/**
 * Local open-source embeddings (ADR-0015): bge-small-en-v1.5 through
 * transformers.js (ONNX, CPU, q8) — no API key, no per-call cost, runs
 * wherever Node runs. 384 dims (the `chunks.embedding` column matches).
 *
 * This sits behind the same Embedder seam as the hosted path, so a
 * future OpenAI key replaces it by configuration — remembering that a
 * model swap always means re-embedding (different vector space) plus a
 * dimension migration.
 *
 * The model (~35 MB quantized) downloads from the Hugging Face hub on
 * first use and is cached on disk; construction is lazy so importing
 * this module costs nothing.
 */
import type { Embedder } from './embedder.js';

export const LOCAL_EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';

export interface LocalEmbedderOptions {
  /** Hub id of a feature-extraction model (must match column dims). */
  model?: string | undefined;
}

type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

export function createLocalEmbedder(options: LocalEmbedderOptions = {}): Embedder {
  let extractorPromise: Promise<Extractor> | undefined;
  const loadExtractor = async (): Promise<Extractor> => {
    extractorPromise ??= import('@huggingface/transformers').then(
      (transformers) =>
        transformers.pipeline('feature-extraction', options.model ?? LOCAL_EMBEDDING_MODEL, {
          dtype: 'q8',
        }) as Promise<Extractor>,
    );
    return extractorPromise;
  };

  return {
    embed: async (texts) => {
      if (texts.length === 0) return [];
      const extractor = await loadExtractor();
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      return output.tolist();
    },
  };
}
