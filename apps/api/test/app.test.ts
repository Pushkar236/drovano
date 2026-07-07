import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { createAuth } from '@drovano/identity';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';

describe('loadEnv', () => {
  const valid = {
    DATABASE_URL: 'postgres://localhost:5432/drovano',
    AUTH_SECRET: 'x'.repeat(32),
    BASE_URL: 'http://localhost:3000',
  };

  it('parses a valid environment and defaults the port', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.BASE_URL).toBe('http://localhost:3000');
  });

  it('fails fast with actionable messages', () => {
    expect(() => loadEnv({ ...valid, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
    expect(() => loadEnv({ ...valid, BASE_URL: 'not-a-url' })).toThrow(/BASE_URL/);
  });
});

describe('api over HTTP (real database)', () => {
  let testDb: TestDatabase;
  let app: Hono;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const auth = createAuth({
      db: testDb.app.db,
      secret: 'integration-test-secret-at-least-32-chars-long', // gitleaks:allow — intentional test dummy
      baseUrl: 'http://localhost:3000',
      mailer: { send: () => Promise.resolve() },
    });
    app = createApp({ auth });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('reports health', async () => {
    const response = await app.request('/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('serves sign-up and sign-in through the mounted auth handler', async () => {
    const signUp = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'http-test@example.com',
        name: 'HTTP Test',
        password: 'a-long-test-password-1',
      }),
    });
    expect(signUp.status).toBe(200);
    expect(signUp.headers.getSetCookie().join(';')).toContain('session_token');

    const badSignIn = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'http-test@example.com', password: 'wrong-password-1' }),
    });
    expect(badSignIn.status).toBe(401);
  });

  it('returns 404 for unknown routes', async () => {
    const response = await app.request('/nope');
    expect(response.status).toBe(404);
  });
});
