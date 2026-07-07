import { tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAttributeDefinition,
  createObjectDefinition,
  createRecord,
  queryRecords,
  ViewConfig,
  type Actor,
} from '../src/index.js';

const ACTOR: Actor = { kind: 'system' };

const config = (partial: unknown): ViewConfig => ViewConfig.parse(partial);

describe('view execution (filters + sorts over typed-EAV)', () => {
  let testDb: TestDatabase;
  let tenantId: string;
  let objectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const [tenant] = await testDb.owner.db
      .insert(tenants)
      .values({ name: 'Query Tenant' })
      .returning({ id: tenants.id });
    tenantId = tenant?.id ?? '';

    await withTenant(testDb.app.db, tenantId, async (tx) => {
      const object = await createObjectDefinition(tx, {
        tenantId,
        key: 'account',
        name: 'Account',
        actor: ACTOR,
      });
      objectId = object.id;
      for (const [key, type] of [
        ['name', 'text'],
        ['employees', 'number'],
        ['active', 'checkbox'],
      ] as const) {
        await createAttributeDefinition(tx, {
          tenantId,
          objectId,
          key,
          name: key,
          type,
          actor: ACTOR,
        });
      }
      const seed = [
        { name: 'Acme', employees: 50, active: true },
        { name: 'Globex', employees: 500, active: false },
        { name: 'Initech', employees: 5, active: true },
        { name: 'Umbrella', active: true }, // employees unset
      ];
      for (const values of seed) {
        await createRecord(tx, { tenantId, objectId, values, actor: ACTOR });
      }
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  async function names(view: ViewConfig, page?: number): Promise<string[]> {
    const result = await withTenant(testDb.app.db, tenantId, (tx) =>
      queryRecords(tx, { objectId, config: view, ...(page !== undefined ? { page } : {}) }),
    );
    return result.items.map((item) => String(item.values.name));
  }

  it('filters: eq, neq, contains, gt, lt', async () => {
    expect(
      await names(config({ filters: [{ attributeKey: 'name', op: 'eq', value: 'Acme' }] })),
    ).toEqual(['Acme']);
    expect(
      (
        await names(config({ filters: [{ attributeKey: 'active', op: 'eq', value: true }] }))
      ).sort(),
    ).toEqual(['Acme', 'Initech', 'Umbrella']);
    expect(
      await names(config({ filters: [{ attributeKey: 'name', op: 'contains', value: 'tec' }] })),
    ).toEqual(['Initech']);
    expect(
      (
        await names(config({ filters: [{ attributeKey: 'employees', op: 'gt', value: 40 }] }))
      ).sort(),
    ).toEqual(['Acme', 'Globex']);
    expect(
      await names(config({ filters: [{ attributeKey: 'employees', op: 'lt', value: 10 }] })),
    ).toEqual(['Initech']);
    expect(
      (
        await names(config({ filters: [{ attributeKey: 'name', op: 'neq', value: 'Acme' }] }))
      ).sort(),
    ).toEqual(['Globex', 'Initech', 'Umbrella']);
  });

  it('filters: is-set / not-set', async () => {
    expect(
      await names(config({ filters: [{ attributeKey: 'employees', op: 'not-set' }] })),
    ).toEqual(['Umbrella']);
    expect(
      (await names(config({ filters: [{ attributeKey: 'employees', op: 'is-set' }] }))).sort(),
    ).toEqual(['Acme', 'Globex', 'Initech']);
  });

  it('combines filters with AND semantics', async () => {
    expect(
      await names(
        config({
          filters: [
            { attributeKey: 'active', op: 'eq', value: true },
            { attributeKey: 'employees', op: 'gt', value: 10 },
          ],
        }),
      ),
    ).toEqual(['Acme']);
  });

  it('sorts by numeric value with unset values last-stable', async () => {
    expect(
      await names(config({ sorts: [{ attributeKey: 'employees', direction: 'asc' }] })),
    ).toEqual(['Initech', 'Acme', 'Globex', 'Umbrella']);
    expect(
      await names(config({ sorts: [{ attributeKey: 'employees', direction: 'desc' }] })),
    ).toEqual(['Umbrella', 'Globex', 'Acme', 'Initech']);
  });

  it('rejects filters on unknown attributes', async () => {
    await expect(
      withTenant(testDb.app.db, tenantId, (tx) =>
        queryRecords(tx, {
          objectId,
          config: config({ filters: [{ attributeKey: 'ghost', op: 'is-set' }] }),
        }),
      ),
    ).rejects.toMatchObject({ code: 'unknown-attribute' });
  });
});
