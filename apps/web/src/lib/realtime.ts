import type { QueryClient } from '@tanstack/react-query';

/**
 * Client side of the coarse invalidation loop (ADR-0003): a gateway
 * message names a resource; we refetch its query key. TanStack DB's
 * query-backed collections observe the same QueryClient, so live views
 * update automatically.
 */
export function handleInvalidationFrame(queryClient: QueryClient, raw: string): void {
  let resource: unknown;
  try {
    resource = (JSON.parse(raw) as { resource?: unknown }).resource;
  } catch {
    return; // unknown frame: ignore, never crash the app over realtime
  }
  if (typeof resource === 'string' && resource !== '') {
    void queryClient.invalidateQueries({ queryKey: [resource] });
  }
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** Connect (and keep reconnecting) to the realtime gateway. Returns a disposer. */
export function connectRealtime(queryClient: QueryClient): () => void {
  let socket: WebSocket | null = null;
  let disposed = false;
  let backoff = INITIAL_BACKOFF_MS;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${window.location.host}/realtime`;

  const open = (): void => {
    if (disposed) return;
    socket = new WebSocket(url);
    socket.onopen = () => {
      backoff = INITIAL_BACKOFF_MS;
    };
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') handleInvalidationFrame(queryClient, event.data);
    };
    socket.onclose = () => {
      if (disposed) return;
      retryTimer = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };
  };

  open();
  return () => {
    disposed = true;
    clearTimeout(retryTimer);
    socket?.close();
  };
}
