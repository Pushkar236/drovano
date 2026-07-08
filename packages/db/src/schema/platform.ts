/**
 * Platform surface tables (TASK-0029): API keys and webhooks.
 *
 * `api_keys` is GLOBAL — the documented RLS exception per ADR-0011's
 * reasoning: a bearer-key lookup happens BEFORE the tenant is known
 * (hash → row → tenant), exactly like session-token lookups on the
 * identity tables. Every read path scopes by the found row's tenant_id
 * immediately; only the key hash is stored, never the secret.
 *
 * `webhooks` is tenant-scoped RLS-normal like every other resource.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { appRole, currentTenantId, tenants } from './core.js';

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    /** First characters of the key (e.g. `drv_ab12cd34`), for display. */
    keyPrefix: text('key_prefix').notNull(),
    /** sha256 hex of the full secret; the secret itself is never stored. */
    keyHash: text('key_hash').notNull(),
    createdBy: text('created_by').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('api_keys_hash_idx').on(table.keyHash),
    index('api_keys_tenant_idx').on(table.tenantId),
  ],
);

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    url: text('url').notNull(),
    /** Subscribed event names, e.g. ["record.created","record.updated"]. */
    events: jsonb('events').notNull(),
    /** HMAC-SHA256 signing secret (X-Drovano-Signature). */
    secret: text('secret').notNull(),
    active: boolean('active').notNull().default(true),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhooks_tenant_idx').on(table.tenantId),
    pgPolicy('webhooks_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);
