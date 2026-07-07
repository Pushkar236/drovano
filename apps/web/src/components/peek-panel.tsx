import { Button } from '@drovano/ui';
import { useQuery } from '@tanstack/react-query';

import { queryClient } from '../data/workspaces.js';
import { closePeek } from '../lib/peek.js';
import { trpc } from '../lib/trpc.js';

/** Human phrasing for audit actions (voice.md: say what happened). */
const ACTION_LABELS: Record<string, string> = {
  'record.create': 'Created',
  'record.update': 'Updated',
  'record.delete': 'Deleted',
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Record peek (TASK-0027): inspect a record and its timeline without
 * leaving the current view. The timeline is the audit trail — the same
 * transactional truth the compliance story rests on.
 */
export function PeekPanel({ recordId }: { recordId: string }) {
  const record = useQuery(
    {
      queryKey: ['record-peek', recordId],
      queryFn: () => trpc.crm.records.get.query({ recordId }),
    },
    queryClient,
  );
  const activity = useQuery(
    {
      queryKey: ['record-activity', recordId],
      queryFn: () => trpc.crm.records.activity.query({ recordId }),
    },
    queryClient,
  );

  if (record.isPending) {
    return <div className="p-4" aria-busy="true" />;
  }
  if (record.isError) {
    return (
      <div className="p-4">
        <p role="alert" className="text-base text-status-danger-text">
          Loading this record failed. Close the panel and try again.
        </p>
        <Button className="mt-2" size="sm" onClick={closePeek}>
          Close
        </Button>
      </div>
    );
  }

  const values = Object.entries(record.data.values);
  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-md font-semibold text-text-primary">
          {String(record.data.values.name ?? 'Untitled')}
        </h2>
        <Button size="sm" variant="ghost" onClick={closePeek} aria-label="Close panel">
          ✕
        </Button>
      </div>

      <dl className="mt-3 flex flex-col gap-1">
        {values.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-2 text-base">
            <dt className="text-text-secondary">{key}</dt>
            <dd className="truncate text-right text-text-primary">{String(value)}</dd>
          </div>
        ))}
        {values.length === 0 && <dd className="text-base text-text-muted">No values yet.</dd>}
      </dl>

      <h3 className="mt-6 text-sm font-medium text-text-secondary">Activity</h3>
      <ol className="mt-2 flex flex-col gap-2 overflow-y-auto">
        {activity.data?.items.map((entry) => (
          <li key={entry.id} className="border-l-2 border-border-strong pl-2">
            <p className="text-base text-text-primary">
              {ACTION_LABELS[entry.action] ?? entry.action}
              {entry.actorKind !== 'human' && (
                <span className="ml-1 text-sm text-text-muted">({entry.actorKind})</span>
              )}
            </p>
            <p className="text-sm text-text-muted">
              <time dateTime={entry.at}>{formatTimestamp(entry.at)}</time>
            </p>
          </li>
        ))}
        {activity.data?.items.length === 0 && (
          <li className="text-base text-text-muted">No activity recorded.</li>
        )}
      </ol>
    </div>
  );
}
