import { meRouter } from './routers/me.js';
import { workspacesRouter } from './routers/workspaces.js';
import { createCallerFactory, router } from './trpc.js';

export const appRouter = router({
  me: meRouter,
  workspaces: workspacesRouter,
});

export type AppRouter = typeof appRouter;

/** For integration tests: call procedures directly against a context. */
export const createCaller = createCallerFactory(appRouter);

export {
  createRequestContext,
  type CreateRequestContextInput,
  type RequestContext,
  type SessionUser,
} from './context.js';
export type { WorkspaceListItem } from './routers/workspaces.js';
