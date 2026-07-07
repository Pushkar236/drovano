import { Button, Input } from '@drovano/ui';
import { useEffect, useState, type FormEvent } from 'react';

import { authClient } from '../lib/auth-client.js';

function slugify(name: string): string {
  return `${name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-|-$)/g, '')
    .slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Home canvas. A session without an organization gets the first-run
 * onboarding (create the org → provisions the tenant + General workspace,
 * TASK-0008); otherwise the welcome state.
 */
export function HomePage() {
  const { data: session } = authClient.useSession();
  const { data: organizations, isPending } = authClient.useListOrganizations();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const activeOrganizationId = session?.session.activeOrganizationId ?? null;

  // An org exists but none is active on this session: activate the first.
  useEffect(() => {
    const first = organizations?.[0];
    if (activeOrganizationId === null && first !== undefined) {
      void authClient.organization.setActive({ organizationId: first.id });
    }
  }, [activeOrganizationId, organizations]);

  const createOrganization = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (name === '') return;
    setCreating(true);
    setError(undefined);
    void (async () => {
      const result = await authClient.organization.create({ name, slug: slugify(name) });
      if (result.error) {
        setCreating(false);
        setError(result.error.message ?? 'Creating the organization failed. Try again.');
        return;
      }
      await authClient.organization.setActive({ organizationId: result.data.id });
      setCreating(false);
    })();
  };

  if (!isPending && (organizations?.length ?? 0) === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-[24rem]">
          <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
            Create your organization
          </h1>
          <p className="mt-2 text-md text-text-secondary">
            Your organization is the home for your team’s workspaces, records, and — soon — its AI
            workers.
          </p>
          <form onSubmit={createOrganization} className="mt-4 flex flex-col gap-3">
            <Input
              label="Organization name"
              name="name"
              required
              {...(error !== undefined ? { error } : {})}
            />
            <Button type="submit" variant="primary" loading={creating}>
              Create organization
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
          Welcome to Drovano
        </h1>
        <p className="mt-2 text-md text-text-secondary">
          Your workspace is ready. Records, deals, and meetings arrive with the next milestones —
          everything you see already runs on the real platform.
        </p>
        <p className="mt-4 text-base text-text-muted">
          Press{' '}
          <kbd className="rounded-sm border border-border-strong px-1 font-mono text-sm">
            Ctrl K
          </kbd>{' '}
          to open the command surface.
        </p>
      </div>
    </div>
  );
}
