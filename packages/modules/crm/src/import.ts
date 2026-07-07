import {
  attributeDefinitions,
  records,
  recordValues,
  writeAuditEntry,
  type TenantTransaction,
} from '@drovano/db';
import { and, eq, isNull } from 'drizzle-orm';

import type { Actor } from './definitions.js';
import { CrmError } from './errors.js';
import { createRecord, updateRecordValues } from './records.js';
import { toValueColumns, type AttributeValue } from './values.js';

/**
 * CSV import (TASK-0028). The client parses the file and maps columns to
 * attribute keys; the server receives structured rows so validation,
 * dedupe, and writes all happen behind the same rules as manual entry —
 * every created/updated record goes through the normal services (audit,
 * relation checks) rather than a bulk side door. Callers batch large
 * files across multiple calls (MAX_ROWS_PER_CALL each).
 */
export const MAX_ROWS_PER_CALL = 500;

/** Dedupe keys must live in the text column (lookup by exact value). */
const TEXT_KINDS = new Set(['text', 'url', 'email', 'phone', 'select']);

export interface ImportRecordsInput {
  tenantId: string;
  objectId: string;
  rows: Record<string, AttributeValue>[];
  /** Match rows to existing records by this attribute's exact value. */
  dedupe?: { attributeKey: string; mode: 'skip' | 'update' } | undefined;
  /** Validate + classify only; write nothing. */
  dryRun?: boolean | undefined;
  actor: Actor;
}

export interface ImportRowError {
  index: number;
  message: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
}

export async function importRecords(
  tx: TenantTransaction,
  input: ImportRecordsInput,
): Promise<ImportResult> {
  if (input.rows.length > MAX_ROWS_PER_CALL) {
    throw new CrmError(
      'invalid-value',
      `Import ${String(MAX_ROWS_PER_CALL)} rows per call at most; batch larger files.`,
    );
  }

  const attributes = await tx
    .select({
      id: attributeDefinitions.id,
      key: attributeDefinitions.key,
      type: attributeDefinitions.type,
      archived: attributeDefinitions.archived,
    })
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.objectId, input.objectId));
  if (attributes.length === 0) {
    throw new CrmError('unknown-object', 'That object does not exist or has no attributes.');
  }
  const byKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));

  // Existing values for the dedupe key, one query up front.
  let existingByValue: Map<string, string> | undefined;
  if (input.dedupe !== undefined) {
    const dedupeAttribute = byKey.get(input.dedupe.attributeKey);
    if (dedupeAttribute === undefined) {
      throw new CrmError(
        'unknown-attribute',
        `This object has no "${input.dedupe.attributeKey}" attribute to dedupe by.`,
      );
    }
    if (!TEXT_KINDS.has(dedupeAttribute.type)) {
      throw new CrmError(
        'invalid-value',
        `Dedupe needs a text-like attribute; "${input.dedupe.attributeKey}" is ${dedupeAttribute.type}.`,
      );
    }
    const existing = await tx
      .select({ recordId: recordValues.recordId, value: recordValues.valueText })
      .from(recordValues)
      .innerJoin(records, eq(recordValues.recordId, records.id))
      .where(and(eq(recordValues.attributeId, dedupeAttribute.id), isNull(records.deletedAt)));
    existingByValue = new Map(
      existing.flatMap((row) => (row.value === null ? [] : [[row.value, row.recordId]])),
    );
  }

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const [index, row] of input.rows.entries()) {
    try {
      const entries = Object.entries(row);
      if (entries.length === 0) {
        throw new CrmError('invalid-value', 'The row has no values.');
      }
      for (const [key, value] of entries) {
        const attribute = byKey.get(key);
        if (attribute === undefined) {
          throw new CrmError('unknown-attribute', `This object has no "${key}" attribute.`);
        }
        if (attribute.archived) {
          throw new CrmError('archived-attribute', `"${key}" is archived.`);
        }
        // Validation happens here; the value columns are discarded.
        toValueColumns(key, attribute.type, value);
      }

      const dedupeValue = input.dedupe !== undefined ? row[input.dedupe.attributeKey] : undefined;
      const existingId =
        typeof dedupeValue === 'string' ? existingByValue?.get(dedupeValue) : undefined;

      if (existingId !== undefined && input.dedupe !== undefined) {
        if (input.dedupe.mode === 'skip') {
          result.skipped += 1;
          continue;
        }
        if (!input.dryRun) {
          await updateRecordValues(tx, {
            tenantId: input.tenantId,
            recordId: existingId,
            values: row,
            actor: input.actor,
          });
        }
        result.updated += 1;
        continue;
      }

      if (!input.dryRun) {
        const created = await createRecord(tx, {
          tenantId: input.tenantId,
          objectId: input.objectId,
          values: row,
          actor: input.actor,
        });
        // Later duplicate rows in the same file match this record.
        if (typeof dedupeValue === 'string') {
          existingByValue?.set(dedupeValue, created.id);
        }
      } else if (typeof dedupeValue === 'string') {
        existingByValue?.set(dedupeValue, 'dry-run-placeholder');
      }
      result.created += 1;
    } catch (error) {
      if (error instanceof CrmError) {
        result.errors.push({ index, message: error.message });
      } else {
        throw error;
      }
    }
  }

  if (!input.dryRun) {
    await writeAuditEntry(tx, {
      tenantId: input.tenantId,
      actorKind: input.actor.kind,
      ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
      action: 'record.import',
      resourceType: 'object_definition',
      resourceId: input.objectId,
      detail: {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errorCount: result.errors.length,
      },
    });
  }
  return result;
}
