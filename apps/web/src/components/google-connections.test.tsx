import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { googleList, googleSync } = vi.hoisted(() => ({
  googleList: vi.fn(),
  googleSync: vi.fn(),
}));

vi.mock('../lib/trpc.js', () => ({
  trpc: {
    integrations: {
      google: {
        list: { query: googleList },
        sync: { mutate: googleSync },
      },
    },
  },
}));

import { queryClient } from '../data/workspaces.js';

import { GoogleConnectionsSettings } from './google-connections.js';

describe('google connections settings', () => {
  beforeEach(() => {
    queryClient.clear();
    // Server-faithful stubs: FRESH objects per response (test stub law).
    googleList.mockImplementation(() =>
      Promise.resolve([
        {
          id: 'conn-1',
          email: 'owner@corp.example',
          userId: 'user-1',
          scope: 'gmail.readonly',
          gmailHistoryId: null,
          calendarSyncToken: null,
          createdAt: '2026-07-09T00:00:00.000Z',
        },
      ]),
    );
    googleSync.mockImplementation(() =>
      Promise.resolve({
        mode: 'full',
        fetched: 12,
        indexed: 10,
        peopleCreated: 4,
        companiesCreated: 2,
        cursor: '1010',
      }),
    );
  });

  it('lists connections with sync state and the connect link', async () => {
    render(<GoogleConnectionsSettings />);
    expect(await screen.findByText('owner@corp.example')).toBeInTheDocument();
    expect(screen.getByText('Not synced yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect Google account' })).toHaveAttribute(
      'href',
      '/api/integrations/google/connect',
    );
  });

  it('syncing reports what was built from the mailbox', async () => {
    render(<GoogleConnectionsSettings />);
    await screen.findByText('owner@corp.example');
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Synced 12 messages — 4 people and 2 companies created, 10 indexed for search.',
    );
    expect(googleSync).toHaveBeenCalledWith({ connectionId: 'conn-1' });
  });

  it('shows the sync error when the server refuses', async () => {
    googleSync.mockImplementation(() =>
      Promise.reject(new Error('Google integration is not configured on this deployment.')),
    );
    render(<GoogleConnectionsSettings />);
    await screen.findByText('owner@corp.example');
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google integration is not configured',
    );
  });

  it('members see the denial reason instead of the list', async () => {
    googleList.mockImplementation(() =>
      Promise.reject(new Error('only organization owners/admins may manage integrations')),
    );
    render(<GoogleConnectionsSettings />);
    expect(
      await screen.findByText(/only organization owners\/admins may manage integrations/),
    ).toBeInTheDocument();
  });
});
