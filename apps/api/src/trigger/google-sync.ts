/**
 * Scheduled Gmail sweep (TASK-0032 phase 2, ADR-0007): every tenant's
 * connections sync on a cadence, so the graph maintains itself without
 * anyone clicking. The composition mirrors main.ts; each run owns its
 * resources and releases them.
 */
import { createModelRouter } from '@drovano/ai';
import { createDb } from '@drovano/db';
import { createTokenCipher } from '@drovano/google';
import { createAiEmbedder, createLocalEmbedder } from '@drovano/retrieval';
import { schedules } from '@trigger.dev/sdk';

import { loadEnv } from '../env.js';
import { syncAllGoogleConnections } from '../integrations/google-sync.js';

export const googleSyncSchedule = schedules.task({
  id: 'google-sync',
  cron: '*/10 * * * *',
  run: async () => {
    const env = loadEnv();
    if (
      env.GOOGLE_CLIENT_ID === undefined ||
      env.GOOGLE_CLIENT_ID === '' ||
      env.GOOGLE_CLIENT_SECRET === undefined ||
      env.GOOGLE_CLIENT_SECRET === ''
    ) {
      // Not an error — this environment simply has no Google client.
      return { skipped: true as const, reason: 'google oauth client not configured' };
    }
    const router = createModelRouter(env);
    const embedder =
      env.EMBEDDINGS === 'off' ? undefined : (createAiEmbedder(router) ?? createLocalEmbedder());
    const dbHandle = createDb({ connectionString: env.DATABASE_URL });
    try {
      return await syncAllGoogleConnections({
        db: dbHandle.db,
        oauth: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri: `${env.WEB_ORIGIN ?? env.BASE_URL}/api/integrations/google/callback`,
        },
        cipher: createTokenCipher(env.AUTH_SECRET),
        embedder,
      });
    } finally {
      await dbHandle.close();
    }
  },
});
