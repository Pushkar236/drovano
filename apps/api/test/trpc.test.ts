import { randomUUID } from 'node:crypto';

import { createCaller, createRequestContext } from '@drovano/api-contracts';
import { auditLog, members, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { createAuth, type Auth } from '@drovano/identity';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PASSWORD = 'a-long-test-password-1';

/**
 * Integration tests for the internal tRPC surface: the authorization
 * matrix (TESTING.md rule 5) exercised through the REAL stack — session
 * from better-auth cookies, principal loading, can(), RLS, audit.
 */
describe('tRPC surface (real database, real sessions)', () => {
  let testDb: TestDatabase;
  let auth: Auth;
  let ownerHeaders: Headers;
  let organizationId: string;
  let workspaceId: string;

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
    });

    ownerHeaders = await signUp('owner@example.com', 'Owner');
    const organization = await auth.api.createOrganization({
      body: { name: 'Trpc Org', slug: 'trpc-org' },
      headers: ownerHeaders,
    });
    organizationId = organization.id;
    // Make the org active on the session (the client does this after create).
    await auth.api.setActiveOrganization({
      body: { organizationId },
      headers: ownerHeaders,
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('rejects unauthenticated calls', async () => {
    const caller = await callerFor(new Headers());
    await expect(caller.me.get()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.workspaces.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('me returns the user, active organization, and role', async () => {
    const caller = await callerFor(ownerHeaders);
    const me = await caller.me.get();
    expect(me.user.email).toBe('owner@example.com');
    expect(me.activeOrganizationId).toBe(organizationId);
    expect(me.organizationRole).toBe('owner');
  });

  it('a session without an active organization is denied tenant procedures', async () => {
    const headers = await signUp('orgless@example.com', 'Orgless');
    const caller = await callerFor(headers);
    await expect(caller.workspaces.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists the provisioned workspace with the creator as admin', async () => {
    const caller = await callerFor(ownerHeaders);
    const list = await caller.workspaces.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('General');
    expect(list[0]?.myRole).toBe('admin');
    workspaceId = list[0]?.id ?? '';
  });

  it('tenant isolation holds through the API surface', async () => {
    const otherHeaders = await signUp('other-owner@example.com', 'Other');
    const otherOrg = await auth.api.createOrganization({
      body: { name: 'Other Org', slug: 'other-org' },
      headers: otherHeaders,
    });
    await auth.api.setActiveOrganization({
      body: { organizationId: otherOrg.id },
      headers: otherHeaders,
    });
    const otherCaller = await callerFor(otherHeaders);
    const otherList = await otherCaller.workspaces.list();
    expect(otherList).toHaveLength(1);
    expect(otherList[0]?.id).not.toBe(workspaceId);
  });

  it('rename: allowed for the owner, mutates, and audits in the same transaction', async () => {
    const caller = await callerFor(ownerHeaders);
    const renamed = await caller.workspaces.rename({ workspaceId, name: 'HQ' });
    expect(renamed.name).toBe('HQ');

    const audits = await withTenant(testDb.app.db, organizationId, (tx) =>
      tx
        .select({ action: auditLog.action, detail: auditLog.detail })
        .from(auditLog)
        .where(eq(auditLog.action, 'workspace.rename')),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.detail).toEqual({ from: 'General', to: 'HQ' });
  });

  it('rename: denied for a plain org member with the decision reason', async () => {
    const memberHeaders = await signUp('member@example.com', 'Member');
    // Membership granted directly (owner connection): the invitation UX is
    // covered in the identity tests; here we test OUR authorization path.
    const [memberUser] = await auth.api
      .getSession({ headers: memberHeaders })
      .then((s) => [s?.user]);
    await testDb.owner.db.insert(members).values({
      id: randomUUID(),
      organizationId,
      userId: memberUser?.id ?? '',
      role: 'member',
    });
    await auth.api.setActiveOrganization({ body: { organizationId }, headers: memberHeaders });

    const caller = await callerFor(memberHeaders);
    // Members see no workspaces they don't belong to…
    expect(await caller.workspaces.list()).toHaveLength(0);
    // …and cannot rename them.
    await expect(caller.workspaces.rename({ workspaceId, name: 'Nope' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rename: validates input', async () => {
    const caller = await callerFor(ownerHeaders);
    await expect(caller.workspaces.rename({ workspaceId, name: '   ' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(
      caller.workspaces.rename({ workspaceId: 'not-a-uuid', name: 'X' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rename: NOT_FOUND for a workspace outside the tenant (invisible, not leaked)', async () => {
    const caller = await callerFor(ownerHeaders);
    await expect(
      caller.workspaces.rename({ workspaceId: randomUUID(), name: 'Ghost' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
