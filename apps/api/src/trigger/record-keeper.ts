/**
 * Durable wrapper around the record-keeper worker (TASK-0038,
 * ADR-0007). Trigger.dev owns retries, queuing, and observability;
 * the worker itself stays framework-free and fully tested in
 * src/workers/record-keeper.ts.
 *
 * Each run builds its own composition (db pool, model router,
 * embedder) from the environment and releases it afterwards — task
 * containers are ephemeral and must not share the API server's pool.
 */
import { createModelRouter } from '@drovano/ai';
import { createDb } from '@drovano/db';
import { createAiEmbedder, createLocalEmbedder } from '@drovano/retrieval';
import { AbortTaskRunError, schemaTask } from '@trigger.dev/sdk';
import { z } from 'zod';

import { loadEnv } from '../env.js';
import { runRecordKeeper } from '../workers/record-keeper.js';

export const recordKeeperTask = schemaTask({
  id: 'record-keeper',
  schema: z.object({
    tenantId: z.uuid(),
    agentId: z.uuid(),
    recordId: z.uuid(),
    instruction: z.string().optional(),
  }),
  run: async (payload) => {
    const env = loadEnv();
    const router = createModelRouter(env);
    if (!router.languageEnabled) {
      // Permanent configuration error — retrying cannot fix it (ADR-0014).
      throw new AbortTaskRunError(
        'No language model configured: set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.',
      );
    }
    const embedder =
      env.EMBEDDINGS === 'off' ? undefined : (createAiEmbedder(router) ?? createLocalEmbedder());
    const dbHandle = createDb({ connectionString: env.DATABASE_URL });
    try {
      return await runRecordKeeper(
        { db: dbHandle.db, model: router.languageModel('fast'), embedder },
        payload,
      );
    } finally {
      await dbHandle.close();
    }
  },
});
