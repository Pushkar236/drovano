import {
  attributeDefinitions,
  objectDefinitions,
  writeAuditEntry,
  type AttributeType,
  type TenantTransaction,
} from '@drovano/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { CrmError } from './errors.js';

/** Stable machine keys: lowercase snake, must not collide per scope. */
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export interface Actor {
  kind: 'human' | 'agent' | 'integration' | 'system';
  id?: string;
}

function assertKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new CrmError(
      'invalid-key',
      `"${key}" is not a valid key — use lowercase letters, digits, and underscores, starting with a letter.`,
    );
  }
}

/** Type-specific attribute configuration, validated at definition time. */
const ATTRIBUTE_CONFIG = {
  select: z.object({ options: z.array(z.string().min(1)).min(1).max(200) }),
  multi_select: z.object({ options: z.array(z.string().min(1)).min(1).max(200) }),
  currency: z.object({ currencyCode: z.string().length(3) }),
  relation: z.object({ targetObjectId: z.uuid() }),
} as const;

export interface CreateObjectDefinitionInput {
  tenantId: string;
  key: string;
  name: string;
  /** 'standard' is reserved for the seeded catalog (standard-objects.ts). */
  kind?: 'standard' | 'custom';
  actor: Actor;
}

export async function createObjectDefinition(
  tx: TenantTransaction,
  input: CreateObjectDefinitionInput,
) {
  assertKey(input.key);
  const [existing] = await tx
    .select({ id: objectDefinitions.id })
    .from(objectDefinitions)
    .where(eq(objectDefinitions.key, input.key));
  if (existing !== undefined) {
    throw new CrmError('duplicate-key', `An object with the key "${input.key}" already exists.`);
  }

  const [created] = await tx
    .insert(objectDefinitions)
    .values({
      tenantId: input.tenantId,
      key: input.key,
      name: input.name,
      kind: input.kind ?? 'custom',
    })
    .returning();
  if (created === undefined) throw new Error('object definition insert returned no row');

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'object.create',
    resourceType: 'object_definition',
    resourceId: created.id,
    detail: { key: input.key, name: input.name },
  });
  return created;
}

export interface CreateAttributeDefinitionInput {
  tenantId: string;
  objectId: string;
  key: string;
  name: string;
  type: AttributeType;
  config?: unknown;
  /** System attributes ship with standard objects and cannot be removed. */
  system?: boolean;
  actor: Actor;
}

export async function createAttributeDefinition(
  tx: TenantTransaction,
  input: CreateAttributeDefinitionInput,
) {
  assertKey(input.key);

  const configSchema = (ATTRIBUTE_CONFIG as Partial<Record<AttributeType, z.ZodType>>)[input.type];
  if (configSchema !== undefined) {
    const parsed = configSchema.safeParse(input.config);
    if (!parsed.success) {
      throw new CrmError(
        'invalid-value',
        `"${input.key}" (${input.type}) needs valid configuration: ${parsed.error.issues[0]?.message ?? 'invalid config'}.`,
      );
    }
  }

  const [object] = await tx
    .select({ id: objectDefinitions.id })
    .from(objectDefinitions)
    .where(eq(objectDefinitions.id, input.objectId));
  if (object === undefined) {
    throw new CrmError('unknown-object', 'That object does not exist.');
  }

  const [existing] = await tx
    .select({ id: attributeDefinitions.id })
    .from(attributeDefinitions)
    .where(
      and(
        eq(attributeDefinitions.objectId, input.objectId),
        eq(attributeDefinitions.key, input.key),
      ),
    );
  if (existing !== undefined) {
    throw new CrmError(
      'duplicate-key',
      `An attribute with the key "${input.key}" already exists on this object.`,
    );
  }

  const [created] = await tx
    .insert(attributeDefinitions)
    .values({
      tenantId: input.tenantId,
      objectId: input.objectId,
      key: input.key,
      name: input.name,
      type: input.type,
      config: input.config ?? null,
      system: input.system ?? false,
    })
    .returning();
  if (created === undefined) throw new Error('attribute definition insert returned no row');

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'attribute.create',
    resourceType: 'attribute_definition',
    resourceId: created.id,
    detail: { objectId: input.objectId, key: input.key, type: input.type },
  });
  return created;
}
