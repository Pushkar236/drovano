import { Button } from '@drovano/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { RecordsGrid } from '../components/records-grid.js';
import { fetchDefinitions, recordsCollectionFor } from '../data/crm.js';
import { queryClient } from '../data/workspaces.js';

/** Records canvas: object tabs + the keyboard grid (TASK-0025 part 3). */
export function RecordsPage() {
  const { objectKey } = useParams({ from: '/app/o/$objectKey' });
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const definitions = useQuery(
    { queryKey: ['crm-definitions'], queryFn: fetchDefinitions },
    queryClient,
  );

  if (definitions.isPending) {
    return <div className="p-8" aria-busy="true" />;
  }
  if (definitions.isError) {
    return (
      <div className="p-8">
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
          Records
        </h1>
        <p className="mt-3 text-base text-status-danger-text" role="alert">
          Loading your objects failed. Retry, and contact support if it persists.
        </p>
        <Button
          className="mt-3"
          onClick={() => {
            void definitions.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const objects = definitions.data.objects;
  const object = objects.find((candidate) => candidate.key === objectKey);
  if (object === undefined) {
    return (
      <div className="p-8">
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
          Records
        </h1>
        <p className="mt-3 text-base text-text-secondary">
          There is no “{objectKey}” object. Pick one below.
        </p>
        <div className="mt-3 flex gap-2">
          {objects.map((candidate) => (
            <Link
              key={candidate.id}
              to="/o/$objectKey"
              params={{ objectKey: candidate.key }}
              className="text-base text-text-accent"
            >
              {candidate.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const attributes = definitions.data.attributes.filter(
    (attribute) => attribute.objectId === object.id,
  );
  const collection = recordsCollectionFor(object.id);

  const createRecord = (): void => {
    setActionError(undefined);
    collection
      .insert({
        id: crypto.randomUUID(), // temp key; the refetch swaps in the server row
        objectId: object.id,
        values: { name: 'Untitled' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .isPersisted.promise.catch((error: unknown) => {
        setActionError(
          error instanceof Error && error.message !== ''
            ? error.message
            : 'Creating the record failed, so it was undone.',
        );
      });
  };

  return (
    <div className="flex h-full flex-col p-8">
      <div className="flex items-center justify-between">
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
          {object.name} records
        </h1>
        <div className="flex items-center gap-3">
          <Link
            to="/o/$objectKey/import"
            params={{ objectKey }}
            className="text-base text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            Import CSV
          </Link>
          <Button variant="primary" size="sm" onClick={createRecord}>
            New {object.name.toLowerCase()}
          </Button>
        </div>
      </div>
      <nav aria-label="Objects" className="mt-3 flex gap-1 border-b border-border-hairline pb-2">
        {objects.map((candidate) => (
          <Link
            key={candidate.id}
            to="/o/$objectKey"
            params={{ objectKey: candidate.key }}
            aria-current={candidate.key === objectKey ? 'page' : undefined}
            className={`rounded-md px-2 py-1 text-base ${
              candidate.key === objectKey
                ? 'bg-surface-sunken font-medium text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {candidate.name}
          </Link>
        ))}
      </nav>
      {actionError !== undefined && (
        <p role="alert" className="mt-3 text-base text-status-danger-text">
          {actionError}
        </p>
      )}
      <div className="mt-4 min-h-0 flex-1">
        <RecordsGrid collection={collection} attributes={attributes} onError={setActionError} />
      </div>
    </div>
  );
}
