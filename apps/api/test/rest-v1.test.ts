import { createCaller, createRequestContext, type RequestContext } from '@drovano/api-contracts';
import { seedStandardObjects } from '@drovano/crm';
import { withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { createAuth, type Auth } from '@drovano/identity';
import type { WebhookEventPayload } from '@drovano/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

const PASSWORD = 'a-long-test-password-1';

/** The public surface end-to-end: bearer key → tenant → crm services. */
describe('public REST API v1 (real database, real keys)', () => {
  let testDb: TestDatabase;
  let auth: Auth;
  let app: ReturnType<typeof createApp>;
  let ownerCaller: ReturnType<typeof createCaller>;
  let apiSecret: string;
  let recordId: string;
  const dispatched: { tenantId: string; payload: WebhookEventPayload }[] = [];

  function cookieHeaders(headers: Headers): Headers {
    const pairs = headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .filter((pair): pair is string => pair !== undefined && pair !== '');
    return new Headers({ cookie: pairs.join('; ') });
  }

  async function contextFor(headers: Headers): Promise<RequestContext> {
    return createRequestContext({
      db: testDb.app.db,
      auth,
      headers,
      webhooks: {
        dispatch: (tenantId, payload) => {
          dispatched.push({ tenantId, payload });
          return Promise.resolve();
        },
      },
    });
  }

  async function provisionTenant(email: string, slug: string) {
    const { headers } = await auth.api.signUpEmail({
      body: { email, name: 'Owner', password: PASSWORD },
      returnHeaders: true,
    });
    const cookies = cookieHeaders(headers);
    const organization = await auth.api.createOrganization({
      body: { name: slug, slug },
      headers: cookies,
    });
    await auth.api.setActiveOrganization({
      body: { organizationId: organization.id },
      headers: cookies,
    });
    return createCaller(await contextFor(cookies));
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    auth = createAuth({
      db: testDb.app.db,
      secret: 'integration-test-secret-at-least-32-chars-long', // gitleaks:allow — intentional test dummy
      baseUrl: 'http://localhost:3000',
      mailer: { send: () => Promise.resolve() },
      afterOrganizationProvisioned: ({ tenantId }) =>
        withTenant(testDb.app.db, tenantId, (tx) =>
          seedStandardObjects(tx, { tenantId, actor: { kind: 'system' } }),
        ),
    });
    app = createApp({ auth, db: testDb.app.db });

    ownerCaller = await provisionTenant('rest-owner@example.com', 'rest-org');
    const definitions = await ownerCaller.crm.objects();
    const companyObjectId = definitions.objects.find((o) => o.key === 'company')?.id ?? '';
    const record = await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Rest Co', domain: 'https://rest.example' },
    });
    recordId = record.id;

    const key = await ownerCaller.platform.apiKeys.create({ name: 'Test key' });
    apiSecret = key.secret;
  });

  afterAll(async () => {
    await testDb.stop();
  });

  async function authed(path: string, secret = apiSecret): Promise<Response> {
    return app.request(path, { headers: { authorization: `Bearer ${secret}` } });
  }

  it('rejects missing and unknown keys with a 401 envelope', async () => {
    const missing = await app.request('/v1/objects');
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: { code: 'unauthorized' } });

    const bogus = await authed('/v1/objects', 'drv_' + 'f'.repeat(48));
    expect(bogus.status).toBe(401);
  });

  it('GET /v1/objects returns the schema with nested attributes', async () => {
    const response = await authed('/v1/objects');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      objects: { key: string; attributes: { key: string }[] }[];
    };
    const company = body.objects.find((object) => object.key === 'company');
    expect(company).toBeDefined();
    expect(company?.attributes.map((attribute) => attribute.key).sort()).toEqual([
      'domain',
      'name',
    ]);
  });

  it('GET /v1/records?object=<key> returns tenant-scoped records', async () => {
    const response = await authed('/v1/records?object=company');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { id: string }[] };
    expect(body.items.map((item) => item.id)).toContain(recordId);

    const unknown = await authed('/v1/records?object=nope');
    expect(unknown.status).toBe(404);
    const missingParam = await authed('/v1/records');
    expect(missingParam.status).toBe(400);
  });

  it('GET /v1/records/:id returns the record; unknown ids are 404', async () => {
    const response = await authed(`/v1/records/${recordId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { values: Record<string, unknown> };
    expect(body.values.name).toBe('Rest Co');

    const notFound = await authed('/v1/records/0197a000-0000-7000-8000-000000000009');
    expect(notFound.status).toBe(404);
    const badId = await authed('/v1/records/not-a-uuid');
    expect(badId.status).toBe(400);
  });

  it('a key never reads another tenant, and revocation cuts access', async () => {
    const otherCaller = await provisionTenant('rest-other@example.com', 'rest-other');
    const otherKey = await otherCaller.platform.apiKeys.create({ name: 'Other key' });

    const response = await authed('/v1/records?object=company', otherKey.secret);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { id: string }[] };
    expect(body.items).toHaveLength(0); // fresh tenant — never Rest Co

    const [listed] = await otherCaller.platform.apiKeys.list();
    expect(listed).toBeDefined();
    await otherCaller.platform.apiKeys.revoke({ keyId: listed?.id ?? '' });
    const afterRevoke = await authed('/v1/objects', otherKey.secret);
    expect(afterRevoke.status).toBe(401);
  });

  it('record mutations dispatch webhook events next to invalidation', async () => {
    const definitions = await ownerCaller.crm.objects();
    const companyObjectId = definitions.objects.find((o) => o.key === 'company')?.id ?? '';
    dispatched.length = 0;

    const record = await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Hooked Co' },
    });
    await ownerCaller.crm.records.update({ recordId: record.id, values: { name: 'Hooked Corp' } });
    await ownerCaller.crm.records.delete({ recordId: record.id });

    expect(dispatched.map((entry) => entry.payload.event)).toEqual([
      'record.created',
      'record.updated',
      'record.deleted',
    ]);
    expect(dispatched.every((entry) => entry.payload.recordId === record.id)).toBe(true);
  });

  it('members are denied key and webhook management', async () => {
    const { headers } = await auth.api.signUpEmail({
      body: { email: 'rest-member@example.com', name: 'Member', password: PASSWORD },
      returnHeaders: true,
    });
    const cookies = cookieHeaders(headers);
    const session = await auth.api.getSession({ headers: cookies });
    const ownerContext = await ownerCaller.me.get();
    const organizationId = ownerContext.activeOrganizationId ?? '';
    const { members } = await import('@drovano/db');
    const { randomUUID } = await import('node:crypto');
    await testDb.owner.db.insert(members).values({
      id: randomUUID(),
      organizationId,
      userId: session?.user.id ?? '',
      role: 'member',
    });
    await auth.api.setActiveOrganization({ body: { organizationId }, headers: cookies });
    const memberCaller = createCaller(await contextFor(cookies));

    await expect(memberCaller.platform.apiKeys.create({ name: 'Nope' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(memberCaller.platform.apiKeys.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      memberCaller.platform.webhooks.create({
        url: 'https://x.example',
        events: ['record.created'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('platform webhooks manage lifecycle through tRPC', async () => {
    const created = await ownerCaller.platform.webhooks.create({
      url: 'https://receiver.example/hooks',
      events: ['record.created', 'record.deleted'],
    });
    expect(created.secret).toMatch(/^whsec_/);

    const listed = await ownerCaller.platform.webhooks.list();
    expect(listed.map((hook) => hook.id)).toContain(created.id);

    await ownerCaller.platform.webhooks.remove({ webhookId: created.id });
    await expect(
      ownerCaller.platform.webhooks.remove({ webhookId: created.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
