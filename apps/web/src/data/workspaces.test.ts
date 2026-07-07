import type { WorkspaceListItem } from '@drovano/api-contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { createWorkspacesCollection } from './workspaces.js';

const ROWS: WorkspaceListItem[] = [
  {
    id: '0197a000-0000-7000-8000-000000000001',
    name: 'General',
    updatedAt: '2026-07-07T00:00:00.000Z',
    myRole: 'admin',
  },
  {
    id: '0197a000-0000-7000-8000-000000000002',
    name: 'Sales',
    updatedAt: '2026-07-07T00:00:00.000Z',
    myRole: 'member',
  },
];

/**
 * Stub transport with real server semantics: `rename` mutates the backing
 * rows, and `list` serves them — after a persisted mutation the collection
 * refetches and must see the server's new truth, exactly like production.
 */
async function setup(
  renameImplementation?: (input: { workspaceId: string; name: string }) => Promise<unknown>,
) {
  let rows = ROWS;
  const list = vi.fn().mockImplementation(() => Promise.resolve(rows));
  const rename = vi.fn().mockImplementation(
    renameImplementation ??
      ((input: { workspaceId: string; name: string }) => {
        rows = rows.map((row) =>
          row.id === input.workspaceId ? { ...row, name: input.name } : row,
        );
        return Promise.resolve({});
      }),
  );
  const collection = createWorkspacesCollection({ list, rename }, new QueryClient());
  await collection.preload();
  // Optimistic overlays materialize for subscribed collections — subscribe
  // exactly like the UI's live query does.
  collection.subscribeChanges(() => undefined);
  return { collection, list, rename };
}

describe('workspaces collection (the blessed optimistic pattern, ADR-0003)', () => {
  it('loads rows through the query loader', async () => {
    const { collection } = await setup();
    expect(collection.size).toBe(2);
    expect(collection.get(ROWS[0]?.id ?? '')?.name).toBe('General');
  });

  it('update applies optimistically, then converges on the server truth', async () => {
    const { collection, rename } = await setup();

    const tx = collection.update(ROWS[0]?.id ?? '', (draft) => {
      draft.name = 'HQ';
    });
    // Immediately visible, before the mutation resolves.
    expect(collection.get(ROWS[0]?.id ?? '')?.name).toBe('HQ');
    expect(rename).toHaveBeenCalledWith({ workspaceId: ROWS[0]?.id, name: 'HQ' });

    await tx.isPersisted.promise;
    // After persistence the collection refetched; the server's truth agrees.
    expect(collection.get(ROWS[0]?.id ?? '')?.name).toBe('HQ');
  });

  it('rolls back automatically when the server refuses', async () => {
    const { collection } = await setup(() =>
      Promise.reject(new Error('only workspace admins may rename')),
    );

    const tx = collection.update(ROWS[1]?.id ?? '', (draft) => {
      draft.name = 'Not allowed';
    });
    // The optimistic change is visible first (guards against this test
    // passing vacuously) …
    expect(collection.get(ROWS[1]?.id ?? '')?.name).toBe('Not allowed');
    await expect(tx.isPersisted.promise).rejects.toThrow(/workspace admins/);
    // … and is undone after the refusal — the UI shows the truth again.
    expect(collection.get(ROWS[1]?.id ?? '')?.name).toBe('Sales');
  });
});
