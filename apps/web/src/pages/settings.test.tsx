import { RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
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
    useListOrganizations: () => ({ data: [{ id: 'org-1' }], isPending: false }),
    organization: { setActive: vi.fn().mockResolvedValue({ data: null, error: null }) },
    signOut: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

const { keysList, keysCreate, keysRevoke, webhooksList, webhooksCreate, webhooksRemove } =
  vi.hoisted(() => ({
    keysList: vi.fn(),
    keysCreate: vi.fn(),
    keysRevoke: vi.fn().mockResolvedValue(undefined),
    webhooksList: vi.fn(),
    webhooksCreate: vi.fn(),
    webhooksRemove: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('../lib/trpc.js', () => ({
  trpc: {
    platform: {
      apiKeys: {
        list: { query: keysList },
        create: { mutate: keysCreate },
        revoke: { mutate: keysRevoke },
      },
      webhooks: {
        list: { query: webhooksList },
        create: { mutate: webhooksCreate },
        remove: { mutate: webhooksRemove },
      },
    },
  },
}));

import { queryClient } from '../data/workspaces.js';
import { createTestRouter } from '../router.js';

describe('settings page — api access', () => {
  beforeEach(() => {
    queryClient.clear();
    // Server-faithful stubs: FRESH objects per response (test stub law).
    keysList.mockImplementation(() =>
      Promise.resolve([
        {
          id: 'key-1',
          name: 'CI key',
          keyPrefix: 'drv_ab12cd34', // gitleaks:allow — fake test fixture
          lastUsedAt: null,
          revokedAt: null,
          createdAt: '2026-07-08T00:00:00.000Z',
        },
      ]),
    );
    keysCreate.mockImplementation(() =>
      Promise.resolve({
        id: 'key-2',
        name: 'New key',
        keyPrefix: 'drv_ef56ab78', // gitleaks:allow — fake test fixture
        secret: 'drv_' + 'e'.repeat(48),
        lastUsedAt: null,
        revokedAt: null,
        createdAt: '2026-07-08T00:00:00.000Z',
      }),
    );
    webhooksList.mockImplementation(() =>
      Promise.resolve([
        {
          id: 'hook-1',
          url: 'https://receiver.example/hooks',
          events: ['record.created'],
          active: true,
          createdAt: '2026-07-08T00:00:00.000Z',
        },
      ]),
    );
    webhooksCreate.mockImplementation(() =>
      Promise.resolve({
        id: 'hook-2',
        url: 'https://receiver.example/other',
        events: ['record.created'],
        active: true,
        secret: 'whsec_' + 'a'.repeat(48),
        createdAt: '2026-07-08T00:00:00.000Z',
      }),
    );
  });

  async function renderSettings() {
    const router = createTestRouter('/settings');
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: 'Settings' });
    await screen.findByText('CI key');
  }

  it('lists keys and webhooks; creating a key shows the secret once', async () => {
    await renderSettings();
    expect(screen.getByText('drv_ab12cd34…')).toBeInTheDocument();
    expect(screen.getByText('https://receiver.example/hooks')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Key name'), 'New key');
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByText(/Copy this key now/)).toBeInTheDocument();
    expect(screen.getByText('drv_' + 'e'.repeat(48))).toBeInTheDocument();
    expect(keysCreate).toHaveBeenCalledWith({ name: 'New key' });
  });

  it('revokes keys and adds webhooks with selected events', async () => {
    await renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(keysRevoke).toHaveBeenCalledWith({ keyId: 'key-1' });

    await userEvent.type(screen.getByLabelText('Endpoint URL'), 'https://receiver.example/other');
    await userEvent.click(screen.getByRole('checkbox', { name: 'record.deleted' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add webhook' }));
    expect(await screen.findByText(/Signing secret/)).toBeInTheDocument();
    expect(webhooksCreate).toHaveBeenCalledWith({
      url: 'https://receiver.example/other',
      events: ['record.created', 'record.deleted'],
    });
  });

  it('members see the denial reason instead of the lists', async () => {
    keysList.mockImplementation(() =>
      Promise.reject(new Error('only organization owners/admins may manage API keys and webhooks')),
    );
    const router = createTestRouter('/settings');
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByText(/only organization owners\/admins may manage/),
    ).toBeInTheDocument();
  });

  it('passes axe', async () => {
    await renderSettings();
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
