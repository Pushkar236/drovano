import { attributeDefinitions, records, recordValues, type TenantTransaction } from '@drovano/db';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

import { CrmError } from './errors.js';

export interface RelationTargetCheck {
  attributeKey: string;
  targetRecordId: string;
  targetObjectId: string;
}

/**
 * Relation integrity at write time (data-model.md §3 invariant 5): every
 * relation value must point at an existing, non-deleted record of the
 * configured target object — in this tenant (RLS makes foreign tenants'
 * records simply not exist here).
 */
export async function assertRelationTargets(
  tx: TenantTransaction,
  checks: RelationTargetCheck[],
): Promise<void> {
  if (checks.length === 0) return;

  const targets = await tx
    .select({ id: records.id, objectId: records.objectId })
    .from(records)
    .where(
      and(
        inArray(
          records.id,
          checks.map((check) => check.targetRecordId),
        ),
        isNull(records.deletedAt),
      ),
    );
  const objectByRecordId = new Map(targets.map((target) => [target.id, target.objectId]));

  for (const check of checks) {
    const actualObjectId = objectByRecordId.get(check.targetRecordId);
    if (actualObjectId === undefined) {
      throw new CrmError(
        'unknown-relation-target',
        `"${check.attributeKey}" points at a record that doesn't exist (or was deleted).`,
      );
    }
    if (actualObjectId !== check.targetObjectId) {
      throw new CrmError(
        'wrong-relation-target',
        `"${check.attributeKey}" must point at a record of its configured object.`,
      );
    }
  }
}

export interface IncomingRelation {
  recordId: string;
  objectId: string;
  attributeId: string;
  attributeKey: string;
}

export interface ListIncomingRelationsInput {
  recordId: string;
  /** Cursor = last source record id of the previous page. */
  cursor?: string;
  limit?: number;
}

export interface IncomingRelationsPage {
  items: IncomingRelation[];
  nextCursor: string | null;
}

/**
 * Reverse traversal: who points at this record? ("all deals on this
 * company"). Rides the (tenant_id, attribute_id, value_uuid) index via
 * the value_uuid predicate; soft-deleted sources are excluded.
 */
export async function listIncomingRelations(
  tx: TenantTransaction,
  input: ListIncomingRelationsInput,
): Promise<IncomingRelationsPage> {
  const limit = Math.min(input.limit ?? 50, 200);
  const rows = await tx
    .select({
      recordId: recordValues.recordId,
      objectId: records.objectId,
      attributeId: recordValues.attributeId,
      attributeKey: attributeDefinitions.key,
    })
    .from(recordValues)
    .innerJoin(records, eq(recordValues.recordId, records.id))
    .innerJoin(attributeDefinitions, eq(recordValues.attributeId, attributeDefinitions.id))
    .where(
      and(
        eq(recordValues.valueUuid, input.recordId),
        eq(attributeDefinitions.type, 'relation'),
        isNull(records.deletedAt),
        ...(input.cursor !== undefined ? [gt(recordValues.recordId, input.cursor)] : []),
      ),
    )
    .orderBy(asc(recordValues.recordId))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? (items[items.length - 1]?.recordId ?? null) : null,
  };
}

/**
 * Tombstone incoming edges when a record is deleted: pointing values are
 * removed so nothing dangles (timelines and outgoing values live on the
 * deleted record itself and vanish with it from all reads).
 * Returns how many edges were removed (recorded in the delete audit).
 */
export async function removeIncomingRelationEdges(
  tx: TenantTransaction,
  recordId: string,
): Promise<number> {
  // Only 'relation' values point at records; 'user' values point at
  // principals and survive record deletion.
  const relationAttributes = tx
    .select({ id: attributeDefinitions.id })
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.type, 'relation'));

  const removed = await tx
    .delete(recordValues)
    .where(
      and(
        eq(recordValues.valueUuid, recordId),
        inArray(recordValues.attributeId, relationAttributes),
      ),
    )
    .returning({ recordId: recordValues.recordId });
  return removed.length;
}
