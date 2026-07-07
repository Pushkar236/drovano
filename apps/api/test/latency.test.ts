import { performance } from 'node:perf_hooks';

import { createCaller, createRequestContext, type RequestContext } from '@drovano/api-contracts';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { createAuth, type Auth } from '@drovano/identity';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * API latency budgets (TASK-0018 part 2; PRD §5, TESTING.md performance
 * checks). Measured against the real stack — Hono-free procedure calls
 * over real Postgres — so regressions in query plans, principal loading,
 * or middleware cost fail the build. Budgets are the PRD's server-side
 * numbers; CI shared-runner variance is absorbed by measuring p95 over a
 * warm series, not by inflating the budgets.
 */
const ITERATIONS = 30;
const SINGLE_READ_BUDGET_MS = 150;
const LIST_READ_BUDGET_MS = 300;

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

async function measure(run: () => Promise<unknown>): Promise<number> {
  const samples: number[] = [];
  // Warm-up: connection pool, prepared statements, JIT.
  for (let i = 0; i < 3; i += 1) await run();
  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  return p95(samples);
}

describe('API latency budgets (PRD §5)', () => {
  let testDb: TestDatabase;
  let auth: Auth;
  let context: RequestContext;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    auth = createAuth({
      db: testDb.app.db,
      secret: 'integration-test-secret-at-least-32-chars-long', // gitleaks:allow — intentional test dummy
      baseUrl: 'http://localhost:3000',
      mailer: { send: () => Promise.resolve() },
    });

    const { headers } = await auth.api.signUpEmail({
      body: { email: 'latency@example.com', name: 'Latency', password: 'a-long-test-password-1' },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .filter((pair): pair is string => pair !== undefined)
      .join('; ');
    const organization = await auth.api.createOrganization({
      body: { name: 'Latency Org', slug: 'latency-org' },
      headers: new Headers({ cookie }),
    });
    await auth.api.setActiveOrganization({
      body: { organizationId: organization.id },
      headers: new Headers({ cookie }),
    });
    context = await createRequestContext({
      db: testDb.app.db,
      auth,
      headers: new Headers({ cookie }),
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it(`single-record read (me.get) p95 < ${String(SINGLE_READ_BUDGET_MS)}ms`, async () => {
    const caller = createCaller(context);
    const latency = await measure(() => caller.me.get());
    expect(latency).toBeLessThan(SINGLE_READ_BUDGET_MS);
  });

  it(`list read (workspaces.list) p95 < ${String(LIST_READ_BUDGET_MS)}ms`, async () => {
    const caller = createCaller(context);
    const latency = await measure(() => caller.workspaces.list());
    expect(latency).toBeLessThan(LIST_READ_BUDGET_MS);
  });

  it(`anonymous context resolution p95 < ${String(SINGLE_READ_BUDGET_MS)}ms`, async () => {
    // The per-request cost every call pays before reaching a procedure.
    const headers = new Headers();
    const latency = await measure(() => createRequestContext({ db: testDb.app.db, auth, headers }));
    expect(latency).toBeLessThan(SINGLE_READ_BUDGET_MS);
  });
});
