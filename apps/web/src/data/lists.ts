import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';

import { trpc } from '../lib/trpc.js';
import { queryClient } from './workspaces.js';

export interface ListEntryRow {
  entryId: string;
  recordId: string;
  recordValues: Record<string, string | number | boolean | string[]>;
  entryValues: Record<string, string | number | boolean | string[]>;
}

export interface ListEntriesTransport {
  entries: (listId: string) => Promise<ListEntryRow[]>;
  setEntryValues: (input: {
    entryId: string;
    values: Record<string, string | number | boolean | string[]>;
  }) => Promise<unknown>;
}

const defaultTransport: ListEntriesTransport = {
  entries: async (listId) => {
    const page = await trpc.crm.lists.entries.query({ listId, limit: 200 });
    return page.items;
  },
  setEntryValues: (input) => trpc.crm.lists.setEntryValues.mutate(input),
};

/** Entry collection per list: optimistic entry-plane updates (stage moves). */
export function createListEntriesCollection(
  listId: string,
  transport: ListEntriesTransport = defaultTransport,
  client = queryClient,
) {
  return createCollection(
    queryCollectionOptions<ListEntryRow>({
      queryKey: ['list-entries', listId],
      queryFn: () => transport.entries(listId),
      queryClient: client,
      getKey: (entry) => entry.entryId,
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await transport.setEntryValues({
            entryId: mutation.modified.entryId,
            values: mutation.modified.entryValues,
          });
        }
      },
    }),
  );
}

const collections = new Map<string, ReturnType<typeof createListEntriesCollection>>();

export function listEntriesCollectionFor(listId: string) {
  let collection = collections.get(listId);
  if (collection === undefined) {
    collection = createListEntriesCollection(listId);
    collections.set(listId, collection);
    void collection.preload();
  }
  return collection;
}
