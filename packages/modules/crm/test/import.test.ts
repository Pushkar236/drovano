import { tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { importRecords, listRecords, seedStandardObjects, type Actor } from '../src/index.js';

const ACTOR: Actor = { kind: 'system' };

describe('csv import service', () => {
  let testDb: TestDatabase;
  let tenantId: string;
  let companyObjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const [tenant] = await testDb.owner.db
      .insert(tenants)
      .values({ name: 'Import Tenant' })
      .returning({ id: tenants.id });
    tenantId = tenant?.id ?? '';
    await withTenant(testDb.app.db, tenantId, async (tx) => {
      await seedStandardObjects(tx, { tenantId, actor: ACTOR });
      const objects = await tx.query.objectDefinitions.findMany();
      companyObjectId = objects.find((o) => o.key === 'company')?.id ?? '';
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('dry run classifies without writing; real run creates through the normal rules', async () => {
    const rows = [
      { name: 'Import One', domain: 'https://one.example' },
      { name: 'Import Two' },
      { name: 'Bad Domain', domain: 'not a url' }, // invalid → row error
    ];

    const dry = await withTenant(testDb.app.db, tenantId, (tx) =>
      importRecords(tx, { tenantId, objectId: companyObjectId, rows, dryRun: true, actor: ACTOR }),
    );
    expect(dry).toMatchObject({ created: 2, updated: 0, skipped: 0 });
    expect(dry.errors).toHaveLength(1);
    expect(dry.errors[0]?.index).toBe(2);

    const before = await withTenant(testDb.app.db, tenantId, (tx) =>
      listRecords(tx, { objectId: companyObjectId }),
    );
    expect(before.items).toHaveLength(0); // dry run wrote nothing

    const real = await withTenant(testDb.app.db, tenantId, (tx) =>
      importRecords(tx, { tenantId, objectId: companyObjectId, rows, actor: ACTOR }),
    );
    expect(real).toMatchObject({ created: 2, updated: 0, skipped: 0 });
    const after = await withTenant(testDb.app.db, tenantId, (tx) =>
      listRecords(tx, { objectId: companyObjectId }),
    );
    expect(after.items).toHaveLength(2);
  });

  it('dedupe by attribute value: skip mode and update mode; in-file duplicates too', async () => {
    const skipResult = await withTenant(testDb.app.db, tenantId, (tx) =>
      importRecords(tx, {
        tenantId,
        objectId: companyObjectId,
        rows: [
          { name: 'Import One Again', domain: 'https://one.example' }, // exists → skip
          { name: 'Fresh Co', domain: 'https://fresh.example' },
          { name: 'Fresh Co Dup', domain: 'https://fresh.example' }, // duplicate within the file
        ],
        dedupe: { attributeKey: 'domain', mode: 'skip' },
        actor: ACTOR,
      }),
    );
    expect(skipResult).toMatchObject({ created: 1, updated: 0, skipped: 2, errors: [] });

    const updateResult = await withTenant(testDb.app.db, tenantId, (tx) =>
      importRecords(tx, {
        tenantId,
        objectId: companyObjectId,
        rows: [{ name: 'Fresh Co Renamed', domain: 'https://fresh.example' }],
        dedupe: { attributeKey: 'domain', mode: 'update' },
        actor: ACTOR,
      }),
    );
    expect(updateResult).toMatchObject({ created: 0, updated: 1, skipped: 0 });

    const all = await withTenant(testDb.app.db, tenantId, (tx) =>
      listRecords(tx, { objectId: companyObjectId }),
    );
    const fresh = all.items.find((record) => record.values.domain === 'https://fresh.example');
    expect(fresh?.values.name).toBe('Fresh Co Renamed');
  });

  it('rejects a non-text dedupe key and unknown attributes per row', async () => {
    await expect(
      withTenant(testDb.app.db, tenantId, (tx) =>
        importRecords(tx, {
          tenantId,
          objectId: companyObjectId,
          rows: [{ name: 'X' }],
          dedupe: { attributeKey: 'nope', mode: 'skip' },
          actor: ACTOR,
        }),
      ),
    ).rejects.toMatchObject({ code: 'unknown-attribute' });

    const result = await withTenant(testDb.app.db, tenantId, (tx) =>
      importRecords(tx, {
        tenantId,
        objectId: companyObjectId,
        rows: [{ ghost: 'value' }, {}],
        actor: ACTOR,
      }),
    );
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(2);
  });
});
