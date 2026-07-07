import { z } from 'zod';

/**
 * Coarse invalidation protocol (ADR-0003): the API publishes
 * "resource X changed in tenant Y" to Redis; the realtime gateway fans it
 * out to that tenant's sockets; clients refetch the matching collection.
 * Deliberately coarse — fine-grained sync is the ElectricSQL upgrade path.
 */
export const INVALIDATION_CHANNEL_PREFIX = 'invalidate:';

export function invalidationChannel(tenantId: string): string {
  return `${INVALIDATION_CHANNEL_PREFIX}${tenantId}`;
}

export const InvalidationMessage = z.object({
  /** Collection/query-key root to refetch, e.g. 'workspaces'. */
  resource: z.string().min(1),
});
export type InvalidationMessage = z.infer<typeof InvalidationMessage>;

export interface InvalidationPublisher {
  publish: (tenantId: string, message: InvalidationMessage) => Promise<void>;
}

/** Used when no Redis is configured (tests, minimal dev) — a silent no-op. */
export const noopInvalidationPublisher: InvalidationPublisher = {
  publish: () => Promise.resolve(),
};
