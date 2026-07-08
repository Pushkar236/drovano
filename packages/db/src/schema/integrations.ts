/**
 * External-account connections (TASK-0032): one row per connected
 * Google account per tenant. Tokens are stored ENCRYPTED (AES-256-GCM,
 * key derived from the app secret — @drovano/google owns the cipher);
 * the plaintext never touches the database. Sync cursors (Gmail
 * historyId, Calendar syncToken) live here so ingestion is resumable
 * from the exact position it stopped (ADR-0007 posture).
 *
 * Tenant-scoped RLS-normal (audit_log exemplar).
 */
import { sql } from 'drizzle-orm';
import { index, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { appRole, currentTenantId, tenants } from './core.js';

export const googleConnections = pgTable(
  'google_connections',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** The member who connected the account (better-auth user id). */
    userId: text('user_id').notNull(),
    /** The Google account email this connection reads. */
    email: text('email').notNull(),
    /** AES-256-GCM ciphertext (iv:tag:data, base64) — never plaintext. */
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    /** When the current access token expires (refresh happens before). */
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }).notNull(),
    /** Space-separated OAuth scopes actually granted. */
    scope: text('scope').notNull(),
    /** Gmail incremental cursor (users.history.list startHistoryId). */
    gmailHistoryId: text('gmail_history_id'),
    /** Calendar incremental cursor (events.list syncToken). */
    calendarSyncToken: text('calendar_sync_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('google_connections_tenant_email_uidx').on(table.tenantId, table.email),
    index('google_connections_tenant_idx').on(table.tenantId),
    pgPolicy('google_connections_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);
