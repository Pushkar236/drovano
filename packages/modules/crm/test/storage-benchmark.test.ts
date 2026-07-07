import { performance } from 'node:perf_hooks';

import { recordValues, tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { and, eq, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAttributeDefinition,
  createObjectDefinition,
  getRecord,
  listRecords,
  type Actor,
} from '../src/index.js';

/**
 * Storage-engine benchmark (TASK-0021; PRD §5 NFR: 1M records per
 * workspace without perceptible degradation). Seeded server-side with
 * generate_series so scale costs seconds, not minutes. Default scale
 * keeps PR runs fast; the full NFR run sets DROVANO_BENCH_SCALE=1000000.
 * Budgets are the PRD's server-side numbers — real query plans over the
 * tenant-leading indexes, through RLS, on the app role.
 */
const SCALE = Number(process.env.DROVANO_BENCH_SCALE ?? 100_000);
const ITERATIONS = 12;
const SINGLE_READ_BUDGET_MS = 150;
const LIST_READ_BUDGET_MS = 300;

const ACTOR: Actor = { kind: 'system' };

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

async function measure(run: () => Promise<unknown>): Promise<number> {
  for (let i = 0; i < 2; i += 1) await run(); // warm-up
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  return p95(samples);
}

describe(`storage benchmark @ ${String(SCALE)} records`, () => {
  let testDb: TestDatabase;
  let tenantId: string;
  let objectId: string;
  let nameAttributeId: string;
  let employeesAttributeId: string;
  let middleRecordId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const [tenant] = await testDb.owner.db
      .insert(tenants)
      .values({ name: 'Bench Tenant' })
      .returning({ id: tenants.id });
    tenantId = tenant?.id ?? '';

    ({ objectId, nameAttributeId, employeesAttributeId } = await withTenant(
      testDb.app.db,
      tenantId,
      async (tx) => {
        const object = await createObjectDefinition(tx, {
          tenantId,
          key: 'bench_company',
          name: 'Company',
          actor: ACTOR,
        });
        const name = await createAttributeDefinition(tx, {
          tenantId,
          objectId: object.id,
          key: 'name',
          name: 'Name',
          type: 'text',
          actor: ACTOR,
        });
        const employees = await createAttributeDefinition(tx, {
          tenantId,
          objectId: object.id,
          key: 'employees',
          name: 'Employees',
          type: 'number',
          actor: ACTOR,
        });
        return {
          objectId: object.id,
          nameAttributeId: name.id,
          employeesAttributeId: employees.id,
        };
      },
    ));

    // Server-side seeding (owner role: seeding is provisioning, not the
    // path under test). Batched data-modifying CTEs: each statement seeds
    // one slice of records plus both value rows — single-statement 1M×3
    // inserts spiked the container's memory and killed Postgres.
    // Bulk-load discipline: index maintenance across millions of inserts
    // is the main WAL/memory driver — drop, seed, rebuild.
    await testDb.owner.pool.query(`
      drop index record_values_text_idx, record_values_number_idx,
                 record_values_timestamp_idx, record_values_uuid_idx,
                 records_tenant_object_created_idx`);

    const BATCH = 50_000;
    for (let seeded = 0; seeded < SCALE; seeded += BATCH) {
      const batchSize = Math.min(BATCH, SCALE - seeded);
      await testDb.owner.pool.query(
        `with new_records as (
           insert into records (tenant_id, object_id, created_by_kind, updated_by_kind)
           select $1, $2, 'system', 'system' from generate_series(1, $3)
           returning tenant_id, id
         ),
         names as (
           insert into record_values (tenant_id, record_id, attribute_id, value_text)
           select tenant_id, id, $4, 'Company ' || id from new_records
         )
         insert into record_values (tenant_id, record_id, attribute_id, value_number)
         select tenant_id, id, $5, floor(random() * 10000) from new_records`,
        [tenantId, objectId, batchSize, nameAttributeId, employeesAttributeId],
      );
    }
    await testDb.owner.pool.query(`
      create index records_tenant_object_created_idx on records (tenant_id, object_id, id);
      create index record_values_text_idx on record_values (tenant_id, attribute_id, value_text);
      create index record_values_number_idx on record_values (tenant_id, attribute_id, value_number);
      create index record_values_timestamp_idx on record_values (tenant_id, attribute_id, value_timestamp);
      create index record_values_uuid_idx on record_values (tenant_id, attribute_id, value_uuid)`);
    await testDb.owner.pool.query('analyze records, record_values');

    const middle = await testDb.owner.pool.query(
      `select id from records where object_id = $1 order by id offset $2 limit 1`,
      [objectId, Math.floor(SCALE / 2)],
    );
    middleRecordId = (middle.rows[0] as { id: string }).id;
  }, 600_000);

  afterAll(async () => {
    await testDb.stop();
  });

  it(`first list page p95 < ${String(LIST_READ_BUDGET_MS)}ms`, async () => {
    const latency = await measure(() =>
      withTenant(testDb.app.db, tenantId, (tx) => listRecords(tx, { objectId, limit: 50 })),
    );
    expect(latency).toBeLessThan(LIST_READ_BUDGET_MS);
  });

  it(`deep cursor page (offset ~${String(Math.floor(SCALE / 2))}) p95 < ${String(LIST_READ_BUDGET_MS)}ms`, async () => {
    const latency = await measure(() =>
      withTenant(testDb.app.db, tenantId, (tx) =>
        listRecords(tx, { objectId, limit: 50, cursor: middleRecordId }),
      ),
    );
    expect(latency).toBeLessThan(LIST_READ_BUDGET_MS);
  });

  it(`single hydrated record p95 < ${String(SINGLE_READ_BUDGET_MS)}ms`, async () => {
    const latency = await measure(() =>
      withTenant(testDb.app.db, tenantId, (tx) => getRecord(tx, middleRecordId)),
    );
    expect(latency).toBeLessThan(SINGLE_READ_BUDGET_MS);
  });

  it(`indexed value filter p95 < ${String(LIST_READ_BUDGET_MS)}ms`, async () => {
    const latency = await measure(() =>
      withTenant(testDb.app.db, tenantId, (tx) =>
        tx
          .select({ recordId: recordValues.recordId })
          .from(recordValues)
          .where(
            and(
              eq(recordValues.attributeId, employeesAttributeId),
              gt(recordValues.valueNumber, sql`9900`),
            ),
          )
          .limit(50),
      ),
    );
    expect(latency).toBeLessThan(LIST_READ_BUDGET_MS);
  });
});
