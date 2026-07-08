import {
  appRouter,
  createRequestContext,
  noopInvalidationPublisher,
  type InvalidationPublisher,
  type WorkerRuns,
} from '@drovano/api-contracts';
import type { Database } from '@drovano/db';
import type { Auth } from '@drovano/identity';
import type { WebhookDispatcher } from '@drovano/platform';
import type { Telemetry } from '@drovano/telemetry';
import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';

import { createRestApi } from './rest.js';

export interface CreateAppOptions {
  auth: Auth;
  db: Database;
  telemetry?: Telemetry;
  invalidation?: InvalidationPublisher;
  webhooks?: WebhookDispatcher;
  workers?: WorkerRuns;
}

/**
 * The Hono application (ADR-0004). Pure function of its dependencies so
 * tests construct it against ephemeral databases; `main.ts` is the only
 * place that reads the environment.
 */
export function createApp({
  auth,
  db,
  telemetry,
  invalidation = noopInvalidationPublisher,
  webhooks,
  workers,
}: CreateAppOptions): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // better-auth owns everything under /api/auth/* (ADR-0008).
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  // Public REST API v1 (ADR-0005): bearer API keys, read paths (rest.ts).
  app.route('/v1', createRestApi(db));

  // Internal tRPC surface (ADR-0005) — the dashboard's contract.
  app.use(
    '/api/trpc/*',
    trpcServer({
      router: appRouter,
      endpoint: '/api/trpc',
      createContext: async (_opts, c) =>
        // Safe: the adapter's signature is a loose Record; the router's
        // actual context type is RequestContext and only our router
        // receives this object.
        (await createRequestContext({
          db,
          auth,
          headers: c.req.raw.headers,
          invalidation,
          ...(webhooks !== undefined ? { webhooks } : {}),
          ...(workers !== undefined ? { workers } : {}),
        })) as unknown as Record<string, unknown>,
    }),
  );

  // Unexpected failures: report with request context, answer with a safe,
  // actionable envelope — internals never reach the client
  // (CODING_STANDARDS.md errors).
  app.onError((error, c) => {
    telemetry?.captureError(error, {
      method: c.req.method,
      path: c.req.path,
    });
    return c.json(
      {
        error: {
          code: 'internal',
          message: 'Something failed on our side. Retry, and contact support if it persists.',
        },
      },
      500,
    );
  });

  return app;
}
