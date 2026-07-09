import { Button } from '@drovano/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { queryClient } from '../data/workspaces.js';
import { trpc } from '../lib/trpc.js';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}

/**
 * Google account connections (TASK-0032). Owner/admin only — the list
 * and sync ride api.manage. Connect is a plain navigation: the API
 * walks the browser through Google's consent and back.
 */
export function GoogleConnectionsSettings() {
  const connections = useQuery(
    {
      queryKey: ['google-connections'],
      queryFn: () => trpc.integrations.google.list.query(),
      retry: false,
    },
    queryClient,
  );

  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<string | undefined>(undefined);

  if (connections.error !== null) {
    return (
      <section className="mt-6 rounded-lg border border-border-hairline p-4">
        <h2 className="text-md font-medium text-text-primary">Google accounts</h2>
        <p className="mt-2 text-sm text-text-muted">
          {errorMessage(
            connections.error,
            'Only organization owners and admins manage integrations.',
          )}
        </p>
      </section>
    );
  }

  const syncNow = (connectionId: string): void => {
    setBusyId(connectionId);
    setError(undefined);
    setSummary(undefined);
    void trpc.integrations.google.sync
      .mutate({ connectionId })
      .then(async (result) => {
        setSummary(
          `Synced ${String(result.fetched)} message${result.fetched === 1 ? '' : 's'} — ` +
            `${String(result.peopleCreated)} people and ${String(result.companiesCreated)} ` +
            `companies created, ${String(result.indexed)} indexed for search.`,
        );
        await queryClient.invalidateQueries({ queryKey: ['google-connections'] });
      })
      .catch((mutationError: unknown) => {
        setError(errorMessage(mutationError, 'Sync failed. Try again.'));
      })
      .finally(() => {
        setBusyId(undefined);
      });
  };

  return (
    <section
      aria-label="Google accounts"
      className="mt-6 rounded-lg border border-border-hairline p-4"
    >
      <h2 className="text-md font-medium text-text-primary">Google accounts</h2>
      <p className="mt-1 text-sm text-text-muted">
        Read-only Gmail and Calendar access. Syncing turns your mail into People and Companies and
        makes messages searchable.
      </p>

      {error !== undefined ? (
        <p role="alert" className="mt-3 text-sm text-status-danger-text">
          {error}
        </p>
      ) : null}
      {summary !== undefined ? (
        <p role="status" className="mt-3 text-sm text-text-primary">
          {summary}
        </p>
      ) : null}

      {connections.data !== undefined && connections.data.length > 0 ? (
        <ul className="mt-3 flex flex-col">
          {connections.data.map((connection) => (
            <li
              key={connection.id}
              className="flex min-h-10 items-center gap-3 border-b border-border-hairline"
            >
              <span className="text-base text-text-primary">{connection.email}</span>
              <span className="text-sm text-text-muted">
                {connection.gmailHistoryId === null ? 'Not synced yet' : 'Syncing incrementally'}
              </span>
              <Button
                variant="ghost"
                className="ml-auto"
                loading={busyId === connection.id}
                onClick={() => {
                  syncNow(connection.id);
                }}
              >
                Sync now
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-secondary">No Google accounts connected yet.</p>
      )}

      <a
        href="/api/integrations/google/connect"
        className="mt-4 inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-base text-text-primary hover:bg-surface-sunken"
      >
        Connect Google account
      </a>
    </section>
  );
}
