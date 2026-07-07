/**
 * Lists, list entries, list-scoped values, and saved views (TASK-0024;
 * data-model.md §2 "Lists & views"). The signature separation: process
 * state (stage, priority, owner-for-this-workflow) lives on the LIST
 * ENTRY via list-scoped attributes — entity truth on the record is never
 * polluted. Pipelines are lists whose entries carry a stage attribute
 * (TASK-0026).
 *
 * List-scoped attribute definitions reuse `attribute_definitions` (its
 * `list_id` column is added in the same migration); entry values mirror
 * the record_values typed-EAV shape, keyed by entry instead of record.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { appRole, currentTenantId, tenants } from './core.js';
import { objectDefinitions, records } from './graph.js';

export const lists = pgTable(
  'lists',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** Every list curates records of exactly one object. */
    objectId: uuid('object_id')
      .notNull()
      .references(() => objectDefinitions.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('lists_tenant_object_idx').on(table.tenantId, table.objectId),
    pgPolicy('lists_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

export const listEntries = pgTable(
  'list_entries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('list_entries_list_record_uidx').on(table.listId, table.recordId),
    index('list_entries_tenant_list_idx').on(table.tenantId, table.listId, table.id),
    pgPolicy('list_entries_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

/** Typed-EAV values on list ENTRIES (same shape/discipline as record_values). */
export const listEntryValues = pgTable(
  'list_entry_values',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => listEntries.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id').notNull(),
    valueText: text('value_text'),
    valueNumber: numeric('value_number', { precision: 20, scale: 6 }),
    valueBoolean: boolean('value_boolean'),
    valueDate: date('value_date'),
    valueTimestamp: timestamp('value_timestamp', { withTimezone: true }),
    valueUuid: uuid('value_uuid'),
    valueJsonb: jsonb('value_jsonb'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.attributeId] }),
    index('list_entry_values_text_idx').on(table.tenantId, table.attributeId, table.valueText),
    pgPolicy('list_entry_values_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

export const viewTypes = ['table', 'kanban'] as const;
export type ViewType = (typeof viewTypes)[number];

/** Saved views: named configurations over an object or a list. */
export const savedViews = pgTable(
  'saved_views',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** Exactly one of objectId/listId is set (CHECK in migration 0007). */
    objectId: uuid('object_id').references(() => objectDefinitions.id, { onDelete: 'cascade' }),
    listId: uuid('list_id').references(() => lists.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: viewTypes }).notNull().default('table'),
    /** Filters/sorts/grouping/columns — zod-validated in the crm module. */
    config: jsonb('config').notNull(),
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('saved_views_tenant_object_idx').on(table.tenantId, table.objectId),
    index('saved_views_tenant_list_idx').on(table.tenantId, table.listId),
    pgPolicy('saved_views_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);
