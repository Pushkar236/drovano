import { withTenant, workspaces, writeAuditEntry } from '@drovano/db';
import { can } from '@drovano/permissions';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { router, tenantProcedure } from '../trpc.js';

export interface WorkspaceListItem {
  id: string;
  name: string;
  updatedAt: string;
  /** The caller's explicit workspace role; org owners/admins may be null (they see all). */
  myRole: 'admin' | 'member' | null;
}

export const workspacesRouter = router({
  list: tenantProcedure.query(async ({ ctx }): Promise<WorkspaceListItem[]> => {
    const rows = await withTenant(ctx.db, ctx.tenantId, (tx) =>
      tx
        .select({ id: workspaces.id, name: workspaces.name, updatedAt: workspaces.updatedAt })
        .from(workspaces)
        .orderBy(workspaces.createdAt),
    );
    // Centralized authorization, evaluated per row (SECURITY.md #6):
    // RLS already scoped rows to the tenant; can() applies role visibility.
    return rows
      .filter((row) => can(ctx.principal, { type: 'workspace.view', workspaceId: row.id }).allowed)
      .map((row) => ({
        id: row.id,
        name: row.name,
        updatedAt: row.updatedAt.toISOString(),
        myRole: ctx.principal.workspaceRoles.get(row.id) ?? null,
      }));
  }),

  /**
   * The optimistic-mutation exemplar (ADR-0003): validate → authorize with
   * reason → mutate + audit in ONE tenant transaction → return the new
   * truth for the client to reconcile against.
   */
  rename: tenantProcedure
    .input(
      z.object({
        workspaceId: z.uuid(),
        name: z
          .string()
          .trim()
          .min(1, 'Workspace name can’t be empty.')
          .max(80, 'Workspace name is limited to 80 characters.'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const decision = can(ctx.principal, {
        type: 'workspace.update',
        workspaceId: input.workspaceId,
      });
      if (!decision.allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: decision.reason });
      }

      const result = await withTenant(ctx.db, ctx.tenantId, async (tx) => {
        const [before] = await tx
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, input.workspaceId));
        if (before === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });
        }

        const [updated] = await tx
          .update(workspaces)
          .set({ name: input.name })
          .where(eq(workspaces.id, input.workspaceId))
          .returning({ id: workspaces.id, name: workspaces.name, updatedAt: workspaces.updatedAt });
        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });
        }

        await writeAuditEntry(tx, {
          tenantId: ctx.tenantId,
          actorKind: 'human',
          actorId: ctx.session.user.id,
          action: 'workspace.rename',
          resourceType: 'workspace',
          resourceId: updated.id,
          detail: { from: before.name, to: updated.name },
        });

        return { id: updated.id, name: updated.name, updatedAt: updated.updatedAt.toISOString() };
      });

      // After commit: tell the tenant's other clients to refetch (ADR-0003).
      await ctx.invalidation.publish(ctx.tenantId, { resource: 'workspaces' });
      return result;
    }),
});
