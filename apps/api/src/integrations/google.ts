/**
 * Google OAuth connect flow (TASK-0032): browser-facing endpoints. Any
 * signed-in member may connect THEIR OWN Google account for the active
 * organization (ingestion is per-mailbox); tokens are stored encrypted
 * by the module. The `state` parameter is an HMAC-signed nonce binding
 * the callback to the session that started the flow (CSRF posture).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  buildAuthUrl,
  exchangeCode,
  GoogleError,
  saveConnection,
  type OAuthConfig,
  type TokenCipher,
} from '@drovano/google';
import { withTenant, writeAuditEntry, type Database } from '@drovano/db';
import type { Auth } from '@drovano/identity';
import { Hono } from 'hono';

export interface GoogleIntegrationConfig {
  db: Database;
  auth: Auth;
  oauth: OAuthConfig;
  cipher: TokenCipher;
  /** Signs the state nonce; reuse the app auth secret. */
  stateSecret: string;
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function signState(secret: string, tenantId: string, userId: string, issuedAt: number): string {
  const payload = Buffer.from(JSON.stringify({ tenantId, userId, issuedAt })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyState(secret: string, state: string): { tenantId: string; userId: string } | null {
  const [payload, signature] = state.split('.');
  if (payload === undefined || signature === undefined) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      tenantId?: unknown;
      userId?: unknown;
      issuedAt?: unknown;
    };
    if (
      typeof parsed.tenantId !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.issuedAt !== 'number' ||
      Date.now() - parsed.issuedAt > STATE_MAX_AGE_MS
    ) {
      return null;
    }
    return { tenantId: parsed.tenantId, userId: parsed.userId };
  } catch {
    return null;
  }
}

function page(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Drovano</title><body style="font-family:system-ui;padding:3rem;max-width:32rem;margin:auto"><p>${message}</p></body>`;
}

export function createGoogleIntegrationRoutes(config: GoogleIntegrationConfig): Hono {
  const routes = new Hono();

  routes.get('/connect', async (c) => {
    const session = await config.auth.api.getSession({ headers: c.req.raw.headers });
    const tenantId = session?.session.activeOrganizationId ?? null;
    if (session === null || tenantId === null) {
      return c.json(
        { error: { code: 'unauthorized', message: 'Sign in and pick an organization first.' } },
        401,
      );
    }
    const state = signState(config.stateSecret, tenantId, session.user.id, Date.now());
    return c.redirect(buildAuthUrl(config.oauth, state));
  });

  routes.get('/callback', async (c) => {
    const state = c.req.query('state') ?? '';
    const code = c.req.query('code');
    const verified = verifyState(config.stateSecret, state);
    if (verified === null) {
      return c.html(
        page('This connect link expired or is invalid — start again from Drovano.'),
        400,
      );
    }
    if (code === undefined) {
      const reason = c.req.query('error') ?? 'access was denied';
      return c.html(page(`Google connection was not completed (${reason}).`), 400);
    }

    // The callback must come from the same signed-in browser session.
    const session = await config.auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user.id !== verified.userId) {
      return c.html(page('Session mismatch — sign in and start the connection again.'), 401);
    }

    try {
      const tokens = await exchangeCode(config.oauth, code);
      const connection = await withTenant(config.db, verified.tenantId, async (tx) => {
        const saved = await saveConnection(tx, {
          tenantId: verified.tenantId,
          userId: verified.userId,
          tokens,
          cipher: config.cipher,
        });
        await writeAuditEntry(tx, {
          tenantId: verified.tenantId,
          actorKind: 'human',
          actorId: verified.userId,
          action: 'integration.google-connect',
          resourceType: 'google-connection',
          resourceId: saved.id,
          detail: { email: tokens.email, scope: tokens.scope },
        });
        return saved;
      });
      return c.html(
        page(
          `Connected <strong>${connection.email}</strong> — Gmail and Calendar ingestion is ready. You can close this tab.`,
        ),
      );
    } catch (error) {
      if (error instanceof GoogleError) {
        return c.html(page(`Google connection failed: ${error.message}`), 502);
      }
      throw error;
    }
  });

  return routes;
}
