import { randomUUID } from 'node:crypto';

import { createCaller, createRequestContext } from '@drovano/api-contracts';
import { seedStandardObjects } from '@drovano/crm';
import { members, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { createAuth, type Auth } from '@drovano/identity';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PASSWORD = 'a-long-test-password-1';

/** The CRM surface end-to-end: sessions → can() → services → RLS → audit. */
describe('crm tRPC surface (real database, real sessions)', () => {
  let testDb: TestDatabase;
  let auth: Auth;
  let ownerCaller: Awaited<ReturnType<typeof callerFor>>;
  let organizationId: string;
  let companyObjectId: string;

  function cookieHeaders(headers: Headers): Headers {
    const pairs = headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .filter((pair): pair is string => pair !== undefined && pair !== '');
    return new Headers({ cookie: pairs.join('; ') });
  }

  async function signUp(email: string, name: string): Promise<Headers> {
    const { headers } = await auth.api.signUpEmail({
      body: { email, name, password: PASSWORD },
      returnHeaders: true,
    });
    return cookieHeaders(headers);
  }

  async function callerFor(headers: Headers) {
    return createCaller(await createRequestContext({ db: testDb.app.db, auth, headers }));
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

    const ownerHeaders = await signUp('crm-owner@example.com', 'Owner');
    const organization = await auth.api.createOrganization({
      body: { name: 'Crm Org', slug: 'crm-org' },
      headers: ownerHeaders,
    });
    organizationId = organization.id;
    await auth.api.setActiveOrganization({ body: { organizationId }, headers: ownerHeaders });
    ownerCaller = await callerFor(ownerHeaders);

    const definitions = await ownerCaller.crm.objects();
    companyObjectId = definitions.objects.find((o) => o.key === 'company')?.id ?? '';
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('exposes the seeded standard objects and their attributes', async () => {
    const definitions = await ownerCaller.crm.objects();
    expect(definitions.objects.map((o) => o.key).sort()).toEqual(['company', 'deal', 'person']);
    expect(
      definitions.attributes
        .filter((a) => a.objectId === companyObjectId)
        .map((a) => a.key)
        .sort(),
    ).toEqual(['domain', 'name']);
  });

  it('record lifecycle: create → query with filters → update → delete', async () => {
    const created = await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Acme', domain: 'https://acme.example' },
    });
    await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Globex' },
    });

    const filtered = await ownerCaller.crm.records.query({
      objectId: companyObjectId,
      config: {
        filters: [{ attributeKey: 'name', op: 'contains', value: 'Acm' }],
        sorts: [],
        columns: [],
      },
    });
    expect(filtered.items.map((item) => item.values.name)).toEqual(['Acme']);

    await ownerCaller.crm.records.update({
      recordId: created.id,
      values: { name: 'Acme Corp' },
    });
    const fetched = await ownerCaller.crm.records.get({ recordId: created.id });
    expect(fetched.values.name).toBe('Acme Corp');

    await ownerCaller.crm.records.delete({ recordId: created.id });
    await expect(ownerCaller.crm.records.get({ recordId: created.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('lists lifecycle with list-scoped values through the API', async () => {
    const record = await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Pipeline Co' },
    });
    const list = await ownerCaller.crm.lists.create({
      objectId: companyObjectId,
      name: 'Q3 pipeline',
    });
    const entry = await ownerCaller.crm.lists.addRecord({
      listId: list.id,
      recordId: record.id,
    });
    // No list attributes yet: unknown key gets an actionable BAD_REQUEST.
    await expect(
      ownerCaller.crm.lists.setEntryValues({ entryId: entry.id, values: { stage: 'won' } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const entries = await ownerCaller.crm.lists.entries({ listId: list.id });
    expect(entries.items.map((item) => item.recordId)).toContain(record.id);
  });

  it('pipelines: createPipeline seeds the stage attribute; moves ride setEntryValues', async () => {
    const record = await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Board Co' },
    });
    const { list, stageAttribute } = await ownerCaller.crm.lists.createPipeline({
      objectId: companyObjectId,
      name: 'Sales pipeline',
      stages: ['Lead', 'Won'],
    });
    expect(stageAttribute.type).toBe('select');
    expect(stageAttribute.config).toEqual({ options: ['Lead', 'Won'] });

    const entry = await ownerCaller.crm.lists.addRecord({ listId: list.id, recordId: record.id });
    await ownerCaller.crm.lists.setEntryValues({
      entryId: entry.id,
      values: { stage: 'Won' },
    });
    const entries = await ownerCaller.crm.lists.entries({ listId: list.id });
    expect(entries.items[0]?.entryValues).toEqual({ stage: 'Won' });
    // Entity truth untouched (the separation, through the API).
    const fetched = await ownerCaller.crm.records.get({ recordId: record.id });
    expect(fetched.values).toEqual({ name: 'Board Co' });
  });

  it('activity: the audit trail is the timeline, newest first, delete included', async () => {
    const record = await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Trail Co' },
    });
    await ownerCaller.crm.records.update({ recordId: record.id, values: { name: 'Trail Corp' } });
    await ownerCaller.crm.records.delete({ recordId: record.id });

    const activity = await ownerCaller.crm.records.activity({ recordId: record.id });
    expect(activity.items.map((entry) => entry.action)).toEqual([
      'record.delete',
      'record.update',
      'record.create',
    ]);
    expect(activity.items.every((entry) => entry.actorKind === 'human')).toBe(true);
  });

  it('import: dry run writes nothing; real run creates and dedupes through the API', async () => {
    const rows = [
      { name: 'Csv Co', domain: 'https://csv.example' },
      { name: 'Csv Co Again', domain: 'https://csv.example' },
    ];
    const dry = await ownerCaller.crm.records.import({
      objectId: companyObjectId,
      rows,
      dedupe: { attributeKey: 'domain', mode: 'skip' },
      dryRun: true,
    });
    expect(dry).toMatchObject({ created: 1, skipped: 1, updated: 0, errors: [] });

    const real = await ownerCaller.crm.records.import({
      objectId: companyObjectId,
      rows,
      dedupe: { attributeKey: 'domain', mode: 'skip' },
    });
    expect(real).toMatchObject({ created: 1, skipped: 1 });

    const found = await ownerCaller.crm.records.query({
      objectId: companyObjectId,
      config: {
        filters: [{ attributeKey: 'domain', op: 'eq', value: 'https://csv.example' }],
        sorts: [],
        columns: [],
      },
    });
    expect(found.items).toHaveLength(1);
    expect(found.items[0]?.values.name).toBe('Csv Co');
  });

  it('members can work records but not delete them or manage objects', async () => {
    const memberHeaders = await signUp('crm-member@example.com', 'Member');
    const session = await auth.api.getSession({ headers: memberHeaders });
    await testDb.owner.db.insert(members).values({
      id: randomUUID(),
      organizationId,
      userId: session?.user.id ?? '',
      role: 'member',
    });
    await auth.api.setActiveOrganization({ body: { organizationId }, headers: memberHeaders });
    const memberCaller = await callerFor(memberHeaders);

    const record = await memberCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Member Made' },
    });
    expect(record.values.name).toBe('Member Made');

    await expect(memberCaller.crm.records.delete({ recordId: record.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(memberCaller.crm.seedStandardObjects()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('validation errors map to BAD_REQUEST with the domain message', async () => {
    await expect(
      ownerCaller.crm.records.create({
        objectId: companyObjectId,
        values: { domain: 'not a url' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(ownerCaller.crm.records.get({ recordId: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
