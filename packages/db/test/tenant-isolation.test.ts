import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditLog, tenants } from '../src/schema.js';
import { InvalidTenantIdError, withTenant } from '../src/tenancy.js';
import { startTestDatabase, type TestDatabase } from './harness.js';

/**
 * Drizzle wraps Postgres errors ("Failed query: …") with the driver error
 * in `cause`; assert against the whole chain so tests check the database's
 * actual refusal, not the wrapper.
 */
async function expectRejectionMatching(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'expected the operation to be rejected').toBeInstanceOf(Error);
  const messages: string[] = [];
  let current: unknown = caught;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  expect(messages.join(' | ')).toMatch(pattern);
}

/**
 * Tenant-isolation tests for the RLS backstop (TESTING.md rule 4).
 * Every assertion about isolation runs through the app-role connection —
 * the same database posture as the production API.
 */
describe('tenant isolation (RLS backstop)', () => {
  let testDb: TestDatabase;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    // Seed two tenants as the system/owner role (provisioning is never an
    // app-role operation — see schema.ts).
    const seeded = await testDb.owner.db
      .insert(tenants)
      .values([{ name: 'Tenant A' }, { name: 'Tenant B' }])
      .returning({ id: tenants.id, name: tenants.name });
    const byName = new Map(seeded.map((tenant) => [tenant.name, tenant.id]));
    tenantA = byName.get('Tenant A') ?? '';
    tenantB = byName.get('Tenant B') ?? '';
    expect(tenantA).not.toBe('');
    expect(tenantB).not.toBe('');

    // One audit row per tenant, written the blessed way.
    for (const [tenantId, action] of [
      [tenantA, 'test.seed-a'],
      [tenantB, 'test.seed-b'],
    ] as const) {
      await withTenant(testDb.app.db, tenantId, async (tx) => {
        await tx.insert(auditLog).values({
          tenantId,
          actorKind: 'system',
          action,
          resourceType: 'test',
        });
      });
    }
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('a tenant reads only its own rows', async () => {
    const rows = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx.select({ action: auditLog.action, tenantId: auditLog.tenantId }).from(auditLog),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('test.seed-a');
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it('a tenant sees only its own tenants row', async () => {
    const rows = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx.select({ id: tenants.id }).from(tenants),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(tenantA);
  });

  it('cross-tenant INSERT is rejected by WITH CHECK', async () => {
    await expectRejectionMatching(
      withTenant(testDb.app.db, tenantA, (tx) =>
        tx.insert(auditLog).values({
          tenantId: tenantB, // wrong tenant on purpose
          actorKind: 'system',
          action: 'test.cross-tenant-write',
          resourceType: 'test',
        }),
      ),
      /row-level security/i,
    );
  });

  it('cross-tenant rows are invisible even when addressed directly by id', async () => {
    // RLS filters by predicate, not by query shape: naming B's tenant id
    // explicitly must not change what A can see.
    const rows = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(sql`${auditLog.tenantId} = ${tenantB}`),
    );
    expect(rows).toHaveLength(0);
    // NOTE: zero-row UPDATE/DELETE semantics get their test on the first
    // tenant-scoped table that grants UPDATE to the app role (M2,
    // TASK-0021) — audit_log is append-only, so grants deny mutation
    // before RLS is ever consulted (see the append-only test below).
  });

  it('without the tenant GUC, reads return zero rows — the backstop, not an error', async () => {
    const rows = await testDb.app.db.select({ id: auditLog.id }).from(auditLog);
    expect(rows).toHaveLength(0);
  });

  it('without the tenant GUC, writes are rejected', async () => {
    await expectRejectionMatching(
      testDb.app.db.insert(auditLog).values({
        tenantId: tenantA,
        actorKind: 'system',
        action: 'test.no-guc-write',
        resourceType: 'test',
      }),
      /row-level security/i,
    );
  });

  it('the GUC does not leak past the transaction (pooling safety)', async () => {
    await withTenant(testDb.app.db, tenantA, async (tx) => {
      const inside = await tx.select({ id: auditLog.id }).from(auditLog);
      expect(inside).toHaveLength(1);
    });
    // Same pool, after the transaction: setting must be gone.
    const after = await testDb.app.db.select({ id: auditLog.id }).from(auditLog);
    expect(after).toHaveLength(0);
  });

  it('withTenant rejects non-UUID tenant ids before touching the database', async () => {
    await expect(
      withTenant(testDb.app.db, "'; drop table tenants; --", () => Promise.resolve()),
    ).rejects.toThrow(InvalidTenantIdError);
  });

  it('the app role cannot mutate the append-only audit log', async () => {
    // Grants (migration 0001) give drovano_app INSERT + SELECT only.
    await expectRejectionMatching(
      withTenant(testDb.app.db, tenantA, (tx) =>
        tx.update(auditLog).set({ action: 'test.rewritten-history' }),
      ),
      /permission denied/i,
    );
    await expectRejectionMatching(
      withTenant(testDb.app.db, tenantA, (tx) => tx.delete(auditLog)),
      /permission denied/i,
    );
  });
});
