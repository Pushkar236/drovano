/**
 * Retrieval as an agent tool (ai-system.md §4 exposure): workers get
 * query-decomposition freedom — the model may call this repeatedly
 * with its own sub-queries. The tool is bound to a tenant AND a
 * principal at construction, so a harness run can never search as
 * anyone but the agent it runs for.
 */
import { tool } from '@drovano/ai';
import { withTenant, type ChunkSourceType, type Database } from '@drovano/db';
import type { PrincipalContext } from '@drovano/permissions';
import { z } from 'zod';

import type { Embedder } from './embedder.js';
import type { Reranker } from './rerank.js';
import { searchChunks, type SearchHit } from './search.js';

export interface CreateRetrievalToolOptions {
  db: Database;
  tenantId: string;
  principal: PrincipalContext;
  embedder?: Embedder | undefined;
  reranker?: Reranker | undefined;
  sourceTypes?: ChunkSourceType[] | undefined;
  limit?: number | undefined;
}

export function createRetrievalTool(options: CreateRetrievalToolOptions) {
  return tool({
    description:
      'Search the workspace knowledge base (emails, notes, transcripts, documents). ' +
      'Returns the most relevant passages with their source references. ' +
      'Decompose broad questions into several focused queries.',
    inputSchema: z.object({
      query: z.string().min(1).describe('A focused natural-language search query.'),
    }),
    execute: async ({ query }): Promise<SearchHit[]> =>
      withTenant(options.db, options.tenantId, (tx) =>
        searchChunks(tx, {
          tenantId: options.tenantId,
          principal: options.principal,
          query,
          embedder: options.embedder,
          reranker: options.reranker,
          sourceTypes: options.sourceTypes,
          limit: options.limit,
        }),
      ),
  });
}
