/**
 * Gmail → record graph ingestion (TASK-0032 phase 2): full and
 * incremental sync against a real database with Gmail stubbed at the
 * fetch seam (TESTING.md — Google is never called). Covers the
 * mapping rules (counterparty person, company by domain, consumer
 * domains excluded), idempotent re-indexing, cursor advancement,
 * expired-cursor fallback, and the tRPC surface with its gates.
 */
import {
  createTokenCipher,
  removeConnection,
  saveConnection,
  type ConnectionSummary,
} from '@drovano/google';
import { createCaller, createRequestContext } from '@drovano/api-contracts';
import { queryRecords, seedStandardObjects } from '@drovano/crm';
import { chunks, members, objectDefinitions, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { createAuth, type Auth } from '@drovano/identity';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  syncAllGoogleConnections,
  syncGmailConnection,
  type GoogleSyncDeps,
} from '../src/integrations/google-sync.js';

const SECRET = 'integration-test-secret-at-least-32-chars-long'; // gitleaks:allow — fake
const PASSWORD = 'a-long-test-password-1';
const OWN_EMAIL = 'owner@corp.example';

interface StubMessage {
  id: string;
  historyId: string;
  internalDate: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
}

/** Mutable mailbox the stubbed Gmail API serves from. */
const mailbox = {
  list: [] as StubMessage[],
  byId: new Map<string, StubMessage>(),
  history: [] as StubMessage[],
  historyId: '1000',
  expireHistory: false,
};

function addMessage(message: StubMessage, target: 'list' | 'history'): void {
  mailbox.byId.set(message.id, message);
  mailbox[target].push(message);
}

const gmailFetch = ((input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const respond = (body: unknown, status = 200): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  if (url.includes('/gmail/v1/users/me/history')) {
    if (mailbox.expireHistory) return respond({ error: 'history expired' }, 404);
    return respond({
      historyId: mailbox.historyId,
      history: mailbox.history.map((message) => ({
        messagesAdded: [{ message: { id: message.id } }],
      })),
    });
  }
  if (url.includes('/gmail/v1/users/me/messages/')) {
    const id = url.split('/messages/')[1]?.split('?')[0] ?? '';
    const message = mailbox.byId.get(id);
    if (message === undefined) return respond({ error: 'not found' }, 404);
    return respond({
      id: message.id,
      threadId: `thread-${message.id}`,
      historyId: message.historyId,
      internalDate: message.internalDate,
      snippet: message.snippet,
      payload: {
        headers: [
          { name: 'From', value: message.from },
          { name: 'To', value: message.to },
          { name: 'Subject', value: message.subject },
        ],
      },
    });
  }
  if (url.includes('/gmail/v1/users/me/messages')) {
    return respond({ messages: mailbox.list.map((message) => ({ id: message.id })) });
  }
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

describe('gmail sync (real database, stubbed Gmail)', () => {
  let testDb: TestDatabase;
  let auth: Auth;
  let tenantId: string;
  let organizationId: string;
  let ownerHeaders: Headers;
  let connection: ConnectionSummary;
  let deps: GoogleSyncDeps;
  let personObjectId: string;
  const cipher = createTokenCipher(SECRET);

  function cookieHeaders(headers: Headers): Headers {
    const pairs = headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .filter((pair): pair is string => pair !== undefined && pair !== '');
    return new Headers({ cookie: pairs.join('; ') });
  }

  async function findPerson(email: string) {
    return withTenant(testDb.app.db, tenantId, async (tx) => {
      const page = await queryRecords(tx, {
        objectId: personObjectId,
        config: {
          filters: [{ attributeKey: 'email', op: 'eq', value: email }],
          sorts: [],
          columns: [],
        },
      });
      return page.items[0];
    });
  }

  async function chunksFor(recordId: string) {
    return withTenant(testDb.app.db, tenantId, (tx) =>
      tx
        .select({ content: chunks.content, sourceId: chunks.sourceId })
        .from(chunks)
        .where(eq(chunks.recordId, recordId)),
    );
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    auth = createAuth({
      db: testDb.app.db,
      secret: SECRET,
      baseUrl: 'http://localhost:3000',
      mailer: { send: () => Promise.resolve() },
      afterOrganizationProvisioned: ({ tenantId: seededTenant }) =>
        withTenant(testDb.app.db, seededTenant, (tx) =>
          seedStandardObjects(tx, { tenantId: seededTenant, actor: { kind: 'system' } }),
        ),
    });

    const { headers } = await auth.api.signUpEmail({
      body: { email: 'sync-owner@example.com', name: 'Owner', password: PASSWORD },
      returnHeaders: true,
    });
    ownerHeaders = cookieHeaders(headers);
    const organization = await auth.api.createOrganization({
      body: { name: 'Sync Org', slug: 'sync-org' },
      headers: ownerHeaders,
    });
    organizationId = organization.id;
    tenantId = organizationId;
    await auth.api.setActiveOrganization({
      body: { organizationId },
      headers: ownerHeaders,
    });

    connection = await withTenant(testDb.app.db, tenantId, (tx) =>
      saveConnection(tx, {
        tenantId,
        userId: 'irrelevant-for-sync',
        tokens: {
          accessToken: 'at-fresh',
          refreshToken: 'rt',
          expiresAt: new Date(Date.now() + 3_600_000),
          scope: 'gmail.readonly',
          email: OWN_EMAIL,
        },
        cipher,
      }),
    );

    deps = {
      db: testDb.app.db,
      oauth: {
        clientId: 'cid',
        clientSecret: 'cs',
        redirectUri: 'http://localhost:3000/cb',
        fetchImpl: gmailFetch,
      },
      cipher,
      fetchImpl: gmailFetch,
    };

    personObjectId = await withTenant(testDb.app.db, tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: objectDefinitions.id })
        .from(objectDefinitions)
        .where(eq(objectDefinitions.key, 'person'));
      return row?.id ?? '';
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('full sync maps messages onto people, companies, and chunks', async () => {
    addMessage(
      {
        id: 'm1',
        historyId: '1001',
        internalDate: '1783500000000',
        from: 'Ada Lovelace <Ada@Acme.example>',
        to: `Owner <${OWN_EMAIL}>`,
        subject: 'Renewal terms',
        snippet: 'Sending over the renewal terms we discussed.',
      },
      'list',
    );
    addMessage(
      {
        id: 'm2',
        historyId: '1002',
        internalDate: '1783500100000',
        from: 'bob.consumer@gmail.com',
        to: OWN_EMAIL,
        subject: 'Quick question',
        snippet: 'Curious about pricing.',
      },
      'list',
    );

    const result = await syncGmailConnection(deps, { tenantId, connectionId: connection.id });

    expect(result.mode).toBe('full');
    expect(result.fetched).toBe(2);
    expect(result.indexed).toBe(2);
    expect(result.peopleCreated).toBe(2);
    expect(result.companiesCreated).toBe(1);
    expect(result.cursor).toBe('1002');

    const ada = await findPerson('ada@acme.example');
    expect(ada).toBeDefined();
    expect(ada?.values.name).toBe('Ada Lovelace');
    expect(typeof ada?.values.company).toBe('string'); // linked by domain

    const bob = await findPerson('bob.consumer@gmail.com');
    expect(bob).toBeDefined();
    expect(bob?.values.company).toBeUndefined(); // consumer domain

    const adaChunks = await chunksFor(ada?.id ?? '');
    expect(adaChunks.length).toBeGreaterThan(0);
    expect(adaChunks[0]?.content).toContain('Renewal terms');
  });

  it('incremental sync reuses existing people and advances the cursor', async () => {
    mailbox.history = [];
    mailbox.historyId = '1003';
    addMessage(
      {
        id: 'm3',
        historyId: '1003',
        internalDate: '1783500200000',
        from: 'Ada Lovelace <ada@acme.example>',
        to: OWN_EMAIL,
        subject: 'Signed copy',
        snippet: 'Attached the signed copy.',
      },
      'history',
    );

    const result = await syncGmailConnection(deps, { tenantId, connectionId: connection.id });

    expect(result.mode).toBe('incremental');
    expect(result.fetched).toBe(1);
    expect(result.peopleCreated).toBe(0);
    expect(result.companiesCreated).toBe(0);
    expect(result.cursor).toBe('1003');

    const ada = await findPerson('ada@acme.example');
    const adaChunks = await chunksFor(ada?.id ?? '');
    const sources = new Set(adaChunks.map((chunk) => chunk.sourceId));
    expect(sources.size).toBe(2); // m1 + m3, each its own source
  });

  it('skips self-addressed messages — nothing to anchor to', async () => {
    mailbox.history = [];
    mailbox.historyId = '1004';
    addMessage(
      {
        id: 'm4',
        historyId: '1004',
        internalDate: '1783500300000',
        from: OWN_EMAIL,
        to: OWN_EMAIL,
        subject: 'Note to self',
        snippet: 'Remember the demo.',
      },
      'history',
    );

    const result = await syncGmailConnection(deps, { tenantId, connectionId: connection.id });
    expect(result.fetched).toBe(1);
    expect(result.indexed).toBe(0);
    expect(result.peopleCreated).toBe(0);
  });

  it('falls back to a full window when the history cursor expired, without duplicating', async () => {
    mailbox.expireHistory = true;

    const result = await syncGmailConnection(deps, { tenantId, connectionId: connection.id });
    mailbox.expireHistory = false;

    expect(result.mode).toBe('full');
    expect(result.peopleCreated).toBe(0); // replay of m1/m2 — all known
    expect(result.companiesCreated).toBe(0);

    const ada = await findPerson('ada@acme.example');
    const adaChunks = await chunksFor(ada?.id ?? '');
    // m1 re-indexed replace-set + m3 untouched: still exactly 2 sources.
    expect(new Set(adaChunks.map((chunk) => chunk.sourceId)).size).toBe(2);
  });

  it('sweeps all connections and isolates a failing mailbox', async () => {
    // A second connection whose access token is expired: the refresh
    // hits the (unstubbed) token endpoint and fails — that failure must
    // not block the healthy mailbox.
    const broken = await withTenant(testDb.app.db, tenantId, (tx) =>
      saveConnection(tx, {
        tenantId,
        userId: 'irrelevant-for-sync',
        tokens: {
          accessToken: 'at-stale',
          refreshToken: 'rt-stale',
          expiresAt: new Date(Date.now() - 1_000),
          scope: 'gmail.readonly',
          email: 'second@corp.example',
        },
        cipher,
      }),
    );

    mailbox.history = [];
    const sweep = await syncAllGoogleConnections(deps);

    expect(sweep.connections).toBe(2);
    expect(sweep.succeeded).toBe(1);
    expect(sweep.failed).toBe(1);
    const failedRun = sweep.runs.find((run) => run.connectionId === broken.id);
    expect(failedRun?.error).toBeDefined();
    const healthyRun = sweep.runs.find((run) => run.connectionId === connection.id);
    expect(healthyRun?.result?.mode).toBe('incremental');

    await withTenant(testDb.app.db, tenantId, (tx) => removeConnection(tx, broken.id));
  });

  it('exposes the surface over tRPC behind api.manage', async () => {
    const workers = {
      googleSync: (input: { tenantId: string; connectionId: string }) =>
        syncGmailConnection(deps, input),
    };
    const ownerCaller = createCaller(
      await createRequestContext({ db: testDb.app.db, auth, headers: ownerHeaders, workers }),
    );

    const listed = await ownerCaller.integrations.google.list();
    expect(listed.map((entry) => entry.id)).toContain(connection.id);

    mailbox.history = [];
    const synced = await ownerCaller.integrations.google.sync({ connectionId: connection.id });
    expect(synced.mode).toBe('incremental');
    expect(synced.fetched).toBe(0);

    await expect(
      ownerCaller.integrations.google.sync({ connectionId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Without the worker wired (no OAuth client) the surface refuses.
    const bareCaller = createCaller(
      await createRequestContext({ db: testDb.app.db, auth, headers: ownerHeaders }),
    );
    await expect(
      bareCaller.integrations.google.sync({ connectionId: connection.id }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // Members hold no api.manage — standing plumbing is owner/admin only.
    const { headers } = await auth.api.signUpEmail({
      body: { email: 'sync-member@example.com', name: 'Member', password: PASSWORD },
      returnHeaders: true,
    });
    const memberHeaders = cookieHeaders(headers);
    const memberSession = await auth.api.getSession({ headers: memberHeaders });
    await testDb.owner.db.insert(members).values({
      id: randomUUID(),
      organizationId,
      userId: memberSession?.user.id ?? '',
      role: 'member',
    });
    await auth.api.setActiveOrganization({ body: { organizationId }, headers: memberHeaders });
    const memberCaller = createCaller(
      await createRequestContext({ db: testDb.app.db, auth, headers: memberHeaders, workers }),
    );
    await expect(memberCaller.integrations.google.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      memberCaller.integrations.google.sync({ connectionId: connection.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
