/**
 * Proposals (TASK-0037, ai-system.md): agent writes are PROVISIONAL.
 * An agent with the 'record.update' grant may only stage changes here;
 * they become record values when a human accepts the proposal — the
 * apply step runs at the contracts tier via crm's updateRecordValues
 * with the HUMAN reviewer as actor (modules never import modules).
 */
import { proposals, records, writeAuditEntry, type TenantTransaction } from '@drovano/db';
import { can } from '@drovano/permissions';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { loadAgentPrincipal, type Actor } from './agents.js';
import { AgentsError } from './errors.js';

/**
 * Attribute values a proposal may carry — mirrors crm's AttributeValue
 * (modules cannot import modules; the shape is re-validated by crm's
 * type coercion when an accepted proposal is applied).
 */
export type ProposedValue = string | number | boolean | string[];

export interface ProposalSummary {
  id: string;
  recordId: string;
  changes: Record<string, ProposedValue>;
  rationale: string;
  proposedByAgent: string;
  status: 'pending' | 'accepted' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

function isProposedValue(value: unknown): value is ProposedValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function assertChanges(changes: Record<string, unknown>): Record<string, ProposedValue> {
  const keys = Object.keys(changes);
  if (keys.length === 0) {
    throw new AgentsError('invalid-value', 'A proposal must change at least one attribute.');
  }
  for (const key of keys) {
    if (!isProposedValue(changes[key])) {
      throw new AgentsError(
        'invalid-value',
        `'${key}' must be a string, number, boolean, or string array.`,
      );
    }
  }
  return changes as Record<string, ProposedValue>;
}

export interface CreateProposalInput {
  tenantId: string;
  agentId: string;
  recordId: string;
  changes: Record<string, unknown>;
  rationale: string;
}

export async function createProposal(
  tx: TenantTransaction,
  input: CreateProposalInput,
): Promise<ProposalSummary> {
  const changes = assertChanges(input.changes);

  // The agent goes through the same permission gate a human would —
  // proposing an update requires holding the 'record.update' grant.
  const principal = await loadAgentPrincipal(tx, {
    tenantId: input.tenantId,
    agentId: input.agentId,
  });
  const decision = can(principal, { type: 'record.update' });
  if (!decision.allowed) {
    throw new AgentsError('not-permitted', decision.reason);
  }

  const [record] = await tx
    .select({ id: records.id })
    .from(records)
    .where(and(eq(records.id, input.recordId), isNull(records.deletedAt)))
    .limit(1);
  if (record === undefined) {
    throw new AgentsError('unknown-record', 'That record does not exist.');
  }

  const [created] = await tx
    .insert(proposals)
    .values({
      tenantId: input.tenantId,
      recordId: input.recordId,
      changes,
      rationale: input.rationale,
      proposedByAgent: input.agentId,
    })
    .returning({
      id: proposals.id,
      recordId: proposals.recordId,
      changes: proposals.changes,
      rationale: proposals.rationale,
      proposedByAgent: proposals.proposedByAgent,
      status: proposals.status,
      reviewedBy: proposals.reviewedBy,
      reviewedAt: proposals.reviewedAt,
      createdAt: proposals.createdAt,
    });
  if (created === undefined) {
    throw new Error('proposal insert returned no row');
  }

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: 'agent',
    actorId: input.agentId,
    action: 'proposal.create',
    resourceType: 'proposal',
    resourceId: created.id,
    detail: { recordId: input.recordId, keys: Object.keys(changes) },
  });

  return { ...created, changes };
}

export interface ListProposalsInput {
  status?: 'pending' | 'accepted' | 'rejected' | undefined;
}

export async function listProposals(
  tx: TenantTransaction,
  input: ListProposalsInput = {},
): Promise<ProposalSummary[]> {
  const rows = await tx
    .select({
      id: proposals.id,
      recordId: proposals.recordId,
      changes: proposals.changes,
      rationale: proposals.rationale,
      proposedByAgent: proposals.proposedByAgent,
      status: proposals.status,
      reviewedBy: proposals.reviewedBy,
      reviewedAt: proposals.reviewedAt,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .where(input.status === undefined ? undefined : eq(proposals.status, input.status))
    .orderBy(desc(proposals.createdAt));
  return rows.map((row) => ({ ...row, changes: row.changes as Record<string, ProposedValue> }));
}

export interface ReviewProposalInput {
  tenantId: string;
  proposalId: string;
  decision: 'accepted' | 'rejected';
  /** The HUMAN reviewer — accepted changes are applied as this actor. */
  actor: Actor;
}

/**
 * Marks the proposal reviewed and returns it. Does NOT apply the
 * changes — the caller (contracts tier) applies an accepted proposal
 * via crm's updateRecordValues inside the SAME transaction, so the
 * status flip and the record write commit or roll back together.
 */
export async function reviewProposal(
  tx: TenantTransaction,
  input: ReviewProposalInput,
): Promise<ProposalSummary> {
  const [existing] = await tx
    .select({ id: proposals.id, status: proposals.status })
    .from(proposals)
    .where(eq(proposals.id, input.proposalId))
    .limit(1);
  if (existing === undefined) {
    throw new AgentsError('unknown-proposal', 'No proposal with that id exists.');
  }
  if (existing.status !== 'pending') {
    throw new AgentsError('already-reviewed', `This proposal was already ${existing.status}.`);
  }

  const [updated] = await tx
    .update(proposals)
    .set({
      status: input.decision,
      reviewedBy: input.actor.id ?? 'system',
      reviewedAt: new Date(),
    })
    .where(eq(proposals.id, input.proposalId))
    .returning({
      id: proposals.id,
      recordId: proposals.recordId,
      changes: proposals.changes,
      rationale: proposals.rationale,
      proposedByAgent: proposals.proposedByAgent,
      status: proposals.status,
      reviewedBy: proposals.reviewedBy,
      reviewedAt: proposals.reviewedAt,
      createdAt: proposals.createdAt,
    });
  if (updated === undefined) {
    throw new Error('proposal update returned no row');
  }

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: input.decision === 'accepted' ? 'proposal.accept' : 'proposal.reject',
    resourceType: 'proposal',
    resourceId: input.proposalId,
    detail: { recordId: updated.recordId, decision: input.decision },
  });

  return { ...updated, changes: updated.changes as Record<string, ProposedValue> };
}
