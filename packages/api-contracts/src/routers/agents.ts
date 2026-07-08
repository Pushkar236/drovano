/**
 * Agent trust surface (TASK-0037): manage agent identities and grants
 * (standing access → api.manage, like API keys), review proposals.
 * Acceptance composes HERE — modules never import modules — so the
 * status flip (agents module) and the record write (crm module, with
 * the HUMAN reviewer as actor) share one transaction: both commit or
 * neither does.
 */
import {
  AgentsError,
  createAgent,
  listAgents,
  listProposals,
  reviewProposal,
  setAgentGrants,
  type Actor,
} from '@drovano/agents';
import { CrmError, updateRecordValues } from '@drovano/crm';
import { withTenant } from '@drovano/db';
import { can, GRANTABLE_ACTIONS, type Action } from '@drovano/permissions';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { router, tenantProcedure } from '../trpc.js';

/** Map typed domain errors to precise transport codes (CODING_STANDARDS). */
function toTrpcError(error: unknown): never {
  if (error instanceof AgentsError) {
    const code =
      error.code === 'unknown-agent' ||
      error.code === 'unknown-proposal' ||
      error.code === 'unknown-record'
        ? 'NOT_FOUND'
        : error.code === 'already-reviewed'
          ? 'CONFLICT'
          : error.code === 'not-permitted'
            ? 'FORBIDDEN'
            : error.code === 'spend-cap-exceeded'
              ? 'TOO_MANY_REQUESTS'
              : 'BAD_REQUEST';
    throw new TRPCError({ code, message: error.message });
  }
  if (error instanceof CrmError) {
    // Surfaces when an accepted proposal's changes no longer fit the
    // record's attributes (e.g. attribute removed since proposal time).
    throw new TRPCError({
      code: error.code === 'unknown-record' ? 'NOT_FOUND' : 'BAD_REQUEST',
      message: error.message,
    });
  }
  throw error;
}

type AgentsContext = Parameters<Parameters<typeof tenantProcedure.query>[0]>[0]['ctx'];

function authorize(ctx: AgentsContext, action: Action): Actor {
  const decision = can(ctx.principal, action);
  if (!decision.allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: decision.reason });
  }
  return { kind: 'human', id: ctx.session.user.id };
}

const GrantSchema = z.enum([...GRANTABLE_ACTIONS] as [string, ...string[]]);

export const agentsRouter = router({
  /** Creating agents and shaping their grants is standing tenant-wide
   * access — gated like API keys (api.manage: owner/admin). */
  create: tenantProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        worker: z.string().trim().min(1).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = authorize(ctx, { type: 'api.manage' });
      return withTenant(ctx.db, ctx.tenantId, (tx) =>
        createAgent(tx, { tenantId: ctx.tenantId, ...input, actor }),
      );
    }),

  list: tenantProcedure.query(async ({ ctx }) => {
    authorize(ctx, { type: 'record.view' });
    return withTenant(ctx.db, ctx.tenantId, (tx) => listAgents(tx));
  }),

  setGrants: tenantProcedure
    .input(z.object({ agentId: z.uuid(), actions: z.array(GrantSchema) }))
    .mutation(async ({ ctx, input }) => {
      const actor = authorize(ctx, { type: 'api.manage' });
      await withTenant(ctx.db, ctx.tenantId, (tx) =>
        setAgentGrants(tx, { tenantId: ctx.tenantId, ...input, actor }).catch(toTrpcError),
      );
    }),

  workers: router({
    /**
     * Manual worker trigger (TASK-0038 v1; Trigger.dev wraps this once
     * durable execution lands). The worker only STAGES proposals, so
     * running it is safe — but it consumes tenant AI budget, hence the
     * api.manage gate (standing access, like keys and agents).
     */
    recordKeeper: tenantProcedure
      .input(
        z.object({
          agentId: z.uuid(),
          recordId: z.uuid(),
          instruction: z.string().trim().min(1).max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        authorize(ctx, { type: 'api.manage' });
        const run = ctx.workers.recordKeeper;
        if (run === undefined) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'AI is disabled: no language-model key is configured (ADR-0014).',
          });
        }
        return run({ tenantId: ctx.tenantId, ...input }).catch(toTrpcError);
      }),
  }),

  proposals: router({
    list: tenantProcedure
      .input(
        z.object({ status: z.enum(['pending', 'accepted', 'rejected']).optional() }).optional(),
      )
      .query(async ({ ctx, input }) => {
        authorize(ctx, { type: 'record.view' });
        return withTenant(ctx.db, ctx.tenantId, (tx) => listProposals(tx, input ?? {}));
      }),

    /**
     * Human review. Accepting applies the changes via crm's
     * updateRecordValues with the REVIEWER as actor, inside the same
     * transaction as the status flip — the audit trail shows the human
     * accepting and the record update in their name.
     */
    review: tenantProcedure
      .input(z.object({ proposalId: z.uuid(), decision: z.enum(['accepted', 'rejected']) }))
      .mutation(async ({ ctx, input }) => {
        const actor = authorize(ctx, { type: 'record.update' });
        const reviewed = await withTenant(ctx.db, ctx.tenantId, async (tx) => {
          const proposal = await reviewProposal(tx, {
            tenantId: ctx.tenantId,
            proposalId: input.proposalId,
            decision: input.decision,
            actor,
          });
          if (proposal.status === 'accepted') {
            await updateRecordValues(tx, {
              tenantId: ctx.tenantId,
              recordId: proposal.recordId,
              values: proposal.changes,
              actor,
            });
          }
          return proposal;
        }).catch(toTrpcError);

        if (reviewed.status === 'accepted') {
          await ctx.invalidation.publish(ctx.tenantId, { resource: 'records' });
          await ctx.webhooks.dispatch(ctx.tenantId, {
            event: 'record.updated',
            recordId: reviewed.recordId,
          });
        }
        return reviewed;
      }),
  }),
});
