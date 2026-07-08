import { QueryClient } from '@tanstack/react-query';

/**
 * The app-wide query client, in its own module so the SHELL (initial
 * payload) can import it without dragging @tanstack/db along — the
 * collection factories in src/data/* are route-chunk territory
 * (bundle-budget.json measures the initial payload only).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});
