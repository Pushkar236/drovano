import type { Auth } from '@drovano/identity';
import { Hono } from 'hono';

export interface CreateAppOptions {
  auth: Auth;
}

/**
 * The Hono application (ADR-0004). Pure function of its dependencies so
 * tests construct it against ephemeral databases; `main.ts` is the only
 * place that reads the environment.
 */
export function createApp({ auth }: CreateAppOptions): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // better-auth owns everything under /api/auth/* (ADR-0008).
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  return app;
}
