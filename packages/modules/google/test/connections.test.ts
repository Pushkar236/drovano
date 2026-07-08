/**
 * Connection storage over real Postgres: encrypted round-trip, upsert
 * semantics, cursor updates, token refresh persistence, RLS isolation.
 */
import { googleConnections, tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTokenCipher,
  listConnections,
  saveConnection,
  updateCursors,
  withFreshAccessToken,
  type ExchangedTokens,
} from '../src/index.js';

const SECRET = 'integration-test-secret-at-least-32-chars-long'; // gitleaks:allow — fake
const cipher = createTokenCipher(SECRET);

function tokens(overrides: Partial<ExchangedTokens> = {}): ExchangedTokens {
  return {
    accessToken: 'at-fresh',
    refreshToken: 'rt-long-lived',
    expiresAt: new Date(Date.now() + 3600_000),
    scope: 'openid email gmail.readonly',
    email: 'jane@acme.example',
    ...overrides,
  };
}

describe('google connections (real Postgres)', () => {
  let testDb: TestDatabase;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const seeded = await testDb.owner.db
      .insert(tenants)
      .values([{ name: 'Google A' }, { name: 'Google B' }])
      .returning({ id: tenants.id });
    tenantA = seeded[0]?.id ?? '';
    tenantB = seeded[1]?.id ?? '';
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('stores tokens encrypted, upserts per (tenant, email), and updates cursors', async () => {
    const first = await withTenant(testDb.app.db, tenantA, (tx) =>
      saveConnection(tx, { tenantId: tenantA, userId: 'user-1', tokens: tokens(), cipher }),
    );
    // Same google account again → same row, updated tokens.
    const second = await withTenant(testDb.app.db, tenantA, (tx) =>
      saveConnection(tx, {
        tenantId: tenantA,
        userId: 'user-2',
        tokens: tokens({ accessToken: 'at-newer' }),
        cipher,
      }),
    );
    expect(second.id).toBe(first.id);
    expect(second.userId).toBe('user-2');

    // Ciphertext at rest — never the plaintext token.
    const [raw] = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx.select({ accessTokenEnc: googleConnections.accessTokenEnc }).from(googleConnections),
    );
    expect(raw?.accessTokenEnc).not.toContain('at-newer');
    expect(cipher.decrypt(raw?.accessTokenEnc ?? '')).toBe('at-newer');

    await withTenant(testDb.app.db, tenantA, (tx) =>
      updateCursors(tx, { connectionId: first.id, gmailHistoryId: '1234' }),
    );
    const listed = await withTenant(testDb.app.db, tenantA, (tx) => listConnections(tx));
    expect(listed).toHaveLength(1);
    expect(listed[0]?.gmailHistoryId).toBe('1234');
    expect(listed[0]?.calendarSyncToken).toBeNull();
  });

  it('returns the stored token while fresh and refreshes (and persists) when expiring', async () => {
    const connection = await withTenant(testDb.app.db, tenantA, (tx) =>
      saveConnection(tx, {
        tenantId: tenantA,
        userId: 'user-1',
        tokens: tokens({ email: 'fresh@acme.example', accessToken: 'at-current' }),
        cipher,
      }),
    );
    const oauth = {
      clientId: 'cid',
      clientSecret: 'cs',
      redirectUri: 'https://x/cb',
      fetchImpl: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ access_token: 'at-refreshed', expires_in: 3600, scope: 's' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )) as typeof fetch,
    };

    // Fresh: no refresh happens (the stub would change the token).
    const current = await withTenant(testDb.app.db, tenantA, (tx) =>
      withFreshAccessToken(tx, { connectionId: connection.id, cipher, oauth }),
    );
    expect(current).toBe('at-current');

    // Force expiry → refresh path persists the new ciphertext.
    await withTenant(testDb.app.db, tenantA, (tx) =>
      tx.update(googleConnections).set({ accessTokenExpiresAt: new Date(Date.now() - 1000) }),
    );
    const refreshed = await withTenant(testDb.app.db, tenantA, (tx) =>
      withFreshAccessToken(tx, { connectionId: connection.id, cipher, oauth }),
    );
    expect(refreshed).toBe('at-refreshed');

    const again = await withTenant(testDb.app.db, tenantA, (tx) =>
      withFreshAccessToken(tx, { connectionId: connection.id, cipher, oauth }),
    );
    expect(again).toBe('at-refreshed'); // persisted, no second refresh needed
  });

  it('RLS: tenant B sees no connections of tenant A', async () => {
    const listed = await withTenant(testDb.app.db, tenantB, (tx) => listConnections(tx));
    expect(listed).toEqual([]);
  });
});
