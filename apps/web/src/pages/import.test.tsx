import { RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
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

const { importMutate } = vi.hoisted(() => ({
  importMutate: vi.fn().mockResolvedValue({ created: 2, updated: 0, skipped: 0, errors: [] }),
}));

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
              id: 'attr-domain',
              objectId: 'obj-company',
              listId: null,
              key: 'domain',
              name: 'Domain',
              type: 'url',
              system: false,
              archived: false,
            },
          ],
        }),
      },
      records: { import: { mutate: importMutate } },
    },
  },
}));

import { createTestRouter } from '../router.js';

describe('import page', () => {
  async function renderImport() {
    const router = createTestRouter('/o/company/import');
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: 'Import company records' });
  }

  it('parses a CSV, auto-maps matching headers, dry-runs, then imports', async () => {
    await renderImport();
    const file = new File(
      ['name,domain,ignored\nAcme,https://acme.example,x\nGlobex,,y\n'],
      'companies.csv',
      {
        type: 'text/csv',
      },
    );
    await userEvent.upload(screen.getByLabelText('CSV file'), file);

    // Auto-mapping matched the headers; the unknown column defaults to skip.
    expect(await screen.findByRole('combobox', { name: 'Map name' })).toHaveValue('name');
    expect(screen.getByRole('combobox', { name: 'Map ignored' })).toHaveValue('__skip__');

    await userEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    expect(await screen.findByText(/Dry run — nothing written/)).toBeInTheDocument();
    expect(importMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: 'obj-company',
        dryRun: true,
        rows: [{ name: 'Acme', domain: 'https://acme.example' }, { name: 'Globex' }],
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Import 2 rows' }));
    expect(await screen.findByText(/Import complete/)).toBeInTheDocument();
    expect(importMutate).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: false }));
  });

  it('passes axe', async () => {
    await renderImport();
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
