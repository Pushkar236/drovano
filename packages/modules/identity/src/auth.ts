import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import {
  accounts,
  invitations,
  members,
  organizations,
  sessions,
  twoFactors,
  users,
  verifications,
  type Database,
} from '@drovano/db';
import { betterAuth } from 'better-auth';
import { organization, twoFactor } from 'better-auth/plugins';
import { v7 as uuidv7 } from 'uuid';

import type { Mailer } from './mailer.js';
import { hashPassword, verifyPassword } from './password.js';
import { provisionTenant } from './provisioning.js';

export interface CreateAuthOptions {
  db: Database;
  /** Signing secret for sessions/tokens. ≥32 chars, from the environment. */
  secret: string;
  /** Public origin the auth endpoints are served from. */
  baseUrl: string;
  /** Cross-origin frontends allowed to call the auth endpoints (CSRF). */
  trustedOrigins?: string[];
  mailer: Mailer;
  appName?: string;
  /**
   * Runs after a new organization's tenant is provisioned. Composed at the
   * app tier (modules never import each other) — e.g. the CRM module seeds
   * its standard objects here.
   */
  afterOrganizationProvisioned?: (input: {
    tenantId: string;
    creatorUserId: string;
  }) => Promise<void>;
}

/**
 * The better-auth instance (ADR-0008): email/password with argon2id, TOTP
 * MFA, and organizations. Every organization created here is provisioned
 * as a tenant (same id) with a default workspace via the
 * afterCreateOrganization hook — the auth layer and the tenancy anchor can
 * never drift apart.
 *
 * Table mapping is explicit (uuid ids, plural snake_case — see
 * packages/db/src/schema/auth.ts); ids are uuidv7 via generateId so auth
 * rows use the same id discipline as domain rows.
 */
export function createAuth(options: CreateAuthOptions) {
  const { db, mailer } = options;
  const appName = options.appName ?? 'Drovano';

  return betterAuth({
    appName,
    baseURL: options.baseUrl,
    secret: options.secret,
    ...(options.trustedOrigins !== undefined ? { trustedOrigins: options.trustedOrigins } : {}),
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        organization: organizations,
        member: members,
        invitation: invitations,
        twoFactor: twoFactors,
      },
    }),
    advanced: {
      database: {
        generateId: () => uuidv7(),
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      // SECURITY.md mandates argon2id; better-auth defaults to scrypt.
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: `Reset your ${appName} password`,
          text: `Someone requested a password reset for this address. If that was you, open:\n${url}\nIf not, ignore this email — nothing changes.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: `Verify your email for ${appName}`,
          text: `Welcome to ${appName}. Confirm this address by opening:\n${url}`,
        });
      },
    },
    plugins: [
      organization({
        organizationHooks: {
          afterCreateOrganization: async ({ organization: createdOrganization, user }) => {
            await provisionTenant(db, {
              tenantId: createdOrganization.id,
              name: createdOrganization.name,
              creatorUserId: user.id,
            });
            await options.afterOrganizationProvisioned?.({
              tenantId: createdOrganization.id,
              creatorUserId: user.id,
            });
          },
        },
        sendInvitationEmail: async (data) => {
          await mailer.send({
            to: data.email,
            subject: `You've been invited to ${data.organization.name} on ${appName}`,
            text: `${data.inviter.user.name} invited you to join ${data.organization.name}.\nInvitation id: ${data.id}`,
          });
        },
      }),
      twoFactor({ issuer: appName }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
