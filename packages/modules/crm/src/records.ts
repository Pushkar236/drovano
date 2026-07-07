import {
  attributeDefinitions,
  records,
  recordValues,
  writeAuditEntry,
  type AttributeType,
  type TenantTransaction,
} from '@drovano/db';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

import { z } from 'zod';

import type { Actor } from './definitions.js';
import { CrmError } from './errors.js';
import {
  assertRelationTargets,
  removeIncomingRelationEdges,
  type RelationTargetCheck,
} from './relations.js';
import { fromValueColumns, toValueColumns, type AttributeValue } from './values.js';

export interface HydratedRecord {
  id: string;
  objectId: string;
  values: Record<string, AttributeValue>;
  createdAt: string;
  updatedAt: string;
}

interface AttributeInfo {
  id: string;
  key: string;
  type: AttributeType;
  archived: boolean;
  config: unknown;
}

async function loadAttributes(
  tx: TenantTransaction,
  objectId: string,
): Promise<Map<string, AttributeInfo>> {
  const rows = await tx
    .select({
      id: attributeDefinitions.id,
      key: attributeDefinitions.key,
      type: attributeDefinitions.type,
      archived: attributeDefinitions.archived,
      config: attributeDefinitions.config,
    })
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.objectId, objectId));
  return new Map(rows.map((row) => [row.key, row]));
}

const RELATION_CONFIG = z.object({ targetObjectId: z.uuid() });

/** Collect relation-typed writes for target verification (relations.ts). */
function relationChecks(
  attributes: Map<string, AttributeInfo>,
  values: Record<string, AttributeValue>,
): RelationTargetCheck[] {
  const checks: RelationTargetCheck[] = [];
  for (const [key, value] of Object.entries(values)) {
    const attribute = attributes.get(key);
    if (attribute?.type !== 'relation' || typeof value !== 'string') continue;
    const config = RELATION_CONFIG.safeParse(attribute.config);
    if (!config.success) {
      throw new CrmError('invalid-value', `"${key}" has no valid relation target configured.`);
    }
    checks.push({
      attributeKey: key,
      targetRecordId: value,
      targetObjectId: config.data.targetObjectId,
    });
  }
  return checks;
}

function buildValueRows(
  tenantId: string,
  recordId: string,
  attributes: Map<string, AttributeInfo>,
  values: Record<string, AttributeValue>,
) {
  return Object.entries(values).map(([key, value]) => {
    const attribute = attributes.get(key);
    if (attribute === undefined) {
      throw new CrmError('unknown-attribute', `This object has no "${key}" attribute.`);
    }
    if (attribute.archived) {
      throw new CrmError(
        'archived-attribute',
        `"${key}" is archived and no longer accepts values.`,
      );
    }
    return {
      tenantId,
      recordId,
      attributeId: attribute.id,
      ...toValueColumns(key, attribute.type, value),
    };
  });
}

export interface CreateRecordInput {
  tenantId: string;
  objectId: string;
  values: Record<string, AttributeValue>;
  actor: Actor;
}

export async function createRecord(
  tx: TenantTransaction,
  input: CreateRecordInput,
): Promise<HydratedRecord> {
  const attributes = await loadAttributes(tx, input.objectId);
  await assertRelationTargets(tx, relationChecks(attributes, input.values));

  const [created] = await tx
    .insert(records)
    .values({
      tenantId: input.tenantId,
      objectId: input.objectId,
      createdByKind: input.actor.kind,
      createdById: input.actor.id ?? null,
      updatedByKind: input.actor.kind,
      updatedById: input.actor.id ?? null,
    })
    .returning();
  if (created === undefined) throw new Error('record insert returned no row');

  const valueRows = buildValueRows(input.tenantId, created.id, attributes, input.values);
  if (valueRows.length > 0) {
    await tx.insert(recordValues).values(valueRows);
  }

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'record.create',
    resourceType: 'record',
    resourceId: created.id,
    detail: { objectId: input.objectId, keys: Object.keys(input.values) },
  });

  return {
    id: created.id,
    objectId: created.objectId,
    values: input.values,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
}

export interface UpdateRecordValuesInput {
  tenantId: string;
  recordId: string;
  values: Record<string, AttributeValue>;
  actor: Actor;
}

export async function updateRecordValues(
  tx: TenantTransaction,
  input: UpdateRecordValuesInput,
): Promise<void> {
  const [record] = await tx
    .select({ id: records.id, objectId: records.objectId })
    .from(records)
    .where(and(eq(records.id, input.recordId), isNull(records.deletedAt)));
  if (record === undefined) {
    throw new CrmError('unknown-record', 'That record does not exist.');
  }

  const attributes = await loadAttributes(tx, record.objectId);
  await assertRelationTargets(tx, relationChecks(attributes, input.values));
  const valueRows = buildValueRows(input.tenantId, input.recordId, attributes, input.values);

  for (const row of valueRows) {
    await tx
      .insert(recordValues)
      .values(row)
      .onConflictDoUpdate({
        target: [recordValues.recordId, recordValues.attributeId],
        set: {
          valueText: row.valueText,
          valueNumber: row.valueNumber,
          valueBoolean: row.valueBoolean,
          valueDate: row.valueDate,
          valueTimestamp: row.valueTimestamp,
          valueUuid: row.valueUuid,
          valueJsonb: row.valueJsonb,
          updatedAt: new Date(),
        },
      });
  }
  await tx
    .update(records)
    .set({
      updatedByKind: input.actor.kind,
      updatedById: input.actor.id ?? null,
    })
    .where(eq(records.id, input.recordId));

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'record.update',
    resourceType: 'record',
    resourceId: input.recordId,
    detail: { keys: Object.keys(input.values) },
  });
}

export async function softDeleteRecord(
  tx: TenantTransaction,
  input: { tenantId: string; recordId: string; actor: Actor },
): Promise<void> {
  const [deleted] = await tx
    .update(records)
    .set({
      deletedAt: new Date(),
      updatedByKind: input.actor.kind,
      updatedById: input.actor.id ?? null,
    })
    .where(and(eq(records.id, input.recordId), isNull(records.deletedAt)))
    .returning({ id: records.id });
  if (deleted === undefined) {
    throw new CrmError('unknown-record', 'That record does not exist.');
  }
  // Nothing may dangle (data-model.md §3 invariant 5): incoming relation
  // edges are removed with the record.
  const removedEdges = await removeIncomingRelationEdges(tx, input.recordId);
  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'record.delete',
    resourceType: 'record',
    resourceId: input.recordId,
    detail: { removedIncomingEdges: removedEdges },
  });
}

/** Batch-hydrate record values for a set of record ids (shared with lists). */
export async function hydrateRecordValues(
  tx: TenantTransaction,
  recordIds: string[],
): Promise<Map<string, Record<string, AttributeValue>>> {
  const hydrated = new Map<string, Record<string, AttributeValue>>();
  if (recordIds.length === 0) return hydrated;

  const rows = await tx
    .select({
      recordId: recordValues.recordId,
      key: attributeDefinitions.key,
      type: attributeDefinitions.type,
      valueText: recordValues.valueText,
      valueNumber: recordValues.valueNumber,
      valueBoolean: recordValues.valueBoolean,
      valueDate: recordValues.valueDate,
      valueTimestamp: recordValues.valueTimestamp,
      valueUuid: recordValues.valueUuid,
      valueJsonb: recordValues.valueJsonb,
    })
    .from(recordValues)
    .innerJoin(attributeDefinitions, eq(recordValues.attributeId, attributeDefinitions.id))
    .where(inArray(recordValues.recordId, recordIds));

  for (const row of rows) {
    const values = hydrated.get(row.recordId) ?? {};
    values[row.key] = fromValueColumns(row.type, row);
    hydrated.set(row.recordId, values);
  }
  return hydrated;
}

export async function getRecord(tx: TenantTransaction, recordId: string): Promise<HydratedRecord> {
  const [record] = await tx
    .select()
    .from(records)
    .where(and(eq(records.id, recordId), isNull(records.deletedAt)));
  if (record === undefined) {
    throw new CrmError('unknown-record', 'That record does not exist.');
  }
  const values = await hydrateRecordValues(tx, [record.id]);
  return {
    id: record.id,
    objectId: record.objectId,
    values: values.get(record.id) ?? {},
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export interface ListRecordsInput {
  objectId: string;
  /** Cursor = last record id of the previous page (uuidv7 is time-ordered). */
  cursor?: string;
  limit?: number;
}

export interface RecordPage {
  items: HydratedRecord[];
  nextCursor: string | null;
}

export async function listRecords(
  tx: TenantTransaction,
  input: ListRecordsInput,
): Promise<RecordPage> {
  const limit = Math.min(input.limit ?? 50, 200);
  const page = await tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.objectId, input.objectId),
        isNull(records.deletedAt),
        ...(input.cursor !== undefined ? [gt(records.id, input.cursor)] : []),
      ),
    )
    .orderBy(asc(records.id))
    .limit(limit + 1);

  const items = page.slice(0, limit);
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
    nextCursor: page.length > limit ? (items[items.length - 1]?.id ?? null) : null,
  };
}
