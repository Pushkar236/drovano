import { RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' },
        session: { activeOrganizationId: 'org-1' },
      },
      isPending: false,
    }),
    useListOrganizations: () => ({
      data: [{ id: 'org-1', name: 'Test Org', slug: 'test-org' }],
      isPending: false,
    }),
    organization: { setActive: vi.fn().mockResolvedValue({ data: null, error: null }) },
    signOut: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Server-faithful stubs (see workspaces.test.ts): mutations change the
// backing rows, so the post-persist refetch returns the NEW truth.
const { serverRows, updateMutate, createMutate } = vi.hoisted(() => {
  interface Row {
    id: string;
    objectId: string;
    values: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }
  const serverRows: Row[] = [
    {
      id: 'r-1',
      objectId: 'obj-company',
      values: { name: 'Acme', employees: 50 },
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
    {
      id: 'r-2',
      objectId: 'obj-company',
      values: { name: 'Globex', employees: 500 },
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
  ];
  const updateMutate = vi
    .fn()
    .mockImplementation((input: { recordId: string; values: Record<string, unknown> }) => {
      const index = serverRows.findIndex((candidate) => candidate.id === input.recordId);
      const row = serverRows[index];
      if (row) {
        serverRows[index] = { ...row, values: { ...row.values, ...input.values } };
      }
      return Promise.resolve(undefined);
    });
  const createMutate = vi
    .fn()
    .mockImplementation((input: { objectId: string; values: Record<string, unknown> }) => {
      const row: Row = {
        id: `r-new-${String(serverRows.length)}`,
        objectId: input.objectId,
        values: input.values,
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
      };
      serverRows.push(row);
      return Promise.resolve(row);
    });
  return { serverRows, updateMutate, createMutate };
});

vi.mock('../lib/trpc.js', () => ({
  trpc: {
    crm: {
      objects: {
        query: vi.fn().mockResolvedValue({
          objects: [{ id: 'obj-company', key: 'company', name: 'Company', kind: 'standard' }],
          attributes: [
            {
              id: 'attr-name',
              objectId: 'obj-company',
              listId: null,
              key: 'name',
              name: 'Name',
              type: 'text',
              system: true,
              archived: false,
            },
            {
              id: 'attr-employees',
              objectId: 'obj-company',
              listId: null,
              key: 'employees',
              name: 'Employees',
              type: 'number',
              system: false,
              archived: false,
            },
          ],
        }),
      },
      records: {
        query: {
          // Fresh objects every response, like real JSON transport.
          query: vi.fn().mockImplementation(() =>
            Promise.resolve({
              items: serverRows.map((row) => ({ ...row, values: { ...row.values } })),
              nextCursor: null,
              page: null,
            }),
          ),
        },
        update: { mutate: updateMutate },
        create: { mutate: createMutate },
        get: {
          query: vi.fn().mockImplementation((input: { recordId: string }) => {
            const row = serverRows.find((candidate) => candidate.id === input.recordId);
            return row
              ? Promise.resolve({ ...row, values: { ...row.values } })
              : Promise.reject(new Error('not found'));
          }),
        },
        activity: {
          query: vi.fn().mockResolvedValue({
            items: [
              {
                id: 'a-1',
                action: 'record.update',
                actorKind: 'human',
                actorId: 'user-1',
                detail: { keys: ['name'] },
                at: '2026-07-07T10:30:00.000Z',
              },
              {
                id: 'a-0',
                action: 'record.create',
                actorKind: 'system',
                actorId: null,
                detail: null,
                at: '2026-07-07T09:00:00.000Z',
              },
            ],
            nextCursor: null,
          }),
        },
      },
    },
  },
}));

import { closePeek } from '../lib/peek.js';
import { createTestRouter } from '../router.js';

const INITIAL_ROWS = serverRows.map((row) => ({ ...row, values: { ...row.values } }));
beforeEach(() => {
  serverRows.splice(
    0,
    serverRows.length,
    ...INITIAL_ROWS.map((row) => ({ ...row, values: { ...row.values } })),
  );
  closePeek(); // the peek store is module-level, like in the app
});

async function renderRecords() {
  const router = createTestRouter('/o/company');
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Company records' });
  await waitFor(() => {
    // The module-level collection survives across tests (as in the app);
    // match the row rather than one historical cell value.
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
  });
  return router;
}

describe('records grid', () => {
  it('renders columns and virtualized rows from the collection', async () => {
    await renderRecords();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Employees' })).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    // Numeric cells get the tabular treatment.
    expect(screen.getByText('500').className).toContain('font-mono');
  });

  it('keyboard grid: arrows move the roving focus', async () => {
    await renderRecords();
    const firstCell = screen.getByText('Acme');
    firstCell.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('50');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('500');
    await userEvent.keyboard('{Home}');
    expect(document.activeElement?.textContent).toBe('Globex');
  });

  it('Enter edits, commits optimistically, and calls the mutation', async () => {
    await renderRecords();
    screen.getByText('Acme').focus();
    await userEvent.keyboard('{Enter}');
    const editor = await screen.findByRole('textbox', { name: 'Edit Name' });
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Acme Corp{Enter}');

    await waitFor(() => {
      expect(updateMutate).toHaveBeenCalledWith({
        recordId: 'r-1',
        values: { name: 'Acme Corp', employees: 50 },
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('grid').textContent).toContain('Acme Corp');
    });
  });

  it('Escape cancels the edit without mutating', async () => {
    await renderRecords();
    screen.getByText('Globex').focus();
    await userEvent.keyboard('{Enter}');
    const editor = await screen.findByRole('textbox', { name: 'Edit Name' });
    await userEvent.type(editor, 'zzz{Escape}');
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalledWith(expect.objectContaining({ recordId: 'r-2' }));
  });

  it('Space opens the peek panel with values and the timeline', async () => {
    await renderRecords();
    screen.getByText(/^Acme/).focus();
    await userEvent.keyboard(' ');
    const panel = await screen.findByRole('complementary', { name: 'Context panel' });
    await waitFor(() => {
      expect(panel.textContent).toContain('Activity');
    });
    expect(panel.textContent).toContain('Updated');
    expect(panel.textContent).toContain('Created');
    expect(panel.textContent).toContain('(system)');

    await userEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('complementary', { name: 'Context panel' })).not.toBeInTheDocument();
  });

  it('passes axe', async () => {
    await renderRecords();
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
