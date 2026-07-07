import type { AppRouter } from '@drovano/api-contracts';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

/** Typed client for the internal API (ADR-0005) — types only, no runtime import. */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })],
});
