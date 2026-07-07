import { useLiveQuery } from '@tanstack/react-db';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useState, type KeyboardEvent } from 'react';

import type { AttributeSummary } from '../data/crm.js';
import type { createRecordsCollection } from '../data/crm.js';
import { openPeek } from '../lib/peek.js';

const ROW_HEIGHT = 32; // dense context, 4px grid (DESIGN_SYSTEM §5)
const EDITABLE_TYPES = new Set(['text', 'url', 'email', 'phone', 'number', 'select']);

export interface RecordsGridProps {
  collection: ReturnType<typeof createRecordsCollection>;
  attributes: AttributeSummary[];
  onError: (message: string) => void;
}

/**
 * The records grid (TASK-0025 part 3; DESIGN_SYSTEM §5, interaction.md):
 * virtualized rows, a roving-focus keyboard grid
 * (arrows/Home/End/PageUp/PageDown, Enter to edit, Esc to cancel), and
 * optimistic inline edit riding the collection's update handler.
 */
export function RecordsGrid({ collection, attributes, onError }: RecordsGridProps) {
  const { data: rows } = useLiveQuery((query) => query.from({ record: collection }));
  const columns = attributes.filter((attribute) => !attribute.archived);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [editing, setEditing] = useState<{ row: number; col: number; draft: string } | null>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    // jsdom reports zero sizes; a real browser re-measures immediately.
    initialRect: { width: 800, height: 600 },
  });

  const clamp = (row: number, col: number) => ({
    row: Math.max(0, Math.min(rows.length - 1, row)),
    col: Math.max(0, Math.min(columns.length - 1, col)),
  });

  const beginEdit = (row: number, col: number): void => {
    const column = columns[col];
    if (column === undefined || !EDITABLE_TYPES.has(column.type)) return;
    const current = rows[row]?.values[column.key];
    setEditing({ row, col, draft: current === undefined ? '' : String(current) });
  };

  const commitEdit = (): void => {
    if (editing === null) return;
    const record = rows[editing.row];
    const column = columns[editing.col];
    if (record === undefined || column === undefined) return;
    const draft = editing.draft;
    setEditing(null);
    const value = column.type === 'number' ? Number(draft) : draft;
    if (draft.trim() === '' || String(record.values[column.key] ?? '') === draft) return;
    collection
      .update(record.id, (draftRecord) => {
        // Mutate in place: replacing the nested object would sidestep the
        // draft proxy's change tracking.
        draftRecord.values[column.key] = value;
      })
      .isPersisted.promise.catch((error: unknown) => {
        onError(
          error instanceof Error && error.message !== ''
            ? error.message
            : 'The change was rejected, so it was undone.',
        );
      });
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (editing !== null) return; // the editor handles its own keys
    const moves: Record<string, { row: number; col: number }> = {
      ArrowDown: { row: active.row + 1, col: active.col },
      ArrowUp: { row: active.row - 1, col: active.col },
      ArrowRight: { row: active.row, col: active.col + 1 },
      ArrowLeft: { row: active.row, col: active.col - 1 },
      Home: { row: active.row, col: 0 },
      End: { row: active.row, col: columns.length - 1 },
      PageDown: { row: active.row + 10, col: active.col },
      PageUp: { row: active.row - 10, col: active.col },
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      const next = clamp(move.row, move.col);
      setActive(next);
      virtualizer.scrollToIndex(next.row);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      beginEdit(active.row, active.col);
      return;
    }
    if (event.key === ' ') {
      const record = rows[active.row];
      if (record !== undefined) {
        event.preventDefault();
        openPeek(record.id);
      }
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border-hairline p-6">
        <h2 className="text-md font-medium text-text-primary">No records yet</h2>
        <p className="mt-1 text-base text-text-secondary">
          Create the first record to start building your graph.
        </p>
      </div>
    );
  }

  return (
    <div
      role="grid"
      aria-rowcount={rows.length + 1}
      aria-colcount={columns.length}
      className="overflow-hidden rounded-lg border border-border-hairline"
      onKeyDown={handleKeyDown}
    >
      <div
        role="row"
        aria-rowindex={1}
        className="flex border-b border-border-hairline bg-surface-base"
      >
        {columns.map((column) => (
          <div
            key={column.id}
            role="columnheader"
            className="h-8 w-48 flex-none truncate px-3 leading-8 text-sm font-medium text-text-secondary"
          >
            {column.name}
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const record = rows[virtualRow.index];
            if (record === undefined) return null;
            return (
              <div
                key={record.id}
                role="row"
                aria-rowindex={virtualRow.index + 2}
                className="absolute left-0 flex w-full border-b border-border-hairline hover:bg-surface-sunken"
                style={{ top: virtualRow.start, height: ROW_HEIGHT }}
              >
                {columns.map((column, colIndex) => {
                  const isActive = active.row === virtualRow.index && active.col === colIndex;
                  const isEditing =
                    editing !== null &&
                    editing.row === virtualRow.index &&
                    editing.col === colIndex;
                  const value = record.values[column.key];
                  const numeric = column.type === 'number' || column.type === 'currency';
                  return (
                    <div
                      key={column.id}
                      role="gridcell"
                      tabIndex={isActive ? 0 : -1}
                      ref={(cell) => {
                        if (
                          isActive &&
                          !isEditing &&
                          cell !== null &&
                          document.activeElement?.role !== 'textbox'
                        ) {
                          cell.focus({ preventScroll: true });
                        }
                      }}
                      onClick={() => {
                        setActive({ row: virtualRow.index, col: colIndex });
                      }}
                      onDoubleClick={() => {
                        beginEdit(virtualRow.index, colIndex);
                      }}
                      className={`h-8 w-48 flex-none truncate px-3 leading-8 text-base outline-none ${
                        numeric ? 'text-right font-mono' : ''
                      } ${isActive ? 'ring-2 ring-inset ring-focus-ring' : ''} text-text-primary`}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          aria-label={`Edit ${column.name}`}
                          className="h-7 w-full bg-surface-raised px-1 text-base outline-none"
                          value={editing.draft}
                          onChange={(event) => {
                            setEditing({ ...editing, draft: event.target.value });
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitEdit();
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              setEditing(null);
                            }
                            event.stopPropagation();
                          }}
                          onBlur={commitEdit}
                        />
                      ) : (
                        String(value ?? '')
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
