import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The application's database role. Non-owner by design: RLS binds it even
 * without FORCE, and it can never run DDL. Created in migration 0000
 * (roles are cluster-level; drizzle-kit does not manage it).
 */
export const appRole = pgRole('drovano_app').existing();

/**
 * The canonical tenant predicate (docs/architecture/multi-tenancy.md §2).
 *
 * - `missing_ok = true` + `nullif(…, '')`: an unset or cleared GUC yields
 *   NULL, so the policy matches zero rows instead of erroring — the
 *   backstop behavior the architecture requires.
 * - Wrapped in `(select …)` so Postgres evaluates it once per query
 *   (initplan), not once per row.
 *
 * Exported for use by every tenant-scoped schema file; never build a
 * different predicate.
 */
export const currentTenantId = sql`(select nullif(current_setting('app.current_tenant_id', true), '')::uuid)`;

/**
 * Tenancy anchor. One row per organization; every tenant-scoped table
 * references it. The auth layer's organization records (schema/auth.ts)
 * map 1:1 onto this table — same id, created by the provision_tenant()
 * SECURITY DEFINER function (migration 0003) — rather than replacing it,
 * keeping the RLS anchor independent of any auth vendor's schema.
 *
 * The app role can only ever see its own tenant row; provisioning runs
 * inside provision_tenant(), so the app role needs no INSERT grant.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy('tenants_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.id} = ${currentTenantId}`,
      withCheck: sql`${table.id} = ${currentTenantId}`,
    }),
  ],
);

export const actorKinds = ['human', 'agent', 'integration', 'system'] as const;
export type ActorKind = (typeof actorKinds)[number];

/**
 * Append-only audit log (SECURITY.md non-negotiable #7; ARCHITECTURE.md:
 * audit is domain data). This table is also the exemplar for the
 * tenant-scoped table pattern: tenant_id column, tenant-leading composite
 * index, single-predicate RLS policy. Every future tenant-scoped table
 * copies this shape.
 *
 * Append-only is enforced by grants (migration 0001 gives drovano_app
 * INSERT + SELECT only), not by trust. The transactional writer lands in
 * TASK-0010.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    actorKind: text('actor_kind', { enum: actorKinds }).notNull(),
    /** Null only when actorKind is 'system' (e.g. migrations, scheduled maintenance). */
    actorId: uuid('actor_id'),
    /** Verb-object operation name, e.g. 'record.create', 'workspace.invite'. */
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Tenant-leading composite index: the #1 RLS performance factor
    // (docs/architecture/multi-tenancy.md §2, rule 3).
    index('audit_log_tenant_created_idx').on(table.tenantId, table.createdAt),
    pgPolicy('audit_log_tenant_isolation', {
      as: 'permissive',
      to: appRole,
      for: 'all',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
);
