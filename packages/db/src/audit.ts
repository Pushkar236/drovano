import { auditLog, type ActorKind } from './schema/core.js';
import type { TenantTransaction } from './tenancy.js';

export interface AuditEntry {
  tenantId: string;
  actorKind: ActorKind;
  /** Required for every actor kind except 'system'. */
  actorId?: string;
  /** Verb-object operation name, e.g. 'record.create', 'workspace.invite'. */
  action: string;
  resourceType: string;
  resourceId?: string;
  /** Small structured context (old/new values, target email, …). */
  detail?: Record<string, unknown>;
}

/**
 * Writes an audit entry INSIDE the caller's tenant transaction — audit
 * rows commit or roll back with the mutation they describe, never
 * separately (ARCHITECTURE.md: audit is domain data, written
 * transactionally). RLS WITH CHECK guarantees the entry's tenantId
 * matches the transaction's tenant context; a mismatch fails closed.
 *
 * There is no update/delete counterpart by design: the log is
 * append-only, enforced by grants (migration 0001).
 */
export async function writeAuditEntry(tx: TenantTransaction, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    tenantId: entry.tenantId,
    actorKind: entry.actorKind,
    actorId: entry.actorId ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    detail: entry.detail ?? null,
  });
}
