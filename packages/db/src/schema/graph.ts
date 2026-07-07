/**
 * The object graph's storage engine (TASK-0021; docs/architecture/
 * data-model.md §2/§4): object and attribute DEFINITIONS are rows (user
 * schema changes are never DDL), record VALUES live in a typed-EAV table
 * with one column per value kind — never a single JSONB blob — so every
 * kind gets real indexes and real query plans. Standard objects
 * additionally get concrete hot-path tables in TASK-0022.
 *
 * Records are tenant-level (one shared graph per organization — the
 * Attio-validated model); record-/object-level grants are the documented
 * post-v1 seam (data-model.md §5).
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

export const objectKinds = ['standard', 'custom'] as const;
export type ObjectKind = (typeof objectKinds)[number];

/** Object definitions: blueprints for records (Person, Company, … + custom). */
export const objectDefinitions = pgTable(
  'object_definitions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** Stable machine key, e.g. 'person', 'company', 'invoice'. */
    key: text('key').notNull(),
    /** Singular display name, e.g. 'Person'. */
    name: text('name').notNull(),
    kind: text('kind', { enum: objectKinds }).notNull().default('custom'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('object_definitions_tenant_key_uidx').on(table.tenantId, table.key),
    pgPolicy('object_definitions_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

export const attributeTypes = [
  'text',
  'number',
  'currency',
  'date',
  'timestamp',
  'checkbox',
  'select',
  'multi_select',
  'url',
  'email',
  'phone',
  'user',
  'relation',
] as const;
export type AttributeType = (typeof attributeTypes)[number];

/**
 * Attribute definitions (metadata is data). `config` holds type-specific
 * settings validated by the crm module: select options, relation target
 * object, currency code. Archived attributes keep their values but stop
 * accepting writes.
 */
export const attributeDefinitions = pgTable(
  'attribute_definitions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    objectId: uuid('object_id')
      .notNull()
      .references(() => objectDefinitions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    type: text('type', { enum: attributeTypes }).notNull(),
    config: jsonb('config'),
    /** System attributes ship with standard objects and cannot be removed. */
    system: boolean('system').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('attribute_definitions_object_key_uidx').on(table.objectId, table.key),
    index('attribute_definitions_tenant_object_idx').on(table.tenantId, table.objectId),
    pgPolicy('attribute_definitions_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

export const principalKinds = ['human', 'agent', 'integration', 'system'] as const;

/** Record rows: identity + provenance; values live in record_values. */
export const records = pgTable(
  'records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    objectId: uuid('object_id')
      .notNull()
      .references(() => objectDefinitions.id),
    createdByKind: text('created_by_kind', { enum: principalKinds }).notNull(),
    createdById: uuid('created_by_id'),
    updatedByKind: text('updated_by_kind', { enum: principalKinds }).notNull(),
    updatedById: uuid('updated_by_id'),
    /** Soft delete (data-model.md §3): tombstoned, restorable in a window. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // The list-page workhorse: tenant → object → newest first (uuidv7 ids
    // are time-ordered, so id is a stable cursor tiebreaker).
    index('records_tenant_object_created_idx').on(table.tenantId, table.objectId, table.id),
    pgPolicy('records_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);

/**
 * Typed-EAV values: one row per (record, attribute), one concrete column
 * per value kind (data-model.md §4). The crm module guarantees exactly
 * one kind column is populated, matching the attribute's type.
 */
export const recordValues = pgTable(
  'record_values',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: 'cascade' }),
    valueText: text('value_text'),
    valueNumber: numeric('value_number', { precision: 20, scale: 6 }),
    valueBoolean: boolean('value_boolean'),
    valueDate: date('value_date'),
    valueTimestamp: timestamp('value_timestamp', { withTimezone: true }),
    /** user / relation targets. */
    valueUuid: uuid('value_uuid'),
    /** multi_select and other genuinely list-shaped values. */
    valueJsonb: jsonb('value_jsonb'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.recordId, table.attributeId] }),
    // Filtered/sorted list queries per attribute kind (tenant-leading).
    index('record_values_text_idx').on(table.tenantId, table.attributeId, table.valueText),
    index('record_values_number_idx').on(table.tenantId, table.attributeId, table.valueNumber),
    index('record_values_timestamp_idx').on(
      table.tenantId,
      table.attributeId,
      table.valueTimestamp,
    ),
    index('record_values_uuid_idx').on(table.tenantId, table.attributeId, table.valueUuid),
    pgPolicy('record_values_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);
