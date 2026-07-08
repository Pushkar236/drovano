import { Button, Input } from '@drovano/ui';
import { useQuery } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { queryClient } from '../data/workspaces.js';
import { readFormValue } from '../lib/form.js';
import { trpc } from '../lib/trpc.js';

const EVENT_OPTIONS = ['record.created', 'record.updated', 'record.deleted'] as const;
type EventOption = (typeof EVENT_OPTIONS)[number];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}

/**
 * API keys + webhooks management (TASK-0029). Owner/admin only — members
 * get the server's FORBIDDEN reason instead of the lists. Secrets appear
 * exactly once, at creation; copy them before leaving the page.
 */
export function ApiAccessSettings() {
  const keys = useQuery(
    { queryKey: ['api-keys'], queryFn: () => trpc.platform.apiKeys.list.query(), retry: false },
    queryClient,
  );
  const webhooks = useQuery(
    { queryKey: ['webhooks'], queryFn: () => trpc.platform.webhooks.list.query(), retry: false },
    queryClient,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [newSecret, setNewSecret] = useState<string | undefined>(undefined);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | undefined>(undefined);

  if (keys.error !== null) {
    return (
      <section className="mt-6 rounded-lg border border-border-hairline p-4">
        <h2 className="text-md font-medium text-text-primary">API access</h2>
        <p className="mt-2 text-sm text-text-muted">
          {errorMessage(keys.error, 'Only organization owners and admins manage API access.')}
        </p>
      </section>
    );
  }

  const createKey = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = readFormValue(event.currentTarget, 'name').trim();
    if (name === '') return;
    setBusy(true);
    setError(undefined);
    void trpc.platform.apiKeys.create
      .mutate({ name })
      .then(async (created) => {
        setNewSecret(created.secret);
        await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      })
      .catch((mutationError: unknown) => {
        setError(errorMessage(mutationError, 'Creating the key failed. Try again.'));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const revokeKey = (keyId: string): void => {
    void trpc.platform.apiKeys.revoke
      .mutate({ keyId })
      .then(() => queryClient.invalidateQueries({ queryKey: ['api-keys'] }))
      .catch((mutationError: unknown) => {
        setError(errorMessage(mutationError, 'Revoking the key failed. Try again.'));
      });
  };

  const createWebhook = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = event.currentTarget;
    const url = readFormValue(form, 'url').trim();
    const events = EVENT_OPTIONS.filter(
      (option) => (form.elements.namedItem(option) as HTMLInputElement | null)?.checked === true,
    );
    if (url === '' || events.length === 0) {
      setError('A webhook needs a URL and at least one event.');
      return;
    }
    setBusy(true);
    setError(undefined);
    void trpc.platform.webhooks.create
      .mutate({ url, events })
      .then(async (created) => {
        setNewWebhookSecret(created.secret);
        await queryClient.invalidateQueries({ queryKey: ['webhooks'] });
        form.reset();
      })
      .catch((mutationError: unknown) => {
        setError(errorMessage(mutationError, 'Creating the webhook failed. Try again.'));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const removeWebhook = (webhookId: string): void => {
    void trpc.platform.webhooks.remove
      .mutate({ webhookId })
      .then(() => queryClient.invalidateQueries({ queryKey: ['webhooks'] }))
      .catch((mutationError: unknown) => {
        setError(errorMessage(mutationError, 'Removing the webhook failed. Try again.'));
      });
  };

  return (
    <section aria-label="API access" className="mt-6 flex flex-col gap-6">
      {error !== undefined ? (
        <p role="alert" className="text-sm text-status-danger-text">
          {error}
        </p>
      ) : null}

      <div className="rounded-lg border border-border-hairline p-4">
        <h2 className="text-md font-medium text-text-primary">API keys</h2>
        <p className="mt-1 text-sm text-text-muted">
          Bearer credentials for the public API. Send as{' '}
          <code className="font-mono text-sm">Authorization: Bearer drv_…</code>
        </p>

        {newSecret !== undefined ? (
          <p className="mt-3 rounded-md border border-border-strong bg-surface-sunken p-3 text-sm text-text-primary">
            Copy this key now — it is shown once:{' '}
            <code className="break-all font-mono">{newSecret}</code>
          </p>
        ) : null}

        {keys.data !== undefined && keys.data.length > 0 ? (
          <ul className="mt-3 flex flex-col">
            {keys.data.map((key) => (
              <li
                key={key.id}
                className="flex min-h-10 items-center gap-3 border-b border-border-hairline"
              >
                <span className="text-base text-text-primary">{key.name}</span>
                <code className="font-mono text-sm text-text-muted">{key.keyPrefix}…</code>
                {key.revokedAt !== null ? (
                  <span className="text-sm text-text-muted">revoked</span>
                ) : (
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => {
                      revokeKey(key.id);
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">No API keys yet.</p>
        )}

        <form onSubmit={createKey} className="mt-4 flex items-end gap-2">
          <Input label="Key name" name="name" required />
          <Button type="submit" variant="primary" loading={busy}>
            Create key
          </Button>
        </form>
      </div>

      <div className="rounded-lg border border-border-hairline p-4">
        <h2 className="text-md font-medium text-text-primary">Webhooks</h2>
        <p className="mt-1 text-sm text-text-muted">
          Signed POSTs (HMAC-SHA256 in{' '}
          <code className="font-mono text-sm">X-Drovano-Signature</code>) on record events. No
          retries yet — treat deliveries as best-effort.
        </p>

        {newWebhookSecret !== undefined ? (
          <p className="mt-3 rounded-md border border-border-strong bg-surface-sunken p-3 text-sm text-text-primary">
            Signing secret — shown once:{' '}
            <code className="break-all font-mono">{newWebhookSecret}</code>
          </p>
        ) : null}

        {webhooks.data !== undefined && webhooks.data.length > 0 ? (
          <ul className="mt-3 flex flex-col">
            {webhooks.data.map((hook) => (
              <li
                key={hook.id}
                className="flex min-h-10 items-center gap-3 border-b border-border-hairline"
              >
                <code className="break-all font-mono text-sm text-text-primary">{hook.url}</code>
                <span className="text-sm text-text-muted">{hook.events.join(', ')}</span>
                <Button
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => {
                    removeWebhook(hook.id);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">No webhooks yet.</p>
        )}

        <form onSubmit={createWebhook} className="mt-4 flex flex-col gap-2">
          <Input label="Endpoint URL" name="url" type="url" required />
          <fieldset className="flex flex-wrap gap-4">
            <legend className="text-sm font-medium text-text-primary">Events</legend>
            {EVENT_OPTIONS.map((option: EventOption) => (
              <label key={option} className="flex items-center gap-1 text-sm text-text-primary">
                <input type="checkbox" name={option} defaultChecked={option === 'record.created'} />
                {option}
              </label>
            ))}
          </fieldset>
          <Button type="submit" variant="primary" loading={busy} className="self-start">
            Add webhook
          </Button>
        </form>
      </div>
    </section>
  );
}
