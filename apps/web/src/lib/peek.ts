import { useSyncExternalStore } from 'react';

/**
 * Peek selection (TASK-0027): which record the context panel inspects.
 * A module store rather than React context so any surface (grid, board,
 * palette) can open a peek without threading props through the shell.
 */
let currentRecordId: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function openPeek(recordId: string): void {
  currentRecordId = recordId;
  emit();
}

export function closePeek(): void {
  currentRecordId = null;
  emit();
}

export function usePeekRecordId(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentRecordId,
  );
}
