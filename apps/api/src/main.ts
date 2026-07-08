// Telemetry bootstrap must precede all other imports (instrument.ts).
import { telemetry } from './instrument.js';

import { serve } from '@hono/node-server';
import { createModelRouter } from '@drovano/ai';
import { seedStandardObjects } from '@drovano/crm';
import { createDb, withTenant } from '@drovano/db';
import { createAuth, createDevMailer } from '@drovano/identity';
import { createTokenCipher } from '@drovano/google';
import { createWebhookDispatcher } from '@drovano/platform';
import { createAiEmbedder, createLocalEmbedder } from '@drovano/retrieval';

import { noopInvalidationPublisher, type WorkerRuns } from '@drovano/api-contracts';

import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { createRedisInvalidationPublisher } from './invalidation.js';
import { runRecordKeeper } from './workers/record-keeper.js';

const env = loadEnv();
const dbHandle = createDb({ connectionString: env.DATABASE_URL });
const invalidation =
  env.REDIS_URL !== undefined && env.REDIS_URL !== ''
    ? createRedisInvalidationPublisher(env.REDIS_URL)
    : { ...noopInvalidationPublisher, close: (): void => undefined };

const stdout = (line: string): void => {
  process.stdout.write(line);
};

const auth = createAuth({
  db: dbHandle.db,
  secret: env.AUTH_SECRET,
  baseUrl: env.BASE_URL,
  // The deployed SPA calls the auth endpoints cross-origin (Vercel →
  // Render); better-auth rejects untrusted origins by default (CSRF).
  ...(env.WEB_ORIGIN !== undefined ? { trustedOrigins: [env.WEB_ORIGIN] } : {}),
  // Dev mailer until an email provider is provisioned (needs credentials —
  // see docs/prompts/prompt-02-brief.md, open items).
  mailer: createDevMailer(stdout),
  // Module composition happens at the app tier (ADR-0004): new tenants
  // start with the CRM standard objects.
  afterOrganizationProvisioned: ({ tenantId }) =>
    withTenant(dbHandle.db, tenantId, (tx) =>
      seedStandardObjects(tx, { tenantId, actor: { kind: 'system' } }),
    ),
});

// Webhook deliveries are fire-and-forget in v1; failures go to telemetry.
const webhooks = createWebhookDispatcher({
  db: dbHandle.db,
  onError: (error, url) => {
    telemetry.captureError(error instanceof Error ? error : new Error(String(error)), {
      webhookUrl: url,
    });
  },
});

// AI workers (TASK-0038): available only when a language key exists
// (ADR-0014); the router prefers Anthropic, else OpenRouter free tiers.
const modelRouter = createModelRouter(env);
// Embeddings: hosted (OpenAI) when its key exists, else the local
// open-source model (ADR-0015); EMBEDDINGS=off turns dense search off.
const embedder =
  env.EMBEDDINGS === 'off' ? undefined : (createAiEmbedder(modelRouter) ?? createLocalEmbedder());
const workers: WorkerRuns = modelRouter.languageEnabled
  ? {
      recordKeeper: (input) =>
        runRecordKeeper(
          { db: dbHandle.db, model: modelRouter.languageModel('fast'), embedder },
          input,
        ),
    }
  : {};

// Google integration (TASK-0032): mounted only when the OAuth client
// is configured; tokens rest encrypted under a key derived from
// AUTH_SECRET.
const google =
  env.GOOGLE_CLIENT_ID !== undefined &&
  env.GOOGLE_CLIENT_ID !== '' &&
  env.GOOGLE_CLIENT_SECRET !== undefined &&
  env.GOOGLE_CLIENT_SECRET !== ''
    ? {
        oauth: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri: `${env.BASE_URL}/api/integrations/google/callback`,
        },
        cipher: createTokenCipher(env.AUTH_SECRET),
        stateSecret: env.AUTH_SECRET,
      }
    : undefined;

const app = createApp({
  auth,
  db: dbHandle.db,
  telemetry,
  invalidation,
  webhooks,
  workers,
  ...(google !== undefined ? { google } : {}),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  stdout(`drovano api listening on :${String(info.port)} (${env.DEPLOY_ENV})\n`);
});

// Graceful shutdown: stop accepting, flush telemetry, release the pool.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      invalidation.close();
      void Promise.allSettled([telemetry.shutdown(), dbHandle.close()]).then(() => {
        process.exit(0);
      });
    });
  });
}
