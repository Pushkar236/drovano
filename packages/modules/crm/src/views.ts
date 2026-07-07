import { savedViews, writeAuditEntry, type TenantTransaction, type ViewType } from '@drovano/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Actor } from './definitions.js';
import { CrmError } from './errors.js';

/**
 * Saved-view configuration (TASK-0024): declarative filters/sorts/
 * grouping/columns over an object or list, validated here and rendered
 * by the table (TASK-0025) and kanban (TASK-0026) surfaces.
 */
export const ViewConfig = z.object({
  filters: z
    .array(
      z.object({
        attributeKey: z.string().min(1),
        op: z.enum(['eq', 'neq', 'contains', 'gt', 'lt', 'is-set', 'not-set']),
        value: z.union([z.string(), z.number(), z.boolean()]).optional(),
      }),
    )
    .max(20)
    .default([]),
  sorts: z
    .array(
      z.object({
        attributeKey: z.string().min(1),
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .max(5)
    .default([]),
  /** Kanban lane attribute (select-typed); ignored for table views. */
  groupBy: z.string().optional(),
  /** Visible columns in order; empty = all attributes in definition order. */
  columns: z.array(z.string().min(1)).max(50).default([]),
});
export type ViewConfig = z.infer<typeof ViewConfig>;

export interface CreateSavedViewInput {
  tenantId: string;
  /** Exactly one scope (database CHECK backs this up). */
  objectId?: string;
  listId?: string;
  name: string;
  type?: ViewType;
  config: unknown;
  actor: Actor;
}

export async function createSavedView(tx: TenantTransaction, input: CreateSavedViewInput) {
  if ((input.objectId === undefined) === (input.listId === undefined)) {
    throw new CrmError('invalid-value', 'A view targets exactly one object or one list.');
  }
  const config = ViewConfig.safeParse(input.config);
  if (!config.success) {
    throw new CrmError(
      'invalid-value',
      `Invalid view configuration: ${config.error.issues[0]?.message ?? 'invalid input'}.`,
    );
  }

  const [created] = await tx
    .insert(savedViews)
    .values({
      tenantId: input.tenantId,
      objectId: input.objectId ?? null,
      listId: input.listId ?? null,
      name: input.name,
      type: input.type ?? 'table',
      config: config.data,
      createdById: input.actor.id ?? null,
    })
    .returning();
  if (created === undefined) throw new Error('saved view insert returned no row');

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'view.create',
    resourceType: 'saved_view',
    resourceId: created.id,
    detail: { name: input.name, type: input.type ?? 'table' },
  });
  return created;
}

export async function updateSavedViewConfig(
  tx: TenantTransaction,
  input: { tenantId: string; viewId: string; config: unknown; actor: Actor },
) {
  const config = ViewConfig.safeParse(input.config);
  if (!config.success) {
    throw new CrmError(
      'invalid-value',
      `Invalid view configuration: ${config.error.issues[0]?.message ?? 'invalid input'}.`,
    );
  }
  const [updated] = await tx
    .update(savedViews)
    .set({ config: config.data })
    .where(eq(savedViews.id, input.viewId))
    .returning();
  if (updated === undefined) {
    throw new CrmError('unknown-record', 'That view does not exist.');
  }
  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'view.update',
    resourceType: 'saved_view',
    resourceId: updated.id,
  });
  return updated;
}
