import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';

import { trpc } from '../lib/trpc.js';
import { queryClient } from './workspaces.js';

export interface RecordRow {
  id: string;
  objectId: string;
  values: Record<string, string | number | boolean | string[]>;
  createdAt: string;
  updatedAt: string;
}

export interface CrmTransport {
  query: (objectId: string) => Promise<RecordRow[]>;
  update: (input: {
    recordId: string;
    values: Record<string, string | number | boolean | string[]>;
  }) => Promise<unknown>;
  create: (input: {
    objectId: string;
    values: Record<string, string | number | boolean | string[]>;
  }) => Promise<RecordRow>;
}

const EMPTY_VIEW = { filters: [], sorts: [], columns: [] };

const defaultTransport: CrmTransport = {
  query: async (objectId) => {
    const page = await trpc.crm.records.query.query({
      objectId,
      config: EMPTY_VIEW,
      limit: 200,
    });
    return page.items;
  },
  update: (input) => trpc.crm.records.update.mutate(input),
  create: (input) => trpc.crm.records.create.mutate(input),
};

/**
 * One collection per object (ADR-0003 blessed pattern): the default view's
 * first 200 records with optimistic update/insert. Filtered/sorted saved
 * views query through react-query directly until view-level collections
 * are needed. Factory-shaped for tests; the app uses the module cache.
 */
export function createRecordsCollection(
  objectId: string,
  transport: CrmTransport = defaultTransport,
  client = queryClient,
) {
  return createCollection(
    queryCollectionOptions<RecordRow>({
      queryKey: ['records', objectId],
      queryFn: () => transport.query(objectId),
      queryClient: client,
      getKey: (record) => record.id,
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await transport.update({
            recordId: mutation.modified.id,
            values: mutation.modified.values,
          });
        }
      },
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await transport.create({
            objectId: mutation.modified.objectId,
            values: mutation.modified.values,
          });
        }
      },
    }),
  );
}

const collections = new Map<string, ReturnType<typeof createRecordsCollection>>();

export function recordsCollectionFor(objectId: string) {
  let collection = collections.get(objectId);
  if (collection === undefined) {
    collection = createRecordsCollection(objectId);
    collections.set(objectId, collection);
    // Start the initial sync immediately; live queries subscribe next tick.
    void collection.preload();
  }
  return collection;
}

export interface ObjectDefinitionSummary {
  id: string;
  key: string;
  name: string;
  kind: string;
}

export interface AttributeSummary {
  id: string;
  objectId: string | null;
  listId: string | null;
  key: string;
  name: string;
  type: string;
  /** Type-specific settings (select options, relation target, …). */
  config?: unknown;
  system: boolean;
  archived: boolean;
}

export async function fetchDefinitions(): Promise<{
  objects: ObjectDefinitionSummary[];
  attributes: AttributeSummary[];
}> {
  return trpc.crm.objects.query();
}
