import { randomUUID } from 'node:crypto';

import { createProposal } from '@drovano/agents';
import { createStubLanguageModel, textResponse, toolCallResponse } from '@drovano/ai/testing';
import { createCaller, createRequestContext, type WorkerRuns } from '@drovano/api-contracts';
import { seedStandardObjects } from '@drovano/crm';
import { auditLog, members, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { createAuth, type Auth } from '@drovano/identity';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runRecordKeeper } from '../src/workers/record-keeper.js';

const PASSWORD = 'a-long-test-password-1';

/**
 * The agent trust surface end-to-end (TASK-0037): owners manage agents
 * and grants, agents stage proposals, and a human review applies (or
 * discards) the changes through the normal crm + audit path.
 */
describe('agents tRPC surface (real database, real sessions)', () => {
  let testDb: TestDatabase;
  let auth: Auth;
  let ownerCaller: Awaited<ReturnType<typeof callerFor>>;
  let ownerHeaders: Headers;
  let ownerUserId: string;
  let organizationId: string;
  let tenantId: string;
  let companyObjectId: string;

  function cookieHeaders(headers: Headers): Headers {
    const pairs = headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .filter((pair): pair is string => pair !== undefined && pair !== '');
    return new Headers({ cookie: pairs.join('; ') });
  }

  async function signUp(email: string, name: string): Promise<Headers> {
    const { headers } = await auth.api.signUpEmail({
      body: { email, name, password: PASSWORD },
      returnHeaders: true,
    });
    return cookieHeaders(headers);
  }

  async function callerFor(headers: Headers) {
    return createCaller(await createRequestContext({ db: testDb.app.db, auth, headers }));
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    auth = createAuth({
      db: testDb.app.db,
      secret: 'integration-test-secret-at-least-32-chars-long', // gitleaks:allow — intentional test dummy
      baseUrl: 'http://localhost:3000',
      mailer: { send: () => Promise.resolve() },
      afterOrganizationProvisioned: ({ tenantId: seededTenant }) =>
        withTenant(testDb.app.db, seededTenant, (tx) =>
          seedStandardObjects(tx, { tenantId: seededTenant, actor: { kind: 'system' } }),
        ),
    });

    ownerHeaders = await signUp('agents-owner@example.com', 'Owner');
    const ownerSession = await auth.api.getSession({ headers: ownerHeaders });
    ownerUserId = ownerSession?.user.id ?? '';
    const organization = await auth.api.createOrganization({
      body: { name: 'Agents Org', slug: 'agents-org' },
      headers: ownerHeaders,
    });
    organizationId = organization.id;
    tenantId = organizationId;
    await auth.api.setActiveOrganization({ body: { organizationId }, headers: ownerHeaders });
    ownerCaller = await callerFor(ownerHeaders);

    const definitions = await ownerCaller.crm.objects();
    companyObjectId = definitions.objects.find((o) => o.key === 'company')?.id ?? '';
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('owner creates an agent, sets grants, and lists it; members may not manage', async () => {
    const agent = await ownerCaller.agents.create({
      name: 'Record Keeper',
      worker: 'record-keeper',
    });
    await ownerCaller.agents.setGrants({
      agentId: agent.id,
      actions: ['record.view', 'record.update'],
    });

    const listed = await ownerCaller.agents.list();
    expect(listed.map((a) => a.id)).toContain(agent.id);

    const memberHeaders = await signUp('agents-member@example.com', 'Member');
    const session = await auth.api.getSession({ headers: memberHeaders });
    await testDb.owner.db.insert(members).values({
      id: randomUUID(),
      organizationId,
      userId: session?.user.id ?? '',
      role: 'member',
    });
    await auth.api.setActiveOrganization({ body: { organizationId }, headers: memberHeaders });
    const memberCaller = await callerFor(memberHeaders);

    // Members can SEE agents (record.view) but not manage them.
    const memberView = await memberCaller.agents.list();
    expect(memberView.map((a) => a.id)).toContain(agent.id);
    await expect(
      memberCaller.agents.create({ name: 'Rogue', worker: 'record-keeper' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      memberCaller.agents.setGrants({ agentId: agent.id, actions: [] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('non-grantable actions are rejected at the schema boundary', async () => {
    const agent = await ownerCaller.agents.create({ name: 'Narrow', worker: 'record-keeper' });
    await expect(
      ownerCaller.agents.setGrants({ agentId: agent.id, actions: ['record.delete'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('accepting a proposal applies the changes as the HUMAN reviewer, atomically', async () => {
    const record = await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Acme' },
    });
    const agent = await ownerCaller.agents.create({ name: 'Enricher', worker: 'record-keeper' });
    await ownerCaller.agents.setGrants({ agentId: agent.id, actions: ['record.update'] });

    // The harness stages proposals through the module (no public write path).
    const proposal = await withTenant(testDb.app.db, tenantId, (tx) =>
      createProposal(tx, {
        tenantId,
        agentId: agent.id,
        recordId: record.id,
        changes: { name: 'Acme Corporation', domain: 'https://acme.example' },
        rationale: 'Registry lookup confirms the legal name and domain.',
      }),
    );

    const pending = await ownerCaller.agents.proposals.list({ status: 'pending' });
    expect(pending.map((p) => p.id)).toContain(proposal.id);
    expect(pending.find((p) => p.id === proposal.id)?.rationale).toContain('Registry lookup');

    const reviewed = await ownerCaller.agents.proposals.review({
      proposalId: proposal.id,
      decision: 'accepted',
    });
    expect(reviewed.status).toBe('accepted');

    // The record now carries the proposed values…
    const fetched = await ownerCaller.crm.records.get({ recordId: record.id });
    expect(fetched.values).toEqual({ name: 'Acme Corporation', domain: 'https://acme.example' });

    // …and the audit trail shows the HUMAN accepting + updating.
    const audits = await withTenant(testDb.app.db, tenantId, (tx) =>
      tx
        .select({
          action: auditLog.action,
          actorKind: auditLog.actorKind,
          actorId: auditLog.actorId,
        })
        .from(auditLog)
        .where(eq(auditLog.resourceId, record.id)),
    );
    const update = audits.find((a) => a.action === 'record.update');
    expect(update?.actorKind).toBe('human');
    expect(update?.actorId).toBe(ownerUserId);

    // Reviews are terminal.
    await expect(
      ownerCaller.agents.proposals.review({ proposalId: proposal.id, decision: 'rejected' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejecting a proposal leaves the record untouched', async () => {
    const record = await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Globex' },
    });
    const agent = await ownerCaller.agents.create({ name: 'Wrong', worker: 'record-keeper' });
    await ownerCaller.agents.setGrants({ agentId: agent.id, actions: ['record.update'] });

    const proposal = await withTenant(testDb.app.db, tenantId, (tx) =>
      createProposal(tx, {
        tenantId,
        agentId: agent.id,
        recordId: record.id,
        changes: { name: 'Globex Ltd (unverified)' },
        rationale: 'Weak signal from a directory site.',
      }),
    );

    const reviewed = await ownerCaller.agents.proposals.review({
      proposalId: proposal.id,
      decision: 'rejected',
    });
    expect(reviewed.status).toBe('rejected');

    const fetched = await ownerCaller.crm.records.get({ recordId: record.id });
    expect(fetched.values).toEqual({ name: 'Globex' });
  });

  it('workers.recordKeeper: disabled without a model, runs the real worker with one', async () => {
    const record = await ownerCaller.crm.records.create({
      objectId: companyObjectId,
      values: { name: 'Initech' },
    });
    const agent = await ownerCaller.agents.create({ name: 'Keeper', worker: 'record-keeper' });
    await ownerCaller.agents.setGrants({
      agentId: agent.id,
      actions: ['record.view', 'record.update'],
    });

    // Default context carries no workers → the capability is disabled.
    await expect(
      ownerCaller.agents.workers.recordKeeper({ agentId: agent.id, recordId: record.id }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // Inject the real worker with a stub model — the exact main.ts shape.
    const model = createStubLanguageModel([
      toolCallResponse('stage_proposal', {
        changes: { name: 'Initech LLC' },
        rationale: 'Stub evidence.',
      }),
      textResponse('Staged.'),
    ]);
    const workers: WorkerRuns = {
      recordKeeper: (input) => runRecordKeeper({ db: testDb.app.db, model }, input),
    };
    const workerCaller = createCaller(
      await createRequestContext({ db: testDb.app.db, auth, headers: ownerHeaders, workers }),
    );
    const run = await workerCaller.agents.workers.recordKeeper({
      agentId: agent.id,
      recordId: record.id,
    });
    expect(run.proposalIds).toHaveLength(1);

    const pending = await ownerCaller.agents.proposals.list({ status: 'pending' });
    expect(pending.map((p) => p.id)).toContain(run.proposalIds[0]);
  });

  it('review of a missing proposal is NOT_FOUND', async () => {
    await expect(
      ownerCaller.agents.proposals.review({
        proposalId: '00000000-0000-4000-8000-000000000000',
        decision: 'accepted',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
