/**
 * Agent trust over real Postgres (TASK-0037): grants round-trip through
 * the permission gate, inactive agents fail closed, runs journal into
 * ai_runs and count against the spend cap, proposals live the full
 * provisional-until-accepted lifecycle, and RLS keeps tenants apart.
 */
import {
  agents,
  aiRuns,
  auditLog,
  objectDefinitions,
  records,
  tenants,
  withTenant,
} from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { can } from '@drovano/permissions';
import type { RunRecord } from '@drovano/ai';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AI_MONTHLY_TOKEN_CAP,
  assertSpendWithinCap,
  createAgent,
  createDbRunRecorder,
  createProposal,
  listAgents,
  listProposals,
  loadAgentPrincipal,
  reviewProposal,
  setAgentGrants,
  spendThisMonth,
  type Actor,
} from '../src/index.js';

const HUMAN: Actor = { kind: 'human', id: '11111111-1111-4111-8111-111111111111' };

function runRecord(tenantId: string, totalTokens: number): RunRecord {
  return {
    tenantId,
    worker: 'record-keeper',
    model: 'stub-model',
    steps: 1,
    usage: { inputTokens: totalTokens - 10, outputTokens: 10, totalTokens },
    outcome: 'completed',
  };
}

describe('agent trust (agents, grants, runs, proposals over real Postgres)', () => {
  let testDb: TestDatabase;
  let tenantA: string;
  let tenantB: string;
  let recordId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const seeded = await testDb.owner.db
      .insert(tenants)
      .values([{ name: 'Agents A' }, { name: 'Agents B' }])
      .returning({ id: tenants.id });
    tenantA = seeded[0]?.id ?? '';
    tenantB = seeded[1]?.id ?? '';

    // A record for proposals to target — inserted at the schema level
    // because this module must not import @drovano/crm (module tier).
    recordId = await withTenant(testDb.app.db, tenantA, async (tx) => {
      const [object] = await tx
        .insert(objectDefinitions)
        .values({ tenantId: tenantA, key: 'company', name: 'Company' })
        .returning({ id: objectDefinitions.id });
      if (object === undefined) throw new Error('object seed failed');
      const [record] = await tx
        .insert(records)
        .values({
          tenantId: tenantA,
          objectId: object.id,
          createdByKind: 'system',
          updatedByKind: 'system',
        })
        .returning({ id: records.id });
      if (record === undefined) throw new Error('record seed failed');
      return record.id;
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('creates agents, lists them, and audits the creation', async () => {
    const agent = await withTenant(testDb.app.db, tenantA, (tx) =>
      createAgent(tx, {
        tenantId: tenantA,
        name: 'Record Keeper',
        worker: 'record-keeper',
        actor: HUMAN,
      }),
    );
    expect(agent.active).toBe(true);

    const listed = await withTenant(testDb.app.db, tenantA, (tx) => listAgents(tx));
    expect(listed.map((a) => a.id)).toContain(agent.id);

    const audits = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.resourceId, agent.id)),
    );
    expect(audits.map((a) => a.action)).toContain('agent.create');
  });

  it('round-trips grants through the permission gate and replaces the set idempotently', async () => {
    const agent = await withTenant(testDb.app.db, tenantA, (tx) =>
      createAgent(tx, {
        tenantId: tenantA,
        name: 'Granted',
        worker: 'record-keeper',
        actor: HUMAN,
      }),
    );

    await withTenant(testDb.app.db, tenantA, (tx) =>
      setAgentGrants(tx, {
        tenantId: tenantA,
        agentId: agent.id,
        actions: ['record.view', 'record.update'],
        actor: HUMAN,
      }),
    );

    const principal = await withTenant(testDb.app.db, tenantA, (tx) =>
      loadAgentPrincipal(tx, { tenantId: tenantA, agentId: agent.id }),
    );
    expect(can(principal, { type: 'record.view' }).allowed).toBe(true);
    expect(can(principal, { type: 'record.update' }).allowed).toBe(true);
    expect(can(principal, { type: 'record.create' }).allowed).toBe(false);
    // Non-grantable actions fail closed regardless of the grant set.
    expect(can(principal, { type: 'record.delete' }).allowed).toBe(false);
    expect(can(principal, { type: 'organization.update' }).allowed).toBe(false);

    // Replace-set semantics: a second call fully overwrites the first.
    await withTenant(testDb.app.db, tenantA, (tx) =>
      setAgentGrants(tx, {
        tenantId: tenantA,
        agentId: agent.id,
        actions: ['record.view'],
        actor: HUMAN,
      }),
    );
    const narrowed = await withTenant(testDb.app.db, tenantA, (tx) =>
      loadAgentPrincipal(tx, { tenantId: tenantA, agentId: agent.id }),
    );
    expect(can(narrowed, { type: 'record.update' }).allowed).toBe(false);
    expect(can(narrowed, { type: 'record.view' }).allowed).toBe(true);
  });

  it('rejects non-grantable actions and unknown agents', async () => {
    const agent = await withTenant(testDb.app.db, tenantA, (tx) =>
      createAgent(tx, { tenantId: tenantA, name: 'Bad', worker: 'record-keeper', actor: HUMAN }),
    );
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        setAgentGrants(tx, {
          tenantId: tenantA,
          agentId: agent.id,
          actions: ['record.delete'],
          actor: HUMAN,
        }),
      ),
    ).rejects.toMatchObject({ name: 'AgentsError', code: 'invalid-grant' });

    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        setAgentGrants(tx, {
          tenantId: tenantA,
          agentId: '00000000-0000-4000-8000-000000000000',
          actions: ['record.view'],
          actor: HUMAN,
        }),
      ),
    ).rejects.toMatchObject({ name: 'AgentsError', code: 'unknown-agent' });
  });

  it('strips every grant from an inactive agent (fail closed)', async () => {
    const agent = await withTenant(testDb.app.db, tenantA, (tx) =>
      createAgent(tx, { tenantId: tenantA, name: 'Paused', worker: 'record-keeper', actor: HUMAN }),
    );
    await withTenant(testDb.app.db, tenantA, (tx) =>
      setAgentGrants(tx, {
        tenantId: tenantA,
        agentId: agent.id,
        actions: ['record.view', 'record.update'],
        actor: HUMAN,
      }),
    );
    await withTenant(testDb.app.db, tenantA, (tx) =>
      tx.update(agents).set({ active: false }).where(eq(agents.id, agent.id)),
    );

    const principal = await withTenant(testDb.app.db, tenantA, (tx) =>
      loadAgentPrincipal(tx, { tenantId: tenantA, agentId: agent.id }),
    );
    expect(principal.agentGrants?.size).toBe(0);
    expect(can(principal, { type: 'record.view' }).allowed).toBe(false);
  });

  it('journals runs into ai_runs and enforces the monthly spend cap', async () => {
    const recorder = createDbRunRecorder(testDb.app.db);
    await recorder.record(runRecord(tenantA, 1_000));
    await recorder.record(runRecord(tenantA, 2_500));

    const rows = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx.select({ total: aiRuns.totalTokens }).from(aiRuns),
    );
    expect(rows.map((r) => r.total).sort((a, b) => a - b)).toEqual([1000, 2500]);

    const spent = await withTenant(testDb.app.db, tenantA, (tx) => spendThisMonth(tx, tenantA));
    expect(spent).toBe(3_500);

    // Under the cap: passes. At/over a tiny cap: throws the typed error.
    await withTenant(testDb.app.db, tenantA, (tx) => assertSpendWithinCap(tx, tenantA));
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) => assertSpendWithinCap(tx, tenantA, 3_500)),
    ).rejects.toMatchObject({ name: 'AgentsError', code: 'spend-cap-exceeded' });
    expect(AI_MONTHLY_TOKEN_CAP).toBeGreaterThan(3_500);
  });

  it('never fails the run when journaling breaks (best-effort recorder)', async () => {
    const recorder = createDbRunRecorder(testDb.app.db);
    // Invalid tenant id → RLS/FK failure inside the recorder, swallowed.
    await expect(
      recorder.record(runRecord('00000000-0000-4000-8000-00000000dead', 100)),
    ).resolves.toBeUndefined();
  });

  it('walks a proposal through the provisional-until-accepted lifecycle', async () => {
    const agent = await withTenant(testDb.app.db, tenantA, (tx) =>
      createAgent(tx, {
        tenantId: tenantA,
        name: 'Proposer',
        worker: 'record-keeper',
        actor: HUMAN,
      }),
    );

    // Without the record.update grant the agent may not even propose.
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        createProposal(tx, {
          tenantId: tenantA,
          agentId: agent.id,
          recordId,
          changes: { name: 'Acme (verified)' },
          rationale: 'Website title confirms the legal name.',
        }),
      ),
    ).rejects.toMatchObject({ name: 'AgentsError', code: 'not-permitted' });

    await withTenant(testDb.app.db, tenantA, (tx) =>
      setAgentGrants(tx, {
        tenantId: tenantA,
        agentId: agent.id,
        actions: ['record.update'],
        actor: HUMAN,
      }),
    );

    // Bad payloads are rejected before anything is written.
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        createProposal(tx, {
          tenantId: tenantA,
          agentId: agent.id,
          recordId,
          changes: {},
          rationale: 'empty',
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-value' });
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        createProposal(tx, {
          tenantId: tenantA,
          agentId: agent.id,
          recordId,
          changes: { name: { nested: true } },
          rationale: 'objects are not attribute values',
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-value' });
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        createProposal(tx, {
          tenantId: tenantA,
          agentId: agent.id,
          recordId: '00000000-0000-4000-8000-000000000000',
          changes: { name: 'x' },
          rationale: 'missing record',
        }),
      ),
    ).rejects.toMatchObject({ code: 'unknown-record' });

    const proposal = await withTenant(testDb.app.db, tenantA, (tx) =>
      createProposal(tx, {
        tenantId: tenantA,
        agentId: agent.id,
        recordId,
        changes: { name: 'Acme (verified)', employees: 42 },
        rationale: 'Website title confirms the legal name.',
      }),
    );
    expect(proposal.status).toBe('pending');

    const pending = await withTenant(testDb.app.db, tenantA, (tx) =>
      listProposals(tx, { status: 'pending' }),
    );
    expect(pending.map((p) => p.id)).toContain(proposal.id);

    const accepted = await withTenant(testDb.app.db, tenantA, (tx) =>
      reviewProposal(tx, {
        tenantId: tenantA,
        proposalId: proposal.id,
        decision: 'accepted',
        actor: HUMAN,
      }),
    );
    expect(accepted.status).toBe('accepted');
    expect(accepted.reviewedBy).toBe(HUMAN.id);
    expect(accepted.changes).toEqual({ name: 'Acme (verified)', employees: 42 });

    // Reviews are terminal — a second decision is rejected.
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        reviewProposal(tx, {
          tenantId: tenantA,
          proposalId: proposal.id,
          decision: 'rejected',
          actor: HUMAN,
        }),
      ),
    ).rejects.toMatchObject({ code: 'already-reviewed' });
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        reviewProposal(tx, {
          tenantId: tenantA,
          proposalId: '00000000-0000-4000-8000-000000000000',
          decision: 'accepted',
          actor: HUMAN,
        }),
      ),
    ).rejects.toMatchObject({ code: 'unknown-proposal' });

    const audits = await withTenant(testDb.app.db, tenantA, (tx) =>
      tx
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.resourceId, proposal.id)),
    );
    expect(audits.map((a) => a.action).sort()).toEqual(['proposal.accept', 'proposal.create']);
  });

  it('keeps tenants isolated by RLS across all four tables', async () => {
    const agentsB = await withTenant(testDb.app.db, tenantB, (tx) => listAgents(tx));
    expect(agentsB).toEqual([]);

    const proposalsB = await withTenant(testDb.app.db, tenantB, (tx) => listProposals(tx));
    expect(proposalsB).toEqual([]);

    const spentB = await withTenant(testDb.app.db, tenantB, (tx) => spendThisMonth(tx, tenantB));
    expect(spentB).toBe(0);
  });
});
