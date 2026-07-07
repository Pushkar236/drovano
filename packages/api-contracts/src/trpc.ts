import { initTRPC, TRPCError } from '@trpc/server';

import type { RequestContext } from './context.js';

const t = initTRPC.context<RequestContext>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/** Requires a signed-in session. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.session === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to continue.' });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/** Requires a session acting inside an organization (tenant context). */
export const tenantProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.principal === null || ctx.session.activeOrganizationId === null) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No active organization. Create or select an organization first.',
    });
  }
  return next({
    ctx: { ...ctx, principal: ctx.principal, tenantId: ctx.session.activeOrganizationId },
  });
});
