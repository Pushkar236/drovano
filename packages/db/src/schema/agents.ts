/**
 * Agent trust infrastructure (TASK-0037, ai-system.md): agents are
 * first-class principals (PROJECT.md law 2) with SCOPED GRANTS — never
 * roles; `ai_runs` is the session log every harness run records into;
 * `proposals` is the provisional-until-accepted surface: agent writes
 * land here and become record values only through a human review that
 * runs the normal permission + audit path.
 *
 * All four tables are tenant-scoped RLS-normal (audit_log exemplar).
 */
import { sql } from 'drizzle-orm';
import {
  index,
  boolean,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { appRole, currentTenantId, tenants } from './core.js';
import { records } from './graph.js';

export const agents = pgTable(
  'agents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    /** Worker kind, e.g. 'record-keeper', 'research-assistant'. */
    worker: text('worker').notNull(),
    active: boolean('active').notNull().default(true),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('agents_tenant_idx').on(table.tenantId),
    pgPolicy('agents_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

export const agentGrants = pgTable(
  'agent_grants',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    /** A grantable action type, e.g. 'record.update' (permissions pkg). */
    action: text('action').notNull(),
    grantedBy: text('granted_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('agent_grants_agent_action_idx').on(table.agentId, table.action),
    index('agent_grants_tenant_idx').on(table.tenantId),
    pgPolicy('agent_grants_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

export const aiRuns = pgTable(
  'ai_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    agentId: uuid('agent_id').references(() => agents.id),
    /** Worker identity even when no agent row exists (system runs). */
    worker: text('worker').notNull(),
    model: text('model').notNull(),
    steps: integer('steps').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    outcome: text('outcome', { enum: ['completed', 'error'] }).notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_runs_tenant_created_idx').on(table.tenantId, table.createdAt),
    pgPolicy('ai_runs_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id),
    /** Proposed attribute writes: { attributeKey: value }. */
    changes: jsonb('changes').notNull(),
    /** Why the agent proposes this (shown to the reviewer). */
    rationale: text('rationale').notNull(),
    proposedByAgent: uuid('proposed_by_agent')
      .notNull()
      .references(() => agents.id),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('proposals_tenant_status_idx').on(table.tenantId, table.status),
    pgPolicy('proposals_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);
