import type { WorkspaceListItem } from '@drovano/api-contracts';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';
import { QueryClient } from '@tanstack/react-query';

import { trpc } from '../lib/trpc.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

export interface WorkspaceCollectionDeps {
  list: () => Promise<WorkspaceListItem[]>;
  rename: (input: { workspaceId: string; name: string }) => Promise<unknown>;
}

/**
 * The blessed client data-layer pattern (ADR-0003): a TanStack DB
 * collection over the tRPC loader. `update()` applies optimistically and
 * rolls back automatically when the server refuses — the UI needs no
 * bespoke optimistic plumbing per feature. Factory-shaped so tests drive
 * it with stub transports.
 */
export function createWorkspacesCollection(deps: WorkspaceCollectionDeps, client = queryClient) {
  return createCollection(
    queryCollectionOptions<WorkspaceListItem>({
      queryKey: ['workspaces'],
      queryFn: () => deps.list(),
      queryClient: client,
      getKey: (workspace) => workspace.id,
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await deps.rename({
            workspaceId: mutation.modified.id,
            name: mutation.modified.name,
          });
        }
      },
    }),
  );
}

export const workspacesCollection = createWorkspacesCollection({
  list: () => trpc.workspaces.list.query(),
  rename: (input) => trpc.workspaces.rename.mutate(input),
});
