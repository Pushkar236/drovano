/**
 * Google OAuth connect flow over HTTP (TASK-0032 phase 1): session
 * gating, HMAC state round-trip, token exchange (stubbed fetch),
 * encrypted storage, audit trail. TESTING.md: Google itself is never
 * called — fetch is injected.
 */
import { createTokenCipher } from '@drovano/google';
import { auditLog, googleConnections, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { createAuth, type Auth } from '@drovano/identity';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

const SECRET = 'integration-test-secret-at-least-32-chars-long'; // gitleaks:allow — fake

const stubGoogleFetch = ((input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          access_token: 'at-live',
          refresh_token: 'rt-live',
          expires_in: 3600,
          scope: 'openid email gmail.readonly calendar.readonly',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  }
  if (url.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) {
    return Promise.resolve(
      new Response(JSON.stringify({ email: 'owner-gmail@example.com' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

describe('google integration routes (real database, stubbed Google)', () => {
  let testDb: TestDatabase;
  let auth: Auth;
  let app: ReturnType<typeof createApp>;
  let cookies: string;
  let tenantId: string;
  const cipher = createTokenCipher(SECRET);

  beforeAll(async () => {
    testDb = await startTestDatabase();
    auth = createAuth({
      db: testDb.app.db,
      secret: SECRET,
      baseUrl: 'http://localhost:3000',
      mailer: { send: () => Promise.resolve() },
    });
    app = createApp({
      auth,
      db: testDb.app.db,
      google: {
        oauth: {
          clientId: 'cid',
          clientSecret: 'cs',
          redirectUri: 'http://localhost:3000/api/integrations/google/callback',
          fetchImpl: stubGoogleFetch,
        },
        cipher,
        stateSecret: SECRET,
      },
    });

    const { headers } = await auth.api.signUpEmail({
      body: {
        email: 'google-owner@example.com',
        name: 'Owner',
        password: 'a-long-test-password-1',
      },
      returnHeaders: true,
    });
    cookies = headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    const organization = await auth.api.createOrganization({
      body: { name: 'Google Org', slug: 'google-org' },
      headers: new Headers({ cookie: cookies }),
    });
    tenantId = organization.id;
    await auth.api.setActiveOrganization({
      body: { organizationId: tenantId },
      headers: new Headers({ cookie: cookies }),
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('rejects /connect without a session', async () => {
    const response = await app.request('/api/integrations/google/connect');
    expect(response.status).toBe(401);
  });

  it('runs the full connect → callback flow and stores an encrypted connection', async () => {
    const connect = await app.request('/api/integrations/google/connect', {
      headers: { cookie: cookies },
    });
    expect(connect.status).toBe(302);
    const location = new URL(connect.headers.get('location') ?? '');
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('access_type')).toBe('offline');
    const state = location.searchParams.get('state') ?? '';
    expect(state).not.toBe('');

    const callback = await app.request(
      `/api/integrations/google/callback?code=fake-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: cookies } },
    );
    expect(callback.status).toBe(200);
    expect(await callback.text()).toContain('owner-gmail@example.com');

    const rows = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx
        .select({
          email: googleConnections.email,
          accessTokenEnc: googleConnections.accessTokenEnc,
        })
        .from(googleConnections),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('owner-gmail@example.com');
    expect(rows[0]?.accessTokenEnc).not.toContain('at-live');
    expect(cipher.decrypt(rows[0]?.accessTokenEnc ?? '')).toBe('at-live');

    const audits = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx.select({ action: auditLog.action }).from(auditLog),
    );
    expect(audits.map((a) => a.action)).toContain('integration.google-connect');
  });

  it('rejects a tampered or expired state', async () => {
    const bad = await app.request('/api/integrations/google/callback?code=x&state=forged.payload', {
      headers: { cookie: cookies },
    });
    expect(bad.status).toBe(400);
  });
});
