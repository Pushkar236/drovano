import { auditLog, recordValues, tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAttributeDefinition,
  createObjectDefinition,
  createRecord,
  CrmError,
  getRecord,
  listRecords,
  softDeleteRecord,
  updateRecordValues,
  type Actor,
} from '../src/index.js';

const ACTOR: Actor = { kind: 'system' };

describe('object graph (typed-EAV over real Postgres)', () => {
  let testDb: TestDatabase;
  let tenantA: string;
  let tenantB: string;
  let companyObjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const seeded = await testDb.owner.db
      .insert(tenants)
      .values([{ name: 'Graph A' }, { name: 'Graph B' }])
      .returning({ id: tenants.id });
    tenantA = seeded[0]?.id ?? '';
    tenantB = seeded[1]?.id ?? '';

    companyObjectId = await withTenant(testDb.app.db, tenantA, async (tx) => {
      const object = await createObjectDefinition(tx, {
        tenantId: tenantA,
        key: 'company',
        name: 'Company',
        actor: ACTOR,
      });
      const attributes = [
        { key: 'name', type: 'text' },
        { key: 'domain', type: 'url' },
        { key: 'employees', type: 'number' },
        { key: 'active', type: 'checkbox' },
        { key: 'stage', type: 'select', config: { options: ['lead', 'customer'] } },
        { key: 'tags', type: 'multi_select', config: { options: ['saas', 'ai', 'fintech'] } },
        { key: 'signed_at', type: 'timestamp' },
      ] as const;
      for (const attribute of attributes) {
        await createAttributeDefinition(tx, {
          tenantId: tenantA,
          objectId: object.id,
          key: attribute.key,
          name: attribute.key,
          type: attribute.type,
          ...('config' in attribute ? { config: attribute.config } : {}),
          actor: ACTOR,
        });
      }
      return object.id;
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('creates and hydrates a record across every value kind', async () => {
    const values = {
      name: 'Acme Corp',
      domain: 'https://acme.example',
      employees: 42,
      active: true,
      stage: 'customer',
      tags: ['saas', 'ai'],
      signed_at: '2026-07-01T12:00:00.000Z',
    };
    const created = await withTenant(testDb.app.db, tenantA, (tx) =>
      createRecord(tx, { tenantId: tenantA, objectId: companyObjectId, values, actor: ACTOR }),
    );
    const fetched = await withTenant(testDb.app.db, tenantA, (tx) => getRecord(tx, created.id));
    expect(fetched.values).toEqual(values);
  });

  it('updates values idempotently and audits create + update', async () => {
    const created = await withTenant(testDb.app.db, tenantA, (tx) =>
      createRecord(tx, {
        tenantId: tenantA,
        objectId: companyObjectId,
        values: { name: 'Globex', employees: 10 },
        actor: ACTOR,
      }),
    );
    await withTenant(testDb.app.db, tenantA, (tx) =>
      updateRecordValues(tx, {
        tenantId: tenantA,
        recordId: created.id,
        values: { employees: 12, stage: 'lead' },
        actor: ACTOR,
      }),
    );
    const fetched = await withTenant(testDb.app.db, tenantA, (tx) => getRecord(tx, created.id));
    expect(fetched.values).toEqual({ name: 'Globex', employees: 12, stage: 'lead' });

    const audits = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.resourceId, created.id)),
    );
    expect(audits.map((a) => a.action).sort()).toEqual(['record.create', 'record.update']);
  });

  it('rejects wrong-typed values, unknown attributes, and bad keys with actionable errors', async () => {
    await withTenant(testDb.app.db, tenantA, async (tx) => {
      await expect(
        createRecord(tx, {
          tenantId: tenantA,
          objectId: companyObjectId,
          values: { employees: 'many' },
          actor: ACTOR,
        }),
      ).rejects.toThrow(CrmError);
      await expect(
        createRecord(tx, {
          tenantId: tenantA,
          objectId: companyObjectId,
          values: { nonexistent: 'x' },
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'unknown-attribute' });
      await expect(
        createObjectDefinition(tx, {
          tenantId: tenantA,
          key: 'Bad Key!',
          name: 'Bad',
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'invalid-key' });
      await expect(
        createObjectDefinition(tx, {
          tenantId: tenantA,
          key: 'company',
          name: 'Dup',
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'duplicate-key' });
    });
  });

  it('paginates with a stable cursor and excludes soft-deleted records', async () => {
    const object = await withTenant(testDb.app.db, tenantA, (tx) =>
      createObjectDefinition(tx, {
        tenantId: tenantA,
        key: 'task_item',
        name: 'Task',
        actor: ACTOR,
      }),
    );
    await withTenant(testDb.app.db, tenantA, async (tx) => {
      await createAttributeDefinition(tx, {
        tenantId: tenantA,
        objectId: object.id,
        key: 'title',
        name: 'Title',
        type: 'text',
        actor: ACTOR,
      });
      for (let i = 0; i < 5; i += 1) {
        await createRecord(tx, {
          tenantId: tenantA,
          objectId: object.id,
          values: { title: `t${String(i)}` },
          actor: ACTOR,
        });
      }
    });

    const pageOne = await withTenant(testDb.app.db, tenantA, (tx) =>
      listRecords(tx, { objectId: object.id, limit: 2 }),
    );
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.nextCursor).not.toBeNull();

    const pageTwo = await withTenant(testDb.app.db, tenantA, (tx) =>
      listRecords(tx, { objectId: object.id, limit: 2, cursor: pageOne.nextCursor ?? '' }),
    );
    expect(pageTwo.items).toHaveLength(2);
    const ids = new Set([...pageOne.items, ...pageTwo.items].map((r) => r.id));
    expect(ids.size).toBe(4);

    const victim = pageTwo.items[0];
    await withTenant(testDb.app.db, tenantA, (tx) =>
      softDeleteRecord(tx, { tenantId: tenantA, recordId: victim?.id ?? '', actor: ACTOR }),
    );
    const all = await withTenant(testDb.app.db, tenantA, (tx) =>
      listRecords(tx, { objectId: object.id, limit: 50 }),
    );
    expect(all.items).toHaveLength(4);
    expect(all.items.some((r) => r.id === victim?.id)).toBe(false);
  });

  it('tenant isolation: definitions, records, and values are invisible across tenants', async () => {
    const rowsB = await withTenant(testDb.app.db, tenantB, (tx) =>
      listRecords(tx, { objectId: companyObjectId, limit: 10 }),
    );
    expect(rowsB.items).toHaveLength(0);
    const valuesB = await withTenant(testDb.app.db, tenantB, (tx) =>
      tx.select({ recordId: recordValues.recordId }).from(recordValues),
    );
    expect(valuesB).toHaveLength(0);
  });

  it('the database rejects multi-kind value rows (typed-EAV backstop)', async () => {
    // Bypass the module on purpose: the CHECK constraint is the last line.
    const record = await withTenant(testDb.app.db, tenantA, (tx) =>
      createRecord(tx, {
        tenantId: tenantA,
        objectId: companyObjectId,
        values: { name: 'Check Constraint Co' },
        actor: ACTOR,
      }),
    );
    const [attribute] = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx.query.attributeDefinitions.findMany({ limit: 1 }),
    );
    await expect(
      testDb.owner.db.insert(recordValues).values({
        tenantId: tenantA,
        recordId: record.id,
        attributeId: attribute?.id ?? '',
        valueText: 'two kinds',
        valueNumber: '42',
        valueBoolean: null,
        valueDate: null,
        valueTimestamp: null,
        valueUuid: null,
        valueJsonb: null,
      }),
    ).rejects.toThrow();
  });
});
