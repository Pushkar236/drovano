import { auditLog, type TenantTransaction } from '@drovano/db';
import { and, desc, eq, lt } from 'drizzle-orm';

/**
 * Record activity (TASK-0027): the audit trail IS the v1 timeline — every
 * mutation already writes one transactional entry, so the timeline needs
 * no second write path that could drift from the truth.
 */
export interface ActivityEntry {
  id: string;
  action: string;
  actorKind: string;
  actorId: string | null;
  detail: unknown;
  at: string;
}

export interface ActivityPage {
  items: ActivityEntry[];
  nextCursor: string | null;
}

export async function listRecordActivity(
  tx: TenantTransaction,
  input: { recordId: string; cursor?: string | undefined; limit?: number | undefined },
): Promise<ActivityPage> {
  const limit = Math.min(input.limit ?? 25, 100);
  const rows = await tx
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorKind: auditLog.actorKind,
      actorId: auditLog.actorId,
      detail: auditLog.detail,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.resourceType, 'record'),
        eq(auditLog.resourceId, input.recordId),
        // uuidv7 ids are time-ordered; the id doubles as the cursor.
        ...(input.cursor !== undefined ? [lt(auditLog.id, input.cursor)] : []),
      ),
    )
    .orderBy(desc(auditLog.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  return {
    items: items.map((row) => ({
      id: row.id,
      action: row.action,
      actorKind: row.actorKind,
      actorId: row.actorId,
      detail: row.detail,
      at: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null,
  };
}
