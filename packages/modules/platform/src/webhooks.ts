/**
 * Webhook subscriptions (TASK-0029). Tenant-scoped RLS-normal table; the
 * signing secret is generated here and shown once at creation — deliveries
 * carry an HMAC-SHA256 of the body (signature.ts) so receivers can verify.
 */
import { randomBytes } from 'node:crypto';

import { webhooks, writeAuditEntry, type TenantTransaction } from '@drovano/db';
import { and, eq } from 'drizzle-orm';

import type { Actor } from './api-keys.js';
import { PlatformError } from './errors.js';

/** The v1 event vocabulary — record lifecycle only (webhook skeleton). */
export const WEBHOOK_EVENTS = ['record.created', 'record.updated', 'record.deleted'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookSummary {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: Date;
}

export interface CreateWebhookInput {
  tenantId: string;
  url: string;
  events: WebhookEvent[];
  actor: Actor;
}

export interface CreatedWebhook extends WebhookSummary {
  /** The signing secret — shown once, never retrievable again. */
  secret: string;
}

export async function createWebhook(
  tx: TenantTransaction,
  input: CreateWebhookInput,
): Promise<CreatedWebhook> {
  if (input.events.length === 0) {
    throw new PlatformError('invalid-value', 'Subscribe the webhook to at least one event.');
  }
  const secret = `whsec_${randomBytes(24).toString('hex')}`;

  const [created] = await tx
    .insert(webhooks)
    .values({
      tenantId: input.tenantId,
      url: input.url,
      events: input.events,
      secret,
      createdBy: input.actor.id ?? 'system',
    })
    .returning({
      id: webhooks.id,
      url: webhooks.url,
      active: webhooks.active,
      createdAt: webhooks.createdAt,
    });
  if (created === undefined) {
    throw new Error('webhook insert returned no row');
  }

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'webhook.create',
    resourceType: 'webhook',
    resourceId: created.id,
    detail: { url: input.url, events: input.events },
  });

  return { ...created, events: input.events, secret };
}

export async function listWebhooks(
  tx: TenantTransaction,
  input: { tenantId: string },
): Promise<WebhookSummary[]> {
  const rows = await tx
    .select({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      active: webhooks.active,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .where(eq(webhooks.tenantId, input.tenantId))
    .orderBy(webhooks.createdAt);
  return rows.map((row) => ({ ...row, events: row.events as WebhookEvent[] }));
}

export interface RemoveWebhookInput {
  tenantId: string;
  webhookId: string;
  actor: Actor;
}

export async function removeWebhook(
  tx: TenantTransaction,
  input: RemoveWebhookInput,
): Promise<void> {
  const [removed] = await tx
    .delete(webhooks)
    .where(and(eq(webhooks.id, input.webhookId), eq(webhooks.tenantId, input.tenantId)))
    .returning({ id: webhooks.id });
  if (removed === undefined) {
    throw new PlatformError('unknown-webhook', 'No webhook with that id exists.');
  }

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'webhook.remove',
    resourceType: 'webhook',
    resourceId: input.webhookId,
  });
}
