import {
  accounts,
  auditLog,
  members,
  tenants,
  users,
  withTenant,
  workspaceMembers,
  workspaces,
} from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { eq } from 'drizzle-orm';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuth, type Auth } from '../src/auth.js';
import type { MailMessage, Mailer } from '../src/mailer.js';

interface CaptureMailer extends Mailer {
  messages: MailMessage[];
}

function createCaptureMailer(): CaptureMailer {
  const messages: MailMessage[] = [];
  return {
    messages,
    send: (message) => {
      messages.push(message);
      return Promise.resolve();
    },
  };
}

/** Build a Cookie header from a response's Set-Cookie headers. */
function cookieHeaderFrom(headers: Headers): Headers {
  const cookiePairs = headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .filter((pair): pair is string => pair !== undefined && pair !== '');
  expect(cookiePairs.length).toBeGreaterThan(0);
  return new Headers({ cookie: cookiePairs.join('; ') });
}

const PASSWORD = 'a-long-test-password-1';

describe('identity module (better-auth over the app role)', () => {
  let testDb: TestDatabase;
  let auth: Auth;
  let mailer: CaptureMailer;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    mailer = createCaptureMailer();
    // The app-role connection: the exact database posture of production.
    auth = createAuth({
      db: testDb.app.db,
      secret: 'integration-test-secret-at-least-32-chars-long',
      baseUrl: 'http://localhost:3000',
      mailer,
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  async function signUp(email: string, name: string): Promise<Headers> {
    const { headers } = await auth.api.signUpEmail({
      body: { email, name, password: PASSWORD },
      returnHeaders: true,
    });
    return cookieHeaderFrom(headers);
  }

  it('signs up with an argon2id-hashed password and sends a verification email', async () => {
    const sessionHeaders = await signUp('ada@example.com', 'Ada');
    expect(sessionHeaders.get('cookie')).toContain('session_token');

    const [user] = await testDb.app.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, 'ada@example.com'));
    expect(user).toBeDefined();

    const [account] = await testDb.app.db
      .select({ password: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, user?.id ?? ''));
    // SECURITY.md: argon2id, never the library default.
    expect(account?.password).toMatch(/^\$argon2id\$/);

    expect(
      mailer.messages.some(
        (m) => m.to === 'ada@example.com' && m.subject.toLowerCase().includes('verify'),
      ),
    ).toBe(true);
  });

  it('rejects a wrong password and a below-minimum password', async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: 'ada@example.com', password: 'wrong-password-123' },
      }),
    ).rejects.toThrow(/invalid email or password/i);

    await expect(
      auth.api.signUpEmail({
        body: { email: 'short@example.com', name: 'Short', password: 'too-short' },
      }),
    ).rejects.toThrow(/password/i);
  });

  it('creating an organization provisions the tenant, default workspace, and audit entry', async () => {
    const sessionHeaders = await signUp('grace@example.com', 'Grace');
    const created = await auth.api.createOrganization({
      body: { name: 'Hopper Inc', slug: 'hopper-inc' },
      headers: sessionHeaders,
    });
    const organizationId = created.id;
    expect(organizationId).not.toBe('');

    // Tenancy anchor: same id as the organization (owner connection —
    // tenants is invisible to the app role outside a tenant context).
    const [tenant] = await testDb.owner.db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, organizationId));
    expect(tenant?.name).toBe('Hopper Inc');

    const [grace] = await testDb.app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'grace@example.com'));
    const graceId = grace?.id ?? '';

    await withTenant(testDb.app.db, organizationId, async (tx) => {
      const workspaceRows = await tx
        .select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces);
      expect(workspaceRows).toHaveLength(1);
      expect(workspaceRows[0]?.name).toBe('General');

      const memberRows = await tx
        .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
        .from(workspaceMembers);
      expect(memberRows).toEqual([{ userId: graceId, role: 'admin' }]);

      const auditRows = await tx
        .select({ action: auditLog.action, actorId: auditLog.actorId })
        .from(auditLog);
      expect(auditRows).toEqual([{ action: 'tenant.provision', actorId: graceId }]);
    });

    // Org-level role: creator is owner.
    const [membership] = await testDb.app.db
      .select({ role: members.role })
      .from(members)
      .where(eq(members.organizationId, organizationId));
    expect(membership?.role).toBe('owner');
  });

  it('invitations flow end-to-end: invite email sent, acceptance creates membership', async () => {
    const ownerHeaders = await signUp('linus@example.com', 'Linus');
    const created = await auth.api.createOrganization({
      body: { name: 'Torvalds LLC', slug: 'torvalds-llc' },
      headers: ownerHeaders,
    });
    const organizationId = created.id;

    const inviteeHeaders = await signUp('margaret@example.com', 'Margaret');

    // better-auth requires a verified email before accepting invitations;
    // complete the real verification flow from the captured email.
    const verificationMail = mailer.messages.find(
      (m) => m.to === 'margaret@example.com' && m.subject.toLowerCase().includes('verify'),
    );
    const token = /[?&]token=([^&\s]+)/.exec(verificationMail?.text ?? '')?.[1];
    expect(token, 'verification email must contain a token').toBeDefined();
    await auth.api.verifyEmail({ query: { token: token ?? '' } });

    const invitation = await auth.api.createInvitation({
      body: { email: 'margaret@example.com', role: 'member', organizationId },
      headers: ownerHeaders,
    });
    expect(
      mailer.messages.some(
        (m) => m.to === 'margaret@example.com' && m.subject.includes('Torvalds LLC'),
      ),
    ).toBe(true);

    await auth.api.acceptInvitation({
      body: { invitationId: invitation.id },
      headers: inviteeHeaders,
    });

    const organizationMembers = await testDb.app.db
      .select({ role: members.role })
      .from(members)
      .where(eq(members.organizationId, organizationId));
    expect(organizationMembers.map((m) => m.role).sort()).toEqual(['member', 'owner']);
  });

  it('TOTP two-factor enrolls and verifies', async () => {
    const sessionHeaders = await signUp('alan@example.com', 'Alan');

    const enabled = await auth.api.enableTwoFactor({
      body: { password: PASSWORD },
      headers: sessionHeaders,
    });
    expect(enabled.totpURI).toContain('otpauth://totp/');
    expect(enabled.backupCodes.length).toBeGreaterThan(0);

    const totp = OTPAuth.URI.parse(enabled.totpURI);
    expect(totp).toBeInstanceOf(OTPAuth.TOTP);
    const code = (totp as OTPAuth.TOTP).generate();

    await auth.api.verifyTOTP({
      body: { code },
      headers: sessionHeaders,
    });

    const [user] = await testDb.app.db
      .select({ twoFactorEnabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.email, 'alan@example.com'));
    expect(user?.twoFactorEnabled).toBe(true);
  });

  it('workspaces are tenant-isolated between organizations', async () => {
    // Two orgs exist from earlier tests; each sees exactly one workspace.
    const organizationIds = await testDb.owner.db.select({ id: tenants.id }).from(tenants);
    expect(organizationIds.length).toBeGreaterThanOrEqual(2);

    for (const { id } of organizationIds) {
      const rows = await withTenant(testDb.app.db, id, (tx) =>
        tx.select({ tenantId: workspaces.tenantId }).from(workspaces),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenantId).toBe(id);
    }

    // And without a tenant context, the backstop holds.
    const unscoped = await testDb.app.db.select({ id: workspaces.id }).from(workspaces);
    expect(unscoped).toHaveLength(0);
  });
});
