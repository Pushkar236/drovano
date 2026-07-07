import { Button, Input } from '@drovano/ui';
import { useLiveQuery } from '@tanstack/react-db';
import { useState, type FormEvent } from 'react';

import { workspacesCollection } from '../data/workspaces.js';

/**
 * Workspaces — the first real data surface, demonstrating the blessed
 * pattern (ADR-0003): live query from the collection; rename applies
 * optimistically and rolls back if the server refuses (permissions).
 */
export function WorkspacesPage() {
  const { data: workspaces, isLoading } = useLiveQuery((query) =>
    query.from({ workspace: workspacesCollection }),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  const submitRename = (event: FormEvent<HTMLFormElement>, workspaceId: string): void => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    setEditingId(null);
    if (name === '') return;
    setRenameError(undefined);
    // Optimistic: the row updates instantly; a server refusal rolls it
    // back and we surface the reason (voice.md: what happened + what to do).
    workspacesCollection
      .update(workspaceId, (draft) => {
        draft.name = name;
      })
      .isPersisted.promise.catch((error: unknown) => {
        setRenameError(
          error instanceof Error && error.message !== ''
            ? error.message
            : 'The rename was rejected, so it was undone.',
        );
      });
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
        Workspaces
      </h1>
      {renameError !== undefined && (
        <p role="alert" className="mt-3 text-base text-status-danger-text">
          {renameError}
        </p>
      )}
      {isLoading ? (
        <p className="mt-6 text-base text-text-muted">Loading workspaces…</p>
      ) : workspaces.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border-hairline p-6">
          <h2 className="text-md font-medium text-text-primary">No workspaces yet</h2>
          <p className="mt-1 text-base text-text-secondary">
            Ask an organization admin to add you to a workspace.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col">
          {workspaces.map((workspace) => (
            <li
              key={workspace.id}
              className="flex min-h-12 items-center justify-between gap-3 border-b border-border-hairline"
            >
              {editingId === workspace.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    submitRename(event, workspace.id);
                  }}
                >
                  <Input
                    label="Workspace name"
                    name="name"
                    defaultValue={workspace.name}
                    autoFocus
                    className="flex-1"
                  />
                  <Button type="submit" variant="primary" size="sm">
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null);
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <span className="text-base text-text-primary">{workspace.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm text-text-muted">
                      {workspace.myRole ?? 'org-wide'}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRenameError(undefined);
                        setEditingId(workspace.id);
                      }}
                    >
                      Rename
                    </Button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
