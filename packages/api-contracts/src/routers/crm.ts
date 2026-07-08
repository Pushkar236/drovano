import {
  addRecordToList,
  createList,
  createPipeline,
  createRecord,
  createSavedView,
  CrmError,
  getRecord,
  importRecords,
  listListEntries,
  listRecordActivity,
  MAX_ROWS_PER_CALL,
  queryRecords,
  removeRecordFromList,
  seedStandardObjects,
  setListEntryValues,
  softDeleteRecord,
  updateRecordValues,
  updateSavedViewConfig,
  ViewConfig,
  type Actor,
} from '@drovano/crm';
import {
  attributeDefinitions,
  lists,
  objectDefinitions,
  savedViews,
  withTenant,
} from '@drovano/db';
import { can, type Action } from '@drovano/permissions';
import { TRPCError } from '@trpc/server';
import { asc } from 'drizzle-orm';
import { z } from 'zod';

import { router, tenantProcedure } from '../trpc.js';

/** Map typed domain errors to precise transport codes (CODING_STANDARDS). */
function toTrpcError(error: unknown): never {
  if (error instanceof CrmError) {
    const code =
      error.code === 'unknown-record' ||
      error.code === 'unknown-object' ||
      error.code === 'unknown-list'
        ? 'NOT_FOUND'
        : 'BAD_REQUEST';
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

const AttributeValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const ValuesSchema = z.record(z.string(), AttributeValueSchema);

type CrmContext = Parameters<Parameters<typeof tenantProcedure.query>[0]>[0]['ctx'];

function authorize(ctx: CrmContext, action: Action): Actor {
  const decision = can(ctx.principal, action);
  if (!decision.allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: decision.reason });
  }
  return { kind: 'human', id: ctx.session.user.id };
}

export const crmRouter = router({
  /** Object + attribute definitions for the tenant (drives table columns). */
  objects: tenantProcedure.query(async ({ ctx }) => {
    authorize(ctx, { type: 'record.view' });
    return withTenant(ctx.db, ctx.tenantId, async (tx) => {
      const [objects, attributes] = await Promise.all([
        tx
          .select({
            id: objectDefinitions.id,
            key: objectDefinitions.key,
            name: objectDefinitions.name,
            kind: objectDefinitions.kind,
          })
          .from(objectDefinitions)
          .orderBy(asc(objectDefinitions.createdAt)),
        tx
          .select({
            id: attributeDefinitions.id,
            objectId: attributeDefinitions.objectId,
            listId: attributeDefinitions.listId,
            key: attributeDefinitions.key,
            name: attributeDefinitions.name,
            type: attributeDefinitions.type,
            config: attributeDefinitions.config,
            system: attributeDefinitions.system,
            archived: attributeDefinitions.archived,
          })
          .from(attributeDefinitions)
          .orderBy(asc(attributeDefinitions.createdAt)),
      ]);
      return { objects, attributes };
    });
  }),

  /** Idempotent backfill for tenants provisioned before the catalog existed. */
  seedStandardObjects: tenantProcedure.mutation(async ({ ctx }) => {
    const actor = authorize(ctx, { type: 'object.manage' });
    await withTenant(ctx.db, ctx.tenantId, (tx) =>
      seedStandardObjects(tx, { tenantId: ctx.tenantId, actor }),
    );
  }),

  records: router({
    query: tenantProcedure
      .input(
        z.object({
          objectId: z.uuid(),
          config: ViewConfig,
          cursor: z.string().optional(),
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(200).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        authorize(ctx, { type: 'record.view' });
        return withTenant(ctx.db, ctx.tenantId, (tx) => queryRecords(tx, input).catch(toTrpcError));
      }),

    get: tenantProcedure.input(z.object({ recordId: z.uuid() })).query(async ({ ctx, input }) => {
      authorize(ctx, { type: 'record.view' });
      return withTenant(ctx.db, ctx.tenantId, (tx) =>
        getRecord(tx, input.recordId).catch(toTrpcError),
      );
    }),

    activity: tenantProcedure
      .input(
        z.object({
          recordId: z.uuid(),
          cursor: z.string().optional(),
          limit: z.number().int().positive().max(100).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        authorize(ctx, { type: 'record.view' });
        return withTenant(ctx.db, ctx.tenantId, (tx) => listRecordActivity(tx, input));
      }),

    create: tenantProcedure
      .input(z.object({ objectId: z.uuid(), values: ValuesSchema }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.create' });
        const result = await withTenant(ctx.db, ctx.tenantId, (tx) =>
          createRecord(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
        await ctx.invalidation.publish(ctx.tenantId, { resource: 'records' });
        await ctx.webhooks.dispatch(ctx.tenantId, {
          event: 'record.created',
          recordId: result.id,
        });
        return result;
      }),

    update: tenantProcedure
      .input(z.object({ recordId: z.uuid(), values: ValuesSchema }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.update' });
        await withTenant(ctx.db, ctx.tenantId, (tx) =>
          updateRecordValues(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
        await ctx.invalidation.publish(ctx.tenantId, { resource: 'records' });
        await ctx.webhooks.dispatch(ctx.tenantId, {
          event: 'record.updated',
          recordId: input.recordId,
        });
      }),

    import: tenantProcedure
      .input(
        z.object({
          objectId: z.uuid(),
          rows: z.array(ValuesSchema).min(1).max(MAX_ROWS_PER_CALL),
          dedupe: z
            .object({
              attributeKey: z.string().min(1),
              mode: z.enum(['skip', 'update']),
            })
            .optional(),
          dryRun: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.create' });
        if (input.dedupe?.mode === 'update') {
          authorize(ctx, { type: 'record.update' });
        }
        const result = await withTenant(ctx.db, ctx.tenantId, (tx) =>
          importRecords(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
        if (!input.dryRun && (result.created > 0 || result.updated > 0)) {
          await ctx.invalidation.publish(ctx.tenantId, { resource: 'records' });
        }
        return result;
      }),

    delete: tenantProcedure
      .input(z.object({ recordId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.delete' });
        await withTenant(ctx.db, ctx.tenantId, (tx) =>
          softDeleteRecord(tx, { tenantId: ctx.tenantId, recordId: input.recordId, actor }).catch(
            toTrpcError,
          ),
        );
        await ctx.invalidation.publish(ctx.tenantId, { resource: 'records' });
        await ctx.webhooks.dispatch(ctx.tenantId, {
          event: 'record.deleted',
          recordId: input.recordId,
        });
      }),
  }),

  lists: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      authorize(ctx, { type: 'record.view' });
      return withTenant(ctx.db, ctx.tenantId, (tx) =>
        tx
          .select({ id: lists.id, objectId: lists.objectId, name: lists.name })
          .from(lists)
          .orderBy(asc(lists.createdAt)),
      );
    }),

    create: tenantProcedure
      .input(z.object({ objectId: z.uuid(), name: z.string().trim().min(1).max(80) }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'list.create' });
        return withTenant(ctx.db, ctx.tenantId, (tx) =>
          createList(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
      }),

    createPipeline: tenantProcedure
      .input(
        z.object({
          objectId: z.uuid(),
          name: z.string().trim().min(1).max(80),
          stages: z.array(z.string().trim().min(1).max(64)).min(2).max(20),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'list.create' });
        return withTenant(ctx.db, ctx.tenantId, (tx) =>
          createPipeline(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
      }),

    entries: tenantProcedure
      .input(
        z.object({
          listId: z.uuid(),
          cursor: z.string().optional(),
          limit: z.number().int().positive().max(200).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        authorize(ctx, { type: 'record.view' });
        return withTenant(ctx.db, ctx.tenantId, (tx) =>
          listListEntries(tx, input).catch(toTrpcError),
        );
      }),

    addRecord: tenantProcedure
      .input(z.object({ listId: z.uuid(), recordId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.update' });
        const entry = await withTenant(ctx.db, ctx.tenantId, (tx) =>
          addRecordToList(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
        await ctx.invalidation.publish(ctx.tenantId, { resource: 'list-entries' });
        return entry;
      }),

    removeRecord: tenantProcedure
      .input(z.object({ listId: z.uuid(), recordId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.update' });
        await withTenant(ctx.db, ctx.tenantId, (tx) =>
          removeRecordFromList(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
        await ctx.invalidation.publish(ctx.tenantId, { resource: 'list-entries' });
      }),

    setEntryValues: tenantProcedure
      .input(z.object({ entryId: z.uuid(), values: ValuesSchema }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.update' });
        await withTenant(ctx.db, ctx.tenantId, (tx) =>
          setListEntryValues(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
        await ctx.invalidation.publish(ctx.tenantId, { resource: 'list-entries' });
      }),
  }),

  views: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      authorize(ctx, { type: 'record.view' });
      return withTenant(ctx.db, ctx.tenantId, (tx) =>
        tx
          .select({
            id: savedViews.id,
            objectId: savedViews.objectId,
            listId: savedViews.listId,
            name: savedViews.name,
            type: savedViews.type,
            config: savedViews.config,
          })
          .from(savedViews)
          .orderBy(asc(savedViews.createdAt)),
      );
    }),

    create: tenantProcedure
      .input(
        z.object({
          objectId: z.uuid().optional(),
          listId: z.uuid().optional(),
          name: z.string().trim().min(1).max(80),
          type: z.enum(['table', 'kanban']).optional(),
          config: z.unknown(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.update' });
        return withTenant(ctx.db, ctx.tenantId, (tx) =>
          createSavedView(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
      }),

    updateConfig: tenantProcedure
      .input(z.object({ viewId: z.uuid(), config: z.unknown() }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.update' });
        return withTenant(ctx.db, ctx.tenantId, (tx) =>
          updateSavedViewConfig(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
      }),
  }),
});
