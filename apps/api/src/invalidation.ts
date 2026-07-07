import { invalidationChannel, type InvalidationPublisher } from '@drovano/api-contracts';
import { Redis } from 'ioredis';

export interface ClosableInvalidationPublisher extends InvalidationPublisher {
  close: () => void;
}

/** Redis-backed publisher for the realtime gateway (ADR-0003). */
export function createRedisInvalidationPublisher(redisUrl: string): ClosableInvalidationPublisher {
  const redis = new Redis(redisUrl);
  return {
    publish: async (tenantId, message) => {
      await redis.publish(invalidationChannel(tenantId), JSON.stringify(message));
    },
    close: () => {
      redis.disconnect();
    },
  };
}
