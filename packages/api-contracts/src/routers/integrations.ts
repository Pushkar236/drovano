/**
 * Integration management surface (TASK-0032 phase 2). Connections are
 * standing tenant-wide plumbing, so listing and syncing sit behind
 * api.manage like keys and agents. The sync itself is an app-tier
 * worker (it composes google + crm + retrieval); absent means the
 * Google OAuth client is not configured on this deployment.
 */
import { GoogleError, listConnections } from '@drovano/google';
import { withTenant } from '@drovano/db';
import { can, type Action } from '@drovano/permissions';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { router, tenantProcedure } from '../trpc.js';

function toTrpcError(error: unknown): never {
  if (error instanceof GoogleError) {
    const code =
      error.code === 'unknown-connection'
        ? 'NOT_FOUND'
        : error.code === 'api-error' || error.code === 'token-refresh-failed'
          ? 'BAD_GATEWAY'
          : 'BAD_REQUEST';
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

type IntegrationsContext = Parameters<Parameters<typeof tenantProcedure.query>[0]>[0]['ctx'];

function authorize(ctx: IntegrationsContext, action: Action): void {
  const decision = can(ctx.principal, action);
  if (!decision.allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: decision.reason });
  }
}

export const integrationsRouter = router({
  google: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      authorize(ctx, { type: 'api.manage' });
      return withTenant(ctx.db, ctx.tenantId, (tx) => listConnections(tx));
    }),

    /**
     * Manual sync trigger (the Trigger.dev schedule wraps the same
     * worker). Bounded per run — repeated calls page through history.
     */
    sync: tenantProcedure
      .input(z.object({ connectionId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        authorize(ctx, { type: 'api.manage' });
        const run = ctx.workers.googleSync;
        if (run === undefined) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Google integration is not configured on this deployment.',
          });
        }
        const result = await run({
          tenantId: ctx.tenantId,
          connectionId: input.connectionId,
        }).catch(toTrpcError);
        if (result.peopleCreated > 0 || result.companiesCreated > 0 || result.indexed > 0) {
          await ctx.invalidation.publish(ctx.tenantId, { resource: 'records' });
        }
        return result;
      }),
  }),
});
