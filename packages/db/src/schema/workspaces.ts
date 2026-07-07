/**
 * Workspaces partition an organization's data (PROJECT.md module map).
 * These are OUR domain tables, deliberately not the auth vendor's "teams"
 * feature (ADR-0008: no vendor coupling on a core domain concept) —
 * tenant-scoped with RLS, following the audit_log exemplar.
 *
 * The default "General" workspace is created by provision_tenant()
 * (migration 0003) when an organization is provisioned.
 */
import { sql } from 'drizzle-orm';
import { index, pgPolicy, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { appRole, currentTenantId, tenants } from './core.js';

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('workspaces_tenant_idx').on(table.tenantId),
    pgPolicy('workspaces_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

export const workspaceRoles = ['admin', 'member'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // References the global users table (ADR-0011): membership is the
    // tenant-scoped edge between a global principal and tenant data.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: workspaceRoles }).notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_members_tenant_user_idx').on(table.tenantId, table.userId),
    pgPolicy('workspace_members_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);
