import { RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' },
        session: { activeOrganizationId: 'org-1' },
      },
      isPending: false,
    }),
    useListOrganizations: () => ({ data: [{ id: 'org-1' }], isPending: false }),
    organization: { setActive: vi.fn().mockResolvedValue({ data: null, error: null }) },
    signOut: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Server-faithful stub: setEntryValues mutates the backing entries and
// every response returns fresh objects (real JSON never aliases).
const { serverEntries, setEntryValuesMutate } = vi.hoisted(() => {
  interface Entry {
    entryId: string;
    recordId: string;
    recordValues: Record<string, unknown>;
    entryValues: Record<string, unknown>;
  }
  const serverEntries: Entry[] = [
    {
      entryId: 'e-1',
      recordId: 'r-1',
      recordValues: { name: 'Acme' },
      entryValues: { stage: 'Lead' },
    },
    {
      entryId: 'e-2',
      recordId: 'r-2',
      recordValues: { name: 'Globex' },
      entryValues: {},
    },
  ];
  const setEntryValuesMutate = vi
    .fn()
    .mockImplementation((input: { entryId: string; values: Record<string, unknown> }) => {
      const index = serverEntries.findIndex((entry) => entry.entryId === input.entryId);
      const entry = serverEntries[index];
      if (entry) {
        serverEntries[index] = {
          ...entry,
          entryValues: { ...entry.entryValues, ...input.values },
        };
      }
      return Promise.resolve(undefined);
    });
  return { serverEntries, setEntryValuesMutate };
});

vi.mock('../lib/trpc.js', () => ({
  trpc: {
    crm: {
      objects: {
        query: vi.fn().mockResolvedValue({
          objects: [{ id: 'obj-company', key: 'company', name: 'Company', kind: 'standard' }],
          attributes: [
            {
              id: 'attr-stage',
              objectId: null,
              listId: 'list-1',
              key: 'stage',
              name: 'Stage',
              type: 'select',
              config: { options: ['Lead', 'Won'] },
              system: true,
              archived: false,
            },
          ],
        }),
      },
      lists: {
        list: {
          query: vi
            .fn()
            .mockResolvedValue([{ id: 'list-1', objectId: 'obj-company', name: 'Sales pipeline' }]),
        },
        entries: {
          query: vi.fn().mockImplementation(() =>
            Promise.resolve({
              items: serverEntries.map((entry) => ({
                ...entry,
                recordValues: { ...entry.recordValues },
                entryValues: { ...entry.entryValues },
              })),
              nextCursor: null,
            }),
          ),
        },
        setEntryValues: { mutate: setEntryValuesMutate },
      },
    },
  },
}));

import { createTestRouter } from '../router.js';

async function renderBoard() {
  const router = createTestRouter('/lists/list-1');
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Sales pipeline' });
  await waitFor(() => {
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });
  return router;
}

describe('pipeline board', () => {
  it('renders lanes from the stage options with cards in the right lanes', async () => {
    await renderBoard();
    const leadLane = screen.getByRole('region', { name: /Lead/ });
    const noStageLane = screen.getByRole('region', { name: /No stage/ });
    expect(leadLane.textContent).toContain('Acme');
    expect(noStageLane.textContent).toContain('Globex');
    expect(screen.getByRole('region', { name: /Won/ }).textContent).toContain('Empty');
  });

  it('moves a card through the menu, optimistically, and persists', async () => {
    await renderBoard();
    const leadLane = screen.getByRole('region', { name: /Lead/ });
    const moveButton = Array.from(leadLane.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Move to'),
    );
    expect(moveButton).toBeDefined();
    await userEvent.click(moveButton as HTMLElement);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Won' }));

    // Optimistic: Acme is in the Won lane immediately.
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Won/ }).textContent).toContain('Acme');
    });
    await waitFor(() => {
      expect(setEntryValuesMutate).toHaveBeenCalledWith({
        entryId: 'e-1',
        values: { stage: 'Won' },
      });
    });
  });

  it('passes axe', async () => {
    await renderBoard();
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
