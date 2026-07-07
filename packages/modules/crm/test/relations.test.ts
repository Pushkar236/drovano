import { auditLog, tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createRecord,
  getRecord,
  listIncomingRelations,
  seedStandardObjects,
  softDeleteRecord,
  updateRecordValues,
  type Actor,
} from '../src/index.js';

const ACTOR: Actor = { kind: 'system' };

describe('relations (typed links over the standard objects)', () => {
  let testDb: TestDatabase;
  let tenantId: string;
  let otherTenantId: string;
  let companyObjectId: string;
  let personObjectId: string;
  let acmeId: string;

  async function objectIdByKey(tenant: string, key: string): Promise<string> {
    const rows = await withTenant(testDb.app.db, tenant, (tx) =>
      tx.query.objectDefinitions.findMany({ where: (o, { eq: whereEq }) => whereEq(o.key, key) }),
    );
    return rows[0]?.id ?? '';
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const seeded = await testDb.owner.db
      .insert(tenants)
      .values([{ name: 'Rel A' }, { name: 'Rel B' }])
      .returning({ id: tenants.id });
    tenantId = seeded[0]?.id ?? '';
    otherTenantId = seeded[1]?.id ?? '';
    for (const tenant of [tenantId, otherTenantId]) {
      await withTenant(testDb.app.db, tenant, (tx) =>
        seedStandardObjects(tx, { tenantId: tenant, actor: ACTOR }),
      );
    }
    companyObjectId = await objectIdByKey(tenantId, 'company');
    personObjectId = await objectIdByKey(tenantId, 'person');

    acmeId = (
      await withTenant(testDb.app.db, tenantId, (tx) =>
        createRecord(tx, {
          tenantId,
          objectId: companyObjectId,
          values: { name: 'Acme' },
          actor: ACTOR,
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('accepts valid relation targets and traverses them in reverse', async () => {
    const people = await withTenant(testDb.app.db, tenantId, async (tx) => {
      const ada = await createRecord(tx, {
        tenantId,
        objectId: personObjectId,
        values: { name: 'Ada', company: acmeId },
        actor: ACTOR,
      });
      const grace = await createRecord(tx, {
        tenantId,
        objectId: personObjectId,
        values: { name: 'Grace', company: acmeId },
        actor: ACTOR,
      });
      return [ada.id, grace.id];
    });

    const incoming = await withTenant(testDb.app.db, tenantId, (tx) =>
      listIncomingRelations(tx, { recordId: acmeId }),
    );
    expect(incoming.items.map((edge) => edge.recordId).sort()).toEqual([...people].sort());
    expect(incoming.items.every((edge) => edge.attributeKey === 'company')).toBe(true);
    expect(incoming.items.every((edge) => edge.objectId === personObjectId)).toBe(true);
  });

  it('rejects targets of the wrong object, nonexistent targets, and cross-tenant targets', async () => {
    await withTenant(testDb.app.db, tenantId, async (tx) => {
      const person = await createRecord(tx, {
        tenantId,
        objectId: personObjectId,
        values: { name: 'Loner' },
        actor: ACTOR,
      });
      // person.company must target a company, not a person.
      await expect(
        updateRecordValues(tx, {
          tenantId,
          recordId: person.id,
          values: { company: person.id },
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'wrong-relation-target' });
      // Nonexistent target.
      await expect(
        updateRecordValues(tx, {
          tenantId,
          recordId: person.id,
          values: { company: '0197a000-dead-7000-8000-000000000001' },
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'unknown-relation-target' });
    });

    // A company that exists only in tenant B is invisible here (RLS) —
    // same failure as nonexistent, leaking nothing.
    const otherCompanyObjectId = await objectIdByKey(otherTenantId, 'company');
    const otherCompany = await withTenant(testDb.app.db, otherTenantId, (tx) =>
      createRecord(tx, {
        tenantId: otherTenantId,
        objectId: otherCompanyObjectId,
        values: { name: 'Foreign Co' },
        actor: ACTOR,
      }),
    );
    await withTenant(testDb.app.db, tenantId, async (tx) => {
      const person = await createRecord(tx, {
        tenantId,
        objectId: personObjectId,
        values: { name: 'Boundary Tester' },
        actor: ACTOR,
      });
      await expect(
        updateRecordValues(tx, {
          tenantId,
          recordId: person.id,
          values: { company: otherCompany.id },
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'unknown-relation-target' });
    });
  });

  it('deleting a record removes incoming edges and audits the count', async () => {
    const doomedCompany = await withTenant(testDb.app.db, tenantId, (tx) =>
      createRecord(tx, {
        tenantId,
        objectId: companyObjectId,
        values: { name: 'Doomed Co' },
        actor: ACTOR,
      }),
    );
    const employee = await withTenant(testDb.app.db, tenantId, (tx) =>
      createRecord(tx, {
        tenantId,
        objectId: personObjectId,
        values: { name: 'Employee', company: doomedCompany.id },
        actor: ACTOR,
      }),
    );

    await withTenant(testDb.app.db, tenantId, (tx) =>
      softDeleteRecord(tx, { tenantId, recordId: doomedCompany.id, actor: ACTOR }),
    );

    // The pointing value is gone — nothing dangles.
    const hydrated = await withTenant(testDb.app.db, tenantId, (tx) => getRecord(tx, employee.id));
    expect(hydrated.values).toEqual({ name: 'Employee' });

    const [audit] = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx
        .select({ detail: auditLog.detail })
        .from(auditLog)
        .where(
          and(eq(auditLog.resourceId, doomedCompany.id), eq(auditLog.action, 'record.delete')),
        ),
    );
    expect(audit?.detail).toMatchObject({ removedIncomingEdges: 1 });
  });
});
