import { authedProcedure, router } from '../trpc.js';

export const meRouter = router({
  get: authedProcedure.query(({ ctx }) => ({
    user: ctx.session.user,
    activeOrganizationId: ctx.session.activeOrganizationId,
    organizationRole: ctx.principal?.organizationRole ?? null,
  })),
});
