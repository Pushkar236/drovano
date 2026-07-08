/**
 * Rerank seam (ai-system.md §4: cross-encoder rerank of the hybrid
 * candidate pool). v1 ships the interface with a passthrough — a hosted
 * reranker (Cohere) plugs in here once a key exists; the fusion order
 * is already useful without it.
 */
export interface RerankCandidate {
  content: string;
  context: string | null;
}

export interface Reranker {
  /** Returns candidate indexes, best first. May drop candidates. */
  rerank: (query: string, candidates: RerankCandidate[]) => Promise<number[]>;
}

export const passthroughReranker: Reranker = {
  rerank: (_query, candidates) => Promise.resolve(candidates.map((_, index) => index)),
};
