import type { Auth } from '@drovano/identity';
import type { Telemetry } from '@drovano/telemetry';
import { Hono } from 'hono';

export interface CreateAppOptions {
  auth: Auth;
  telemetry?: Telemetry;
}

/**
 * The Hono application (ADR-0004). Pure function of its dependencies so
 * tests construct it against ephemeral databases; `main.ts` is the only
 * place that reads the environment.
 */
export function createApp({ auth, telemetry }: CreateAppOptions): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // better-auth owns everything under /api/auth/* (ADR-0008).
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

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
