import { Button, Input } from '@drovano/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type SyntheticEvent } from 'react';

import { fetchDefinitions } from '../data/crm.js';
import { queryClient } from '../data/workspaces.js';
import { readFormValue } from '../lib/form.js';
import { trpc } from '../lib/trpc.js';

const DEFAULT_STAGES = 'Lead, Qualified, Won, Lost';

/** Pipelines index: existing lists + the create-pipeline flow (TASK-0026). */
export function PipelinesPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const definitions = useQuery(
    { queryKey: ['crm-definitions'], queryFn: fetchDefinitions },
    queryClient,
  );
  const lists = useQuery(
    { queryKey: ['crm-lists'], queryFn: () => trpc.crm.lists.list.query() },
    queryClient,
  );

  const createPipeline = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = readFormValue(event.currentTarget, 'name').trim();
    const objectId = readFormValue(event.currentTarget, 'objectId');
    const stages = readFormValue(event.currentTarget, 'stages')
      .split(',')
      .map((stage) => stage.trim())
      .filter((stage) => stage !== '');
    if (name === '' || objectId === '' || stages.length < 2) {
      setError('A pipeline needs a name, an object, and at least two stages.');
      return;
    }
    setCreating(true);
    setError(undefined);
    void trpc.crm.lists.createPipeline
      .mutate({ objectId, name, stages })
      .then(async (created) => {
        await queryClient.invalidateQueries({ queryKey: ['crm-lists'] });
        await queryClient.invalidateQueries({ queryKey: ['crm-definitions'] });
        await navigate({ to: '/lists/$listId', params: { listId: created.list.id } });
      })
      .catch((mutationError: unknown) => {
        setCreating(false);
        setError(
          mutationError instanceof Error && mutationError.message !== ''
            ? mutationError.message
            : 'Creating the pipeline failed. Try again.',
        );
      });
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
        Pipelines
      </h1>

      {lists.data !== undefined && lists.data.length > 0 ? (
        <ul className="mt-4 flex flex-col">
          {lists.data.map((list) => (
            <li key={list.id} className="border-b border-border-hairline">
              <Link
                to="/lists/$listId"
                params={{ listId: list.id }}
                className="block min-h-10 px-1 leading-10 text-base text-text-primary hover:bg-surface-sunken"
              >
                {list.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-base text-text-secondary">
          No pipelines yet — create the first one below.
        </p>
      )}

      <form
        onSubmit={createPipeline}
        className="mt-8 flex flex-col gap-3 rounded-lg border border-border-hairline p-4"
      >
        <h2 className="text-md font-medium text-text-primary">New pipeline</h2>
        <Input label="Name" name="name" required {...(error !== undefined ? { error } : {})} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-primary">Object</span>
          <select
            name="objectId"
            required
            className="min-h-8 rounded-md border border-border-strong bg-surface-raised px-2 text-base text-text-primary"
          >
            {definitions.data?.objects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Stages"
          name="stages"
          defaultValue={DEFAULT_STAGES}
          description="Comma-separated; order becomes lane order."
        />
        <Button type="submit" variant="primary" loading={creating}>
          Create pipeline
        </Button>
      </form>
    </div>
  );
}
