/**
 * Webhook delivery, v1 (TASK-0029): one signed POST per active matching
 * subscription. Fire-and-forget — no retries, no delivery log; a failed
 * endpoint just misses the event (documented in the API docs). A durable
 * queue replaces this when automations land (M3).
 */
import { webhooks, withTenant, type Database } from '@drovano/db';
import { eq } from 'drizzle-orm';

import { signWebhookBody, SIGNATURE_HEADER } from './signature.js';
import type { WebhookEvent } from './webhooks.js';

export interface WebhookEventPayload {
  event: WebhookEvent;
  recordId: string;
}

export interface WebhookDispatcher {
  /** Never rejects: delivery failures are the receiver's loss in v1. */
  dispatch: (tenantId: string, payload: WebhookEventPayload) => Promise<void>;
}

/** Default for contexts without delivery wired (tests, CLI tools). */
export const noopWebhookDispatcher: WebhookDispatcher = {
  dispatch: () => Promise.resolve(),
};

export interface CreateWebhookDispatcherOptions {
  db: Database;
  /** Per-delivery timeout; a hung receiver must not hold the request. */
  timeoutMs?: number;
  /** Surface delivery failures to telemetry without failing the mutation. */
  onError?: (error: unknown, url: string) => void;
}

export function createWebhookDispatcher({
  db,
  timeoutMs = 5000,
  onError,
}: CreateWebhookDispatcherOptions): WebhookDispatcher {
  return {
    dispatch: async (tenantId, payload) => {
      try {
        const subscriptions = await withTenant(db, tenantId, (tx) =>
          tx
            .select({ url: webhooks.url, events: webhooks.events, secret: webhooks.secret })
            .from(webhooks)
            .where(eq(webhooks.active, true)),
        );
        const matching = subscriptions.filter((subscription) =>
          (subscription.events as WebhookEvent[]).includes(payload.event),
        );
        if (matching.length === 0) return;

        const body = JSON.stringify({
          event: payload.event,
          recordId: payload.recordId,
          occurredAt: new Date().toISOString(),
        });

        await Promise.allSettled(
          matching.map(async (subscription) => {
            try {
              await fetch(subscription.url, {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  [SIGNATURE_HEADER]: signWebhookBody(subscription.secret, body),
                },
                body,
                signal: AbortSignal.timeout(timeoutMs),
              });
            } catch (error) {
              onError?.(error, subscription.url);
            }
          }),
        );
      } catch (error) {
        onError?.(error, '(loading subscriptions)');
      }
    },
  };
}
