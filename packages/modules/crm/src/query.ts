import { attributeDefinitions, records, recordValues, type TenantTransaction } from '@drovano/db';
import { and, asc, desc, eq, exists, isNull, not, sql, type SQL } from 'drizzle-orm';

import { CrmError } from './errors.js';
import { hydrateRecordValues, type HydratedRecord } from './records.js';
import type { ViewConfig } from './views.js';

/**
 * View execution (TASK-0025 server half): turns a validated ViewConfig
 * into SQL over the typed-EAV. Each filter is an EXISTS probe on
 * record_values riding the (tenant, attribute, value_*) indexes; sorts
 * order by a correlated value subquery with a stable id tiebreaker.
 *
 * Pagination: keyset (id) when unsorted; page-number offset when sorted —
 * sorted views are curated/filtered working sets, and correct multi-type
 * keyset over computed sort values isn't worth its complexity until the
 * benchmark says otherwise.
 */

interface AttributeMeta {
  id: string;
  key: string;
  type: string;
}

function valueColumnFor(type: string) {
  switch (type) {
    case 'number':
    case 'currency':
      return recordValues.valueNumber;
    case 'checkbox':
      return recordValues.valueBoolean;
    case 'date':
      return recordValues.valueDate;
    case 'timestamp':
      return recordValues.valueTimestamp;
    case 'user':
    case 'relation':
      return recordValues.valueUuid;
    case 'multi_select':
      return recordValues.valueJsonb;
    default:
      return recordValues.valueText;
  }
}

function literalFor(type: string, value: string | number | boolean): unknown {
  if (type === 'number' || type === 'currency') return String(Number(value));
  if (type === 'timestamp') return new Date(String(value));
  return value;
}

function filterProbe(
  attribute: AttributeMeta,
  op: ViewConfig['filters'][number]['op'],
  value: string | number | boolean | undefined,
): SQL {
  const column = valueColumnFor(attribute.type);
  const matchValues = and(
    eq(recordValues.recordId, records.id),
    eq(recordValues.attributeId, attribute.id),
  );

  const probe = (condition: SQL | undefined): SQL =>
    exists(sql`(select 1 from ${recordValues} where ${and(matchValues, condition)})`);

  switch (op) {
    case 'is-set':
      return probe(undefined);
    case 'not-set':
      return not(probe(undefined));
    case 'eq':
    case 'neq': {
      if (value === undefined) {
        throw new CrmError('invalid-value', `"${attribute.key}" ${op} filter needs a value.`);
      }
      const condition = sql`${column} = ${literalFor(attribute.type, value)}`;
      return op === 'eq' ? probe(condition) : not(probe(condition));
    }
    case 'contains': {
      if (typeof value !== 'string') {
        throw new CrmError('invalid-value', `"${attribute.key}" contains filter needs text.`);
      }
      return probe(sql`${recordValues.valueText} ilike ${'%' + value + '%'}`);
    }
    case 'gt':
    case 'lt': {
      if (value === undefined) {
        throw new CrmError('invalid-value', `"${attribute.key}" ${op} filter needs a value.`);
      }
      const literal = literalFor(attribute.type, value);
      return probe(op === 'gt' ? sql`${column} > ${literal}` : sql`${column} < ${literal}`);
    }
  }
}

export interface QueryRecordsInput {
  objectId: string;
  config: ViewConfig;
  /** 1-based page when sorted; keyset cursor (record id) when unsorted. */
  page?: number | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface QueryRecordsPage {
  items: HydratedRecord[];
  nextCursor: string | null;
  page: number | null;
}

export async function queryRecords(
  tx: TenantTransaction,
  input: QueryRecordsInput,
): Promise<QueryRecordsPage> {
  const limit = Math.min(input.limit ?? 50, 200);

  // Resolve every referenced attribute once, by key.
  const referencedKeys = [
    ...new Set([
      ...input.config.filters.map((filter) => filter.attributeKey),
      ...input.config.sorts.map((sort) => sort.attributeKey),
    ]),
  ];
  const attributeRows =
    referencedKeys.length === 0
      ? []
      : await tx
          .select({
            id: attributeDefinitions.id,
            key: attributeDefinitions.key,
            type: attributeDefinitions.type,
          })
          .from(attributeDefinitions)
          .where(eq(attributeDefinitions.objectId, input.objectId));
  const attributesByKey = new Map(attributeRows.map((row) => [row.key, row]));
  const resolve = (key: string): AttributeMeta => {
    const attribute = attributesByKey.get(key);
    if (attribute === undefined) {
      throw new CrmError('unknown-attribute', `This object has no "${key}" attribute.`);
    }
    return attribute;
  };

  const conditions: SQL[] = input.config.filters.map((filter) =>
    filterProbe(resolve(filter.attributeKey), filter.op, filter.value),
  );

  const sorted = input.config.sorts.length > 0;
  const orderBy = sorted
    ? [
        ...input.config.sorts.map((sortSpec) => {
          const attribute = resolve(sortSpec.attributeKey);
          const column = valueColumnFor(attribute.type);
          const valueSubquery = sql`(select ${column} from ${recordValues} where ${and(
            eq(recordValues.recordId, records.id),
            eq(recordValues.attributeId, attribute.id),
          )})`;
          return sortSpec.direction === 'asc' ? asc(valueSubquery) : desc(valueSubquery);
        }),
        asc(records.id),
      ]
    : [asc(records.id)];

  const page = sorted ? Math.max(1, input.page ?? 1) : null;
  const rows = await tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.objectId, input.objectId),
        isNull(records.deletedAt),
        ...conditions,
        ...(!sorted && input.cursor !== undefined ? [sql`${records.id} > ${input.cursor}`] : []),
      ),
    )
    .orderBy(...orderBy)
    .limit(limit + 1)
    .offset(sorted ? ((page ?? 1) - 1) * limit : 0);

  const items = rows.slice(0, limit);
  const values = await hydrateRecordValues(
    tx,
    items.map((record) => record.id),
  );

  return {
    items: items.map((record) => ({
      id: record.id,
      objectId: record.objectId,
      values: values.get(record.id) ?? {},
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    })),
    nextCursor: !sorted && rows.length > limit ? (items[items.length - 1]?.id ?? null) : null,
    page: sorted && rows.length > limit ? (page ?? 1) + 1 : null,
  };
}
