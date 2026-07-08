/**
 * Record keeper worker end-to-end with a stub model (TASK-0038 slice,
 * TESTING.md AI rules: CI never calls a live model): the worker reads,
 * searches (permission-filtered), stages a proposal through the agent
 * grant gate, journals its run into ai_runs, and refuses to start when
 * the tenant is over the monthly spend cap.
 */
import {
  AI_MONTHLY_TOKEN_CAP,
  createAgent,
  createDbRunRecorder,
  setAgentGrants,
  spendThisMonth,
} from '@drovano/agents';
import { createStubLanguageModel, textResponse, toolCallResponse } from '@drovano/ai/testing';
import { createAttributeDefinition, createObjectDefinition, createRecord } from '@drovano/crm';
import { aiRuns, proposals, tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { indexSource } from '@drovano/retrieval';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runRecordKeeper } from '../src/workers/record-keeper.js';

const HUMAN = { kind: 'human', id: '11111111-1111-4111-8111-111111111111' } as const;

describe('record keeper worker (stub model, real database)', () => {
  let testDb: TestDatabase;
  let tenantId: string;
  let recordId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const [tenant] = await testDb.owner.db
      .insert(tenants)
      .values([{ name: 'Keeper Co' }])
      .returning({ id: tenants.id });
    tenantId = tenant?.id ?? '';

    recordId = await withTenant(testDb.app.db, tenantId, async (tx) => {
      const object = await createObjectDefinition(tx, {
        tenantId,
        key: 'company',
        name: 'Company',
        actor: HUMAN,
      });
      for (const attribute of [
        { key: 'name', type: 'text' },
        { key: 'domain', type: 'url' },
      ] as const) {
        await createAttributeDefinition(tx, {
          tenantId,
          objectId: object.id,
          key: attribute.key,
          name: attribute.key,
          type: attribute.type,
          actor: HUMAN,
        });
      }
      const record = await createRecord(tx, {
        tenantId,
        objectId: object.id,
        values: { name: 'Acme' },
        actor: HUMAN,
      });
      await indexSource(tx, {
        tenantId,
        sourceType: 'email',
        sourceId: '00000000-0000-4000-8000-000000000041',
        recordId: record.id,
        text: 'Signature block: Acme Corporation, https://acme.example — sales team.',
      });
      return record.id;
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  async function makeAgent(name: string, grants: string[]): Promise<string> {
    return withTenant(testDb.app.db, tenantId, async (tx) => {
      const agent = await createAgent(tx, {
        tenantId,
        name,
        worker: 'record-keeper',
        actor: HUMAN,
      });
      if (grants.length > 0) {
        await setAgentGrants(tx, { tenantId, agentId: agent.id, actions: grants, actor: HUMAN });
      }
      return agent.id;
    });
  }

  it('reads, searches, stages a proposal, and journals the run', async () => {
    const agentId = await makeAgent('Keeper', ['record.view', 'record.update']);
    const model = createStubLanguageModel([
      toolCallResponse('get_record', {}),
      toolCallResponse('search_workspace', { query: 'Acme domain' }),
      toolCallResponse('stage_proposal', {
        changes: { domain: 'https://acme.example' },
        rationale: 'Email signature (source email/…41) lists https://acme.example as the domain.',
      }),
      textResponse('Staged a domain update for review.'),
    ]);

    const result = await runRecordKeeper(
      { db: testDb.app.db, model },
      { tenantId, agentId, recordId },
    );

    expect(result.proposalIds).toHaveLength(1);
    expect(result.text).toContain('Staged');

    const staged = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx
        .select({
          id: proposals.id,
          status: proposals.status,
          changes: proposals.changes,
          proposedByAgent: proposals.proposedByAgent,
        })
        .from(proposals)
        .where(eq(proposals.recordId, recordId)),
    );
    expect(staged).toHaveLength(1);
    expect(staged[0]?.status).toBe('pending');
    expect(staged[0]?.proposedByAgent).toBe(agentId);
    expect(staged[0]?.changes).toEqual({ domain: 'https://acme.example' });

    const runs = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx
        .select({ worker: aiRuns.worker, agentId: aiRuns.agentId, outcome: aiRuns.outcome })
        .from(aiRuns)
        .where(eq(aiRuns.agentId, agentId)),
    );
    expect(runs).toEqual([{ worker: 'record-keeper', agentId, outcome: 'completed' }]);

    const spent = await withTenant(testDb.app.db, tenantId, (tx) => spendThisMonth(tx, tenantId));
    expect(spent).toBeGreaterThan(0);
  });

  it('an agent without the record.update grant cannot stage proposals', async () => {
    const agentId = await makeAgent('ReadOnly', ['record.view']);
    const model = createStubLanguageModel([
      toolCallResponse('stage_proposal', {
        changes: { name: 'Acme Corporation' },
        rationale: 'Trying without the grant.',
      }),
      textResponse('Could not stage the proposal.'),
    ]);

    const result = await runRecordKeeper(
      { db: testDb.app.db, model },
      { tenantId, agentId, recordId },
    ).catch(() => ({ proposalIds: [] as string[] }));

    expect(result.proposalIds).toHaveLength(0);
    const staged = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx.select({ id: proposals.id }).from(proposals).where(eq(proposals.proposedByAgent, agentId)),
    );
    expect(staged).toHaveLength(0);
  });

  it('refuses to start when the tenant is over the monthly spend cap', async () => {
    const agentId = await makeAgent('Capped', ['record.view', 'record.update']);
    // Burn the whole budget with one synthetic run.
    const recorder = createDbRunRecorder(testDb.app.db, { agentId });
    await recorder.record({
      tenantId,
      worker: 'record-keeper',
      model: 'stub-model',
      steps: 1,
      usage: {
        inputTokens: AI_MONTHLY_TOKEN_CAP,
        outputTokens: 0,
        totalTokens: AI_MONTHLY_TOKEN_CAP,
      },
      outcome: 'completed',
    });

    const model = createStubLanguageModel([textResponse('should never be called')]);
    await expect(
      runRecordKeeper({ db: testDb.app.db, model }, { tenantId, agentId, recordId }),
    ).rejects.toMatchObject({ name: 'AgentsError', code: 'spend-cap-exceeded' });
  });
});
