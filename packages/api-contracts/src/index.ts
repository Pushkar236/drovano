import { agentsRouter } from './routers/agents.js';
import { crmRouter } from './routers/crm.js';
import { meRouter } from './routers/me.js';
import { platformRouter } from './routers/platform.js';
import { workspacesRouter } from './routers/workspaces.js';
import { createCallerFactory, router } from './trpc.js';

export const appRouter = router({
  me: meRouter,
  workspaces: workspacesRouter,
  crm: crmRouter,
  platform: platformRouter,
  agents: agentsRouter,
});

export type AppRouter = typeof appRouter;

/** For integration tests: call procedures directly against a context. */
export const createCaller = createCallerFactory(appRouter);

export {
  createRequestContext,
  type CreateRequestContextInput,
  type RequestContext,
  type SessionUser,
  type WorkerRuns,
} from './context.js';
export {
  INVALIDATION_CHANNEL_PREFIX,
  InvalidationMessage,
  invalidationChannel,
  noopInvalidationPublisher,
  type InvalidationPublisher,
} from './invalidation.js';
export type { WorkspaceListItem } from './routers/workspaces.js';
