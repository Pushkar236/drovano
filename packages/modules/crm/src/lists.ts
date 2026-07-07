import {
  attributeDefinitions,
  listEntries,
  listEntryValues,
  lists,
  objectDefinitions,
  records,
  writeAuditEntry,
  type TenantTransaction,
} from '@drovano/db';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

import type { Actor } from './definitions.js';
import { CrmError } from './errors.js';
import { hydrateRecordValues } from './records.js';
import { fromValueColumns, toValueColumns, type AttributeValue } from './values.js';

export interface CreateListInput {
  tenantId: string;
  objectId: string;
  name: string;
  actor: Actor;
}

export async function createList(tx: TenantTransaction, input: CreateListInput) {
  const [object] = await tx
    .select({ id: objectDefinitions.id })
    .from(objectDefinitions)
    .where(eq(objectDefinitions.id, input.objectId));
  if (object === undefined) {
    throw new CrmError('unknown-object', 'That object does not exist.');
  }

  const [created] = await tx
    .insert(lists)
    .values({ tenantId: input.tenantId, objectId: input.objectId, name: input.name })
    .returning();
  if (created === undefined) throw new Error('list insert returned no row');

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'list.create',
    resourceType: 'list',
    resourceId: created.id,
    detail: { objectId: input.objectId, name: input.name },
  });
  return created;
}

export interface AddRecordToListInput {
  tenantId: string;
  listId: string;
  recordId: string;
  actor: Actor;
}

export async function addRecordToList(tx: TenantTransaction, input: AddRecordToListInput) {
  const [list] = await tx
    .select({ id: lists.id, objectId: lists.objectId })
    .from(lists)
    .where(eq(lists.id, input.listId));
  if (list === undefined) {
    throw new CrmError('unknown-list', 'That list does not exist.');
  }
  const [record] = await tx
    .select({ id: records.id, objectId: records.objectId })
    .from(records)
    .where(and(eq(records.id, input.recordId), isNull(records.deletedAt)));
  if (record === undefined) {
    throw new CrmError('unknown-record', 'That record does not exist.');
  }
  if (record.objectId !== list.objectId) {
    throw new CrmError('object-mismatch', 'This list curates a different object than that record.');
  }
  const [existing] = await tx
    .select({ id: listEntries.id })
    .from(listEntries)
    .where(and(eq(listEntries.listId, input.listId), eq(listEntries.recordId, input.recordId)));
  if (existing !== undefined) {
    throw new CrmError('duplicate-key', 'That record is already on this list.');
  }

  const [entry] = await tx
    .insert(listEntries)
    .values({ tenantId: input.tenantId, listId: input.listId, recordId: input.recordId })
    .returning();
  if (entry === undefined) throw new Error('list entry insert returned no row');

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'list.add-record',
    resourceType: 'list_entry',
    resourceId: entry.id,
    detail: { listId: input.listId, recordId: input.recordId },
  });
  return entry;
}

export async function removeRecordFromList(
  tx: TenantTransaction,
  input: AddRecordToListInput,
): Promise<void> {
  const [removed] = await tx
    .delete(listEntries)
    .where(and(eq(listEntries.listId, input.listId), eq(listEntries.recordId, input.recordId)))
    .returning({ id: listEntries.id });
  if (removed === undefined) {
    throw new CrmError('unknown-record', 'That record is not on this list.');
  }
  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'list.remove-record',
    resourceType: 'list_entry',
    resourceId: removed.id,
    detail: { listId: input.listId, recordId: input.recordId },
  });
}

export interface SetListEntryValuesInput {
  tenantId: string;
  entryId: string;
  values: Record<string, AttributeValue>;
  actor: Actor;
}

/** Write list-scoped values on an entry — process state, never the record. */
export async function setListEntryValues(
  tx: TenantTransaction,
  input: SetListEntryValuesInput,
): Promise<void> {
  const [entry] = await tx
    .select({ id: listEntries.id, listId: listEntries.listId })
    .from(listEntries)
    .where(eq(listEntries.id, input.entryId));
  if (entry === undefined) {
    throw new CrmError('unknown-record', 'That list entry does not exist.');
  }

  const listAttributes = await tx
    .select({
      id: attributeDefinitions.id,
      key: attributeDefinitions.key,
      type: attributeDefinitions.type,
      archived: attributeDefinitions.archived,
    })
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.listId, entry.listId));
  const byKey = new Map(listAttributes.map((attribute) => [attribute.key, attribute]));

  for (const [key, value] of Object.entries(input.values)) {
    const attribute = byKey.get(key);
    if (attribute === undefined) {
      throw new CrmError('unknown-attribute', `This list has no "${key}" attribute.`);
    }
    if (attribute.archived) {
      throw new CrmError(
        'archived-attribute',
        `"${key}" is archived and no longer accepts values.`,
      );
    }
    const row = {
      tenantId: input.tenantId,
      entryId: input.entryId,
      attributeId: attribute.id,
      ...toValueColumns(key, attribute.type, value),
    };
    await tx
      .insert(listEntryValues)
      .values(row)
      .onConflictDoUpdate({
        target: [listEntryValues.entryId, listEntryValues.attributeId],
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

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'list_entry.update',
    resourceType: 'list_entry',
    resourceId: input.entryId,
    detail: { keys: Object.keys(input.values) },
  });
}

export interface ListEntryView {
  entryId: string;
  recordId: string;
  /** Entity truth (record attributes). */
  recordValues: Record<string, AttributeValue>;
  /** Process state (list-scoped attributes). */
  entryValues: Record<string, AttributeValue>;
}

export interface ListEntriesPage {
  items: ListEntryView[];
  nextCursor: string | null;
}

export async function listListEntries(
  tx: TenantTransaction,
  input: { listId: string; cursor?: string; limit?: number },
): Promise<ListEntriesPage> {
  const limit = Math.min(input.limit ?? 50, 200);
  const page = await tx
    .select({ id: listEntries.id, recordId: listEntries.recordId })
    .from(listEntries)
    .innerJoin(records, eq(listEntries.recordId, records.id))
    .where(
      and(
        eq(listEntries.listId, input.listId),
        isNull(records.deletedAt),
        ...(input.cursor !== undefined ? [gt(listEntries.id, input.cursor)] : []),
      ),
    )
    .orderBy(asc(listEntries.id))
    .limit(limit + 1);

  const items = page.slice(0, limit);
  const entryIds = items.map((entry) => entry.id);

  const [recordValueMap, entryValueRows] = await Promise.all([
    hydrateRecordValues(
      tx,
      items.map((entry) => entry.recordId),
    ),
    entryIds.length === 0
      ? Promise.resolve([])
      : tx
          .select({
            entryId: listEntryValues.entryId,
            key: attributeDefinitions.key,
            type: attributeDefinitions.type,
            valueText: listEntryValues.valueText,
            valueNumber: listEntryValues.valueNumber,
            valueBoolean: listEntryValues.valueBoolean,
            valueDate: listEntryValues.valueDate,
            valueTimestamp: listEntryValues.valueTimestamp,
            valueUuid: listEntryValues.valueUuid,
            valueJsonb: listEntryValues.valueJsonb,
          })
          .from(listEntryValues)
          .innerJoin(attributeDefinitions, eq(listEntryValues.attributeId, attributeDefinitions.id))
          .where(inArray(listEntryValues.entryId, entryIds)),
  ]);

  const entryValueMap = new Map<string, Record<string, AttributeValue>>();
  for (const row of entryValueRows) {
    const values = entryValueMap.get(row.entryId) ?? {};
    values[row.key] = fromValueColumns(row.type, row);
    entryValueMap.set(row.entryId, values);
  }

  return {
    items: items.map((entry) => ({
      entryId: entry.id,
      recordId: entry.recordId,
      recordValues: recordValueMap.get(entry.recordId) ?? {},
      entryValues: entryValueMap.get(entry.id) ?? {},
    })),
    nextCursor: page.length > limit ? (items[items.length - 1]?.id ?? null) : null,
  };
}
