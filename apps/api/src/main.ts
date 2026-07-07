// Telemetry bootstrap must precede all other imports (instrument.ts).
import { telemetry } from './instrument.js';

import { serve } from '@hono/node-server';
import { createDb } from '@drovano/db';
import { createAuth, createDevMailer } from '@drovano/identity';

import { createApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const dbHandle = createDb({ connectionString: env.DATABASE_URL });

const stdout = (line: string): void => {
  process.stdout.write(line);
};

const auth = createAuth({
  db: dbHandle.db,
  secret: env.AUTH_SECRET,
  baseUrl: env.BASE_URL,
  // Dev mailer until an email provider is provisioned (needs credentials —
  // see docs/prompts/prompt-02-brief.md, open items).
  mailer: createDevMailer(stdout),
});

const app = createApp({ auth, telemetry });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  stdout(`drovano api listening on :${String(info.port)} (${env.DEPLOY_ENV})\n`);
});

// Graceful shutdown: stop accepting, flush telemetry, release the pool.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void Promise.allSettled([telemetry.shutdown(), dbHandle.close()]).then(() => {
        process.exit(0);
      });
    });
  });
}
