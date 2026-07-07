import { attributeDefinitions, objectDefinitions, tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedStandardObjects, type Actor } from '../src/index.js';

const ACTOR: Actor = { kind: 'system' };

describe('standard-object catalog', () => {
  let testDb: TestDatabase;
  let tenantId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const [tenant] = await testDb.owner.db
      .insert(tenants)
      .values({ name: 'Catalog Tenant' })
      .returning({ id: tenants.id });
    tenantId = tenant?.id ?? '';
    await withTenant(testDb.app.db, tenantId, (tx) =>
      seedStandardObjects(tx, { tenantId, actor: ACTOR }),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('seeds company, person, and deal as standard objects', async () => {
    const objects = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx
        .select({ key: objectDefinitions.key, kind: objectDefinitions.kind })
        .from(objectDefinitions),
    );
    expect(objects.map((o) => o.key).sort()).toEqual(['company', 'deal', 'person']);
    expect(objects.every((o) => o.kind === 'standard')).toBe(true);
  });

  it('system attributes exist with correctly wired relation targets', async () => {
    const rows = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx
        .select({
          objectKey: objectDefinitions.key,
          key: attributeDefinitions.key,
          type: attributeDefinitions.type,
          system: attributeDefinitions.system,
          config: attributeDefinitions.config,
        })
        .from(attributeDefinitions)
        .innerJoin(objectDefinitions, eq(attributeDefinitions.objectId, objectDefinitions.id)),
    );
    expect(rows.every((row) => row.system)).toBe(true);

    const byObject = new Map<string, string[]>();
    for (const row of rows) {
      byObject.set(row.objectKey, [...(byObject.get(row.objectKey) ?? []), row.key]);
    }
    expect(byObject.get('company')?.sort()).toEqual(['domain', 'name']);
    expect(byObject.get('person')?.sort()).toEqual(['company', 'email', 'name', 'phone', 'title']);
    expect(byObject.get('deal')?.sort()).toEqual([
      'amount',
      'close_date',
      'company',
      'name',
      'primary_contact',
    ]);

    // Relations resolve to the seeded objects, per tenant.
    const objects = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx.select({ id: objectDefinitions.id, key: objectDefinitions.key }).from(objectDefinitions),
    );
    const idByKey = new Map(objects.map((o) => [o.key, o.id]));
    const personCompany = rows.find((r) => r.objectKey === 'person' && r.key === 'company');
    expect(personCompany?.config).toEqual({ targetObjectId: idByKey.get('company') });
    const dealContact = rows.find((r) => r.objectKey === 'deal' && r.key === 'primary_contact');
    expect(dealContact?.config).toEqual({ targetObjectId: idByKey.get('person') });
  });

  it('is idempotent: reseeding creates no duplicates', async () => {
    await withTenant(testDb.app.db, tenantId, (tx) =>
      seedStandardObjects(tx, { tenantId, actor: ACTOR }),
    );
    const objects = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx.select({ id: objectDefinitions.id }).from(objectDefinitions),
    );
    expect(objects).toHaveLength(3);
    const attributes = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx.select({ id: attributeDefinitions.id }).from(attributeDefinitions),
    );
    expect(attributes).toHaveLength(12);
  });
});
