/**
 * API keys: bearer credentials for the public REST API (TASK-0029).
 *
 * The `api_keys` table is GLOBAL (the ADR-0011 exception): the bearer
 * lookup runs before the tenant is known, so `findApiKeyBySecret` takes a
 * plain database handle and every tenant-facing operation here filters by
 * tenant_id explicitly — RLS does not do it for this table.
 *
 * Only the sha256 hash of a secret is stored; the secret is returned
 * exactly once, from `createApiKey`.
 */
import { createHash, randomBytes } from 'node:crypto';

import { apiKeys, writeAuditEntry, type Database, type TenantTransaction } from '@drovano/db';
import { and, eq, isNull } from 'drizzle-orm';

import { PlatformError } from './errors.js';

export interface Actor {
  kind: 'human' | 'agent' | 'integration' | 'system';
  id?: string;
}

export const API_KEY_PREFIX = 'drv_';

export function hashApiKeySecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreateApiKeyInput {
  tenantId: string;
  name: string;
  actor: Actor;
}

export interface CreatedApiKey extends ApiKeySummary {
  /** The full secret — shown once, never retrievable again. */
  secret: string;
}

export async function createApiKey(
  tx: TenantTransaction,
  input: CreateApiKeyInput,
): Promise<CreatedApiKey> {
  const secret = `${API_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  const keyPrefix = secret.slice(0, API_KEY_PREFIX.length + 8);

  const [created] = await tx
    .insert(apiKeys)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      keyPrefix,
      keyHash: hashApiKeySecret(secret),
      createdBy: input.actor.id ?? 'system',
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    });
  if (created === undefined) {
    throw new Error('api key insert returned no row');
  }

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'api-key.create',
    resourceType: 'api-key',
    resourceId: created.id,
    detail: { name: input.name, keyPrefix },
  });

  return { ...created, secret };
}

export async function listApiKeys(
  tx: TenantTransaction,
  input: { tenantId: string },
): Promise<ApiKeySummary[]> {
  return tx
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, input.tenantId))
    .orderBy(apiKeys.createdAt);
}

export interface RevokeApiKeyInput {
  tenantId: string;
  keyId: string;
  actor: Actor;
}

export async function revokeApiKey(tx: TenantTransaction, input: RevokeApiKeyInput): Promise<void> {
  const [revoked] = await tx
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, input.keyId),
        eq(apiKeys.tenantId, input.tenantId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  if (revoked === undefined) {
    throw new PlatformError('unknown-api-key', 'No active API key with that id exists.');
  }

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'api-key.revoke',
    resourceType: 'api-key',
    resourceId: input.keyId,
  });
}

export interface AuthenticatedApiKey {
  id: string;
  tenantId: string;
}

/**
 * Bearer authentication for the public API: hash the presented secret and
 * look it up. Runs OUTSIDE tenant context (that is the point — the hit
 * tells us the tenant). Returns null for unknown or revoked keys; also
 * stamps last_used_at on success (best-effort, not awaited by callers on
 * the hot path — here it is one indexed update).
 */
export async function findApiKeyBySecret(
  db: Database,
  secret: string,
): Promise<AuthenticatedApiKey | null> {
  if (!secret.startsWith(API_KEY_PREFIX)) return null;
  const [found] = await db
    .select({ id: apiKeys.id, tenantId: apiKeys.tenantId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKeySecret(secret)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (found === undefined) return null;

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, found.id));
  return found;
}
