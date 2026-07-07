import { Button, Menu, MenuItem } from '@drovano/ui';
import { useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { fetchDefinitions } from '../data/crm.js';
import { listEntriesCollectionFor } from '../data/lists.js';
import { queryClient } from '../data/workspaces.js';
import { trpc } from '../lib/trpc.js';

const NO_STAGE = 'No stage';

/**
 * The pipeline board (TASK-0026): lanes from the list's stage attribute;
 * cards move between lanes through an explicit menu — the non-drag path
 * ships first (DESIGN_SYSTEM rule 10); drag joins later as an enhancer.
 */
export function PipelineBoardPage() {
  const { listId } = useParams({ from: '/app/lists/$listId' });
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const definitions = useQuery(
    { queryKey: ['crm-definitions'], queryFn: fetchDefinitions },
    queryClient,
  );
  const listsQuery = useQuery(
    { queryKey: ['crm-lists'], queryFn: () => trpc.crm.lists.list.query() },
    queryClient,
  );
  const collection = listEntriesCollectionFor(listId);
  const { data: entries } = useLiveQuery((query) => query.from({ entry: collection }));

  if (definitions.isPending || listsQuery.isPending) {
    return <div className="p-8" aria-busy="true" />;
  }
  const list = listsQuery.data?.find((candidate) => candidate.id === listId);
  const stageAttribute = definitions.data?.attributes.find(
    (attribute) => attribute.listId === listId && attribute.key === 'stage',
  );
  const stageConfig = stageAttribute?.config as { options?: string[] } | null | undefined;
  const stages = stageConfig?.options ?? [];

  if (list === undefined) {
    return (
      <div className="p-8">
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
          Pipeline
        </h1>
        <p className="mt-3 text-base text-text-secondary">That pipeline doesn’t exist.</p>
      </div>
    );
  }

  const lanes = [...stages, NO_STAGE];
  const entriesByLane = new Map<string, typeof entries>(lanes.map((lane) => [lane, []]));
  for (const entry of entries) {
    const stage = typeof entry.entryValues.stage === 'string' ? entry.entryValues.stage : NO_STAGE;
    const lane = entriesByLane.get(stages.includes(stage) ? stage : NO_STAGE);
    lane?.push(entry);
  }

  const moveCard = (entryId: string, stage: string): void => {
    setActionError(undefined);
    collection
      .update(entryId, (draft) => {
        draft.entryValues.stage = stage;
      })
      .isPersisted.promise.catch((error: unknown) => {
        setActionError(
          error instanceof Error && error.message !== ''
            ? error.message
            : 'The move was rejected, so it was undone.',
        );
      });
  };

  return (
    <div className="flex h-full flex-col p-8">
      <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
        {list.name}
      </h1>
      {actionError !== undefined && (
        <p role="alert" className="mt-3 text-base text-status-danger-text">
          {actionError}
        </p>
      )}
      {stages.length === 0 ? (
        <p className="mt-4 text-base text-text-secondary">
          This list has no stage attribute, so there’s no board to show.
        </p>
      ) : (
        <div className="mt-4 flex min-h-0 flex-1 gap-3 overflow-x-auto">
          {lanes.map((lane) => {
            const laneEntries = entriesByLane.get(lane) ?? [];
            return (
              <section
                key={lane}
                aria-label={`${lane} (${String(laneEntries.length)})`}
                className="flex w-64 flex-none flex-col rounded-lg border border-border-hairline bg-surface-base"
              >
                <h2 className="border-b border-border-hairline px-3 py-2 text-sm font-medium text-text-secondary">
                  {lane} <span className="font-mono text-text-muted">{laneEntries.length}</span>
                </h2>
                <ul className="flex flex-col gap-2 overflow-y-auto p-2">
                  {laneEntries.map((entry) => (
                    <li
                      key={entry.entryId}
                      className="rounded-md border border-border-hairline bg-surface-raised p-2"
                    >
                      <p className="truncate text-base text-text-primary">
                        {String(entry.recordValues.name ?? 'Untitled')}
                      </p>
                      <div className="mt-1 flex justify-end">
                        <Menu
                          trigger={
                            <Button size="sm" variant="ghost">
                              Move to…
                            </Button>
                          }
                        >
                          {stages
                            .filter((stage) => stage !== lane)
                            .map((stage) => (
                              <MenuItem
                                key={stage}
                                onClick={() => {
                                  moveCard(entry.entryId, stage);
                                }}
                              >
                                {stage}
                              </MenuItem>
                            ))}
                        </Menu>
                      </div>
                    </li>
                  ))}
                  {laneEntries.length === 0 && (
                    <li className="p-2 text-sm text-text-muted">Empty</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
