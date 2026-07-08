import {
  createApiKey,
  createWebhook,
  listApiKeys,
  listWebhooks,
  PlatformError,
  removeWebhook,
  revokeApiKey,
  WEBHOOK_EVENTS,
  type Actor,
} from '@drovano/platform';
import { withTenant } from '@drovano/db';
import { can } from '@drovano/permissions';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { router, tenantProcedure } from '../trpc.js';

/** Map typed domain errors to precise transport codes (CODING_STANDARDS). */
function toTrpcError(error: unknown): never {
  if (error instanceof PlatformError) {
    const code =
      error.code === 'unknown-api-key' || error.code === 'unknown-webhook'
        ? 'NOT_FOUND'
        : 'BAD_REQUEST';
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

type PlatformContext = Parameters<Parameters<typeof tenantProcedure.query>[0]>[0]['ctx'];

/** Everything here is standing tenant-wide access: `api.manage` only. */
function authorizeManage(ctx: PlatformContext): Actor {
  const decision = can(ctx.principal, { type: 'api.manage' });
  if (!decision.allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: decision.reason });
  }
  return { kind: 'human', id: ctx.session.user.id };
}

export const platformRouter = router({
  apiKeys: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      authorizeManage(ctx);
      return withTenant(ctx.db, ctx.tenantId, (tx) => listApiKeys(tx, { tenantId: ctx.tenantId }));
    }),

    /** Returns the secret exactly once — it is never retrievable again. */
    create: tenantProcedure
      .input(z.object({ name: z.string().trim().min(1).max(80) }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorizeManage(ctx);
        return withTenant(ctx.db, ctx.tenantId, (tx) =>
          createApiKey(tx, { tenantId: ctx.tenantId, name: input.name, actor }),
        );
      }),

    revoke: tenantProcedure
      .input(z.object({ keyId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorizeManage(ctx);
        await withTenant(ctx.db, ctx.tenantId, (tx) =>
          revokeApiKey(tx, { tenantId: ctx.tenantId, keyId: input.keyId, actor }).catch(
            toTrpcError,
          ),
        );
      }),
  }),

  webhooks: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      authorizeManage(ctx);
      return withTenant(ctx.db, ctx.tenantId, (tx) => listWebhooks(tx, { tenantId: ctx.tenantId }));
    }),

    /** Returns the signing secret exactly once. */
    create: tenantProcedure
      .input(
        z.object({
          url: z.url(),
          events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const actor = authorizeManage(ctx);
        return withTenant(ctx.db, ctx.tenantId, (tx) =>
          createWebhook(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
        );
      }),

    remove: tenantProcedure
      .input(z.object({ webhookId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorizeManage(ctx);
        await withTenant(ctx.db, ctx.tenantId, (tx) =>
          removeWebhook(tx, { tenantId: ctx.tenantId, webhookId: input.webhookId, actor }).catch(
            toTrpcError,
          ),
        );
      }),
  }),
});
