/**
 * @drovano/retrieval — the retrieval pipeline (TASK-0035, ADR-0010).
 *
 * Indexing: recursive chunking (+ contextual-retrieval seam) into the
 * pgvector-backed `chunks` table. Query: hybrid BM25+dense with RRF
 * fusion and a rerank seam, always permission-filtered. Exposed to
 * workers as an agent tool.
 */
export { chunkText, type ChunkingOptions } from './chunking.js';
export { createAiEmbedder, type Embedder } from './embedder.js';
export {
  createLocalEmbedder,
  LOCAL_EMBEDDING_MODEL,
  type LocalEmbedderOptions,
} from './local-embedder.js';
export { RetrievalError, type RetrievalErrorCode } from './errors.js';
export {
  embeddableText,
  indexSource,
  removeSource,
  type Contextualizer,
  type IndexSourceInput,
  type IndexSourceResult,
} from './indexing.js';
export { passthroughReranker, type RerankCandidate, type Reranker } from './rerank.js';
export { searchChunks, type SearchHit, type SearchInput } from './search.js';
export { createRetrievalTool, type CreateRetrievalToolOptions } from './tool.js';
