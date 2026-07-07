import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { writeAuditEntry } from '../src/audit.js';
import { auditLog, tenants } from '../src/schema/index.js';
import { withTenant } from '../src/tenancy.js';
import { startTestDatabase, type TestDatabase } from './harness.js';

describe('audit writer', () => {
  let testDb: TestDatabase;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const seeded = await testDb.owner.db
      .insert(tenants)
      .values([{ name: 'Audit A' }, { name: 'Audit B' }])
      .returning({ id: tenants.id });
    tenantA = seeded[0]?.id ?? '';
    tenantB = seeded[1]?.id ?? '';
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('writes an entry inside the tenant transaction with jsonb detail intact', async () => {
    await withTenant(testDb.app.db, tenantA, (tx) =>
      writeAuditEntry(tx, {
        tenantId: tenantA,
        actorKind: 'human',
        actorId: '0197a000-0000-7000-8000-00000000000a',
        action: 'workspace.update',
        resourceType: 'workspace',
        detail: { field: 'name', from: 'General', to: 'Sales' },
      }),
    );

    const [entry] = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx
        .select({ action: auditLog.action, detail: auditLog.detail })
        .from(auditLog)
        .where(eq(auditLog.action, 'workspace.update'))
        .orderBy(desc(auditLog.createdAt)),
    );
    expect(entry?.detail).toEqual({ field: 'name', from: 'General', to: 'Sales' });
  });

  it('rolls back with the surrounding mutation', async () => {
    await expect(
      withTenant(testDb.app.db, tenantA, async (tx) => {
        await writeAuditEntry(tx, {
          tenantId: tenantA,
          actorKind: 'system',
          action: 'test.rollback',
          resourceType: 'test',
        });
        throw new Error('mutation failed after audit write');
      }),
    ).rejects.toThrow('mutation failed after audit write');

    const rows = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.action, 'test.rollback')),
    );
    expect(rows).toHaveLength(0);
  });

  it('fails closed when the entry tenant does not match the transaction tenant', async () => {
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        writeAuditEntry(tx, {
          tenantId: tenantB, // mismatch on purpose
          actorKind: 'system',
          action: 'test.cross-tenant-audit',
          resourceType: 'test',
        }),
      ),
    ).rejects.toThrow(); // RLS WITH CHECK violation, wrapped by drizzle
  });
});
