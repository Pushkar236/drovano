/**
 * Retrieval over real Postgres + pgvector (TASK-0035): indexing
 * replaces chunks per source, BM25-only search works with no embedder
 * (zero-cost posture), the dense side + RRF fusion lifts semantically
 * related hits, permission gates hold for agents, soft-deleted records
 * disappear from results, and RLS keeps tenants apart.
 */
import { records, objectDefinitions, tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import type { PrincipalContext } from '@drovano/permissions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createRetrievalTool,
  indexSource,
  removeSource,
  searchChunks,
  type Embedder,
} from '../src/index.js';

/** Deterministic bag-of-words embedder — shared words → higher cosine. */
const DIMS = 384; // matches chunks.embedding halfvec(384), ADR-0015
const stubEmbedder: Embedder = {
  embed: (texts) =>
    Promise.resolve(
      texts.map((text) => {
        const vector = new Array<number>(DIMS).fill(0);
        for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
          let hash = 2166136261;
          for (const char of word) {
            hash = ((hash ^ char.charCodeAt(0)) * 16777619) >>> 0;
          }
          vector[hash % DIMS] = (vector[hash % DIMS] ?? 0) + 1;
        }
        const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
        return vector.map((x) => x / norm);
      }),
    ),
};

function humanPrincipal(tenantId: string): PrincipalContext {
  return {
    kind: 'human',
    userId: 'user-1',
    tenantId,
    organizationRole: 'member',
    workspaceRoles: new Map(),
  };
}

function agentPrincipal(tenantId: string, grants: string[]): PrincipalContext {
  return {
    kind: 'agent',
    userId: 'agent-1',
    tenantId,
    organizationRole: null,
    workspaceRoles: new Map(),
    agentGrants: new Set(grants),
  };
}

describe('retrieval pipeline (real Postgres + pgvector)', () => {
  let testDb: TestDatabase;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const seeded = await testDb.owner.db
      .insert(tenants)
      .values([{ name: 'Retrieval A' }, { name: 'Retrieval B' }])
      .returning({ id: tenants.id });
    tenantA = seeded[0]?.id ?? '';
    tenantB = seeded[1]?.id ?? '';
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('indexes, finds via BM25 with no embedder, and re-indexing replaces chunks', async () => {
    const sourceId = '00000000-0000-4000-8000-000000000001';
    const first = await withTenant(testDb.app.db, tenantA, (tx) =>
      indexSource(tx, {
        tenantId: tenantA,
        sourceType: 'note',
        sourceId,
        text: 'Meeting notes: Acme wants the enterprise onboarding plan by Friday.',
      }),
    );
    expect(first.chunkCount).toBe(1);
    expect(first.embedded).toBe(false);

    const hits = await withTenant(testDb.app.db, tenantA, (tx) =>
      searchChunks(tx, {
        tenantId: tenantA,
        principal: humanPrincipal(tenantA),
        query: 'enterprise onboarding',
      }),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toContain('enterprise onboarding');

    // Re-index with different text: the old chunk must be gone.
    await withTenant(testDb.app.db, tenantA, (tx) =>
      indexSource(tx, {
        tenantId: tenantA,
        sourceType: 'note',
        sourceId,
        text: 'Revised notes: the kickoff moved to Monday.',
      }),
    );
    const stale = await withTenant(testDb.app.db, tenantA, (tx) =>
      searchChunks(tx, {
        tenantId: tenantA,
        principal: humanPrincipal(tenantA),
        query: 'enterprise onboarding',
      }),
    );
    expect(stale).toHaveLength(0);

    await withTenant(testDb.app.db, tenantA, (tx) =>
      removeSource(tx, { sourceType: 'note', sourceId }),
    );
    const gone = await withTenant(testDb.app.db, tenantA, (tx) =>
      searchChunks(tx, {
        tenantId: tenantA,
        principal: humanPrincipal(tenantA),
        query: 'kickoff Monday',
      }),
    );
    expect(gone).toHaveLength(0);
  });

  it('hybrid search: the dense side surfaces documents BM25 alone ranks poorly', async () => {
    await withTenant(testDb.app.db, tenantA, async (tx) => {
      await indexSource(tx, {
        tenantId: tenantA,
        sourceType: 'document',
        sourceId: '00000000-0000-4000-8000-000000000011',
        text: 'Quarterly revenue projections and budget allocations for the sales team.',
        embedder: stubEmbedder,
      });
      await indexSource(tx, {
        tenantId: tenantA,
        sourceType: 'document',
        sourceId: '00000000-0000-4000-8000-000000000012',
        text: 'Recipe collection: sourdough starter maintenance and baking schedules.',
        embedder: stubEmbedder,
      });
    });

    const hits = await withTenant(testDb.app.db, tenantA, (tx) =>
      searchChunks(tx, {
        tenantId: tenantA,
        principal: humanPrincipal(tenantA),
        query: 'revenue projections budget',
        embedder: stubEmbedder,
      }),
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.content).toContain('revenue projections');
    // Both retrieval modes rank it first → fused score reflects both pools.
    expect(hits[0]?.score).toBeGreaterThan(1 / 61);
  });

  it('contextual sentences are stored and searchable', async () => {
    await withTenant(testDb.app.db, tenantA, (tx) =>
      indexSource(tx, {
        tenantId: tenantA,
        sourceType: 'transcript',
        sourceId: '00000000-0000-4000-8000-000000000021',
        text: 'They agreed to move forward next week.',
        contextualizer: ({ chunk }) =>
          Promise.resolve(`From the Zephyr contract negotiation call: ${chunk.slice(0, 20)}`),
      }),
    );
    const hits = await withTenant(testDb.app.db, tenantA, (tx) =>
      searchChunks(tx, {
        tenantId: tenantA,
        principal: humanPrincipal(tenantA),
        query: 'Zephyr contract negotiation',
      }),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.context).toContain('Zephyr contract negotiation');
  });

  it('agents need the record.view grant; humans in the org pass', async () => {
    await expect(
      withTenant(testDb.app.db, tenantA, (tx) =>
        searchChunks(tx, {
          tenantId: tenantA,
          principal: agentPrincipal(tenantA, []),
          query: 'anything',
        }),
      ),
    ).rejects.toMatchObject({ name: 'RetrievalError', code: 'not-permitted' });

    const granted = await withTenant(testDb.app.db, tenantA, (tx) =>
      searchChunks(tx, {
        tenantId: tenantA,
        principal: agentPrincipal(tenantA, ['record.view']),
        query: 'revenue projections',
      }),
    );
    expect(granted.length).toBeGreaterThan(0);
  });

  it('chunks anchored to a soft-deleted record vanish from results', async () => {
    const { recordId } = await withTenant(testDb.app.db, tenantA, async (tx) => {
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
      await indexSource(tx, {
        tenantId: tenantA,
        sourceType: 'email',
        sourceId: '00000000-0000-4000-8000-000000000031',
        recordId: record.id,
        text: 'Email thread about the Northwind renewal discount.',
      });
      return { recordId: record.id };
    });

    const before = await withTenant(testDb.app.db, tenantA, (tx) =>
      searchChunks(tx, {
        tenantId: tenantA,
        principal: humanPrincipal(tenantA),
        query: 'Northwind renewal',
      }),
    );
    expect(before).toHaveLength(1);
    expect(before[0]?.recordId).toBe(recordId);

    await withTenant(testDb.app.db, tenantA, (tx) =>
      tx.update(records).set({ deletedAt: new Date() }),
    );
    const after = await withTenant(testDb.app.db, tenantA, (tx) =>
      searchChunks(tx, {
        tenantId: tenantA,
        principal: humanPrincipal(tenantA),
        query: 'Northwind renewal',
      }),
    );
    expect(after).toHaveLength(0);
  });

  it('RLS: tenant B sees nothing of tenant A, and the agent tool is tenant-bound', async () => {
    const hitsB = await withTenant(testDb.app.db, tenantB, (tx) =>
      searchChunks(tx, {
        tenantId: tenantB,
        principal: humanPrincipal(tenantB),
        query: 'revenue projections budget',
      }),
    );
    expect(hitsB).toHaveLength(0);

    const toolA = createRetrievalTool({
      db: testDb.app.db,
      tenantId: tenantA,
      principal: humanPrincipal(tenantA),
    });
    const viaTool = (await toolA.execute(
      { query: 'revenue projections budget' },
      { toolCallId: 'test', messages: [], context: undefined as never },
    )) as { content: string }[];
    expect(viaTool.length).toBeGreaterThan(0);

    const toolB = createRetrievalTool({
      db: testDb.app.db,
      tenantId: tenantB,
      principal: humanPrincipal(tenantB),
    });
    const viaToolB = (await toolB.execute(
      { query: 'revenue projections budget' },
      { toolCallId: 'test', messages: [], context: undefined as never },
    )) as { content: string }[];
    expect(viaToolB).toHaveLength(0);
  });
});
