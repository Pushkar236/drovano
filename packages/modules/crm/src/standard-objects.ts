import { objectDefinitions, type TenantTransaction } from '@drovano/db';
import { eq } from 'drizzle-orm';

import { createAttributeDefinition, createObjectDefinition, type Actor } from './definitions.js';

/**
 * The standard-object catalog (data-model.md §2; PRD §3.2): opinionated
 * defaults every tenant starts with. Catalog-as-code so it evolves under
 * review and type-checking; seeding is idempotent (skips existing keys),
 * so re-running against provisioned tenants is safe.
 *
 * Deal stages deliberately do NOT live here — pipelines are lists with
 * stage semantics (TASK-0024/0026), not record attributes.
 */
interface StandardAttribute {
  key: string;
  name: string;
  type: 'text' | 'email' | 'phone' | 'url' | 'currency' | 'date' | 'relation';
  /** Relation target by object key; resolved to an id at seed time. */
  relationTarget?: 'company' | 'person';
}

interface StandardObject {
  key: 'company' | 'person' | 'deal';
  name: string;
  attributes: StandardAttribute[];
}

/** Order matters: relation targets must exist before their referrers. */
const STANDARD_OBJECTS: StandardObject[] = [
  {
    key: 'company',
    name: 'Company',
    attributes: [
      { key: 'name', name: 'Name', type: 'text' },
      { key: 'domain', name: 'Domain', type: 'url' },
    ],
  },
  {
    key: 'person',
    name: 'Person',
    attributes: [
      { key: 'name', name: 'Name', type: 'text' },
      { key: 'email', name: 'Email', type: 'email' },
      { key: 'phone', name: 'Phone', type: 'phone' },
      { key: 'title', name: 'Title', type: 'text' },
      { key: 'company', name: 'Company', type: 'relation', relationTarget: 'company' },
    ],
  },
  {
    key: 'deal',
    name: 'Deal',
    attributes: [
      { key: 'name', name: 'Name', type: 'text' },
      { key: 'amount', name: 'Amount', type: 'currency' },
      { key: 'close_date', name: 'Close date', type: 'date' },
      { key: 'company', name: 'Company', type: 'relation', relationTarget: 'company' },
      {
        key: 'primary_contact',
        name: 'Primary contact',
        type: 'relation',
        relationTarget: 'person',
      },
    ],
  },
];

export interface SeedStandardObjectsInput {
  tenantId: string;
  actor: Actor;
}

/** Seed (or complete) the standard objects for a tenant. Idempotent. */
export async function seedStandardObjects(
  tx: TenantTransaction,
  input: SeedStandardObjectsInput,
): Promise<void> {
  const objectIdsByKey = new Map<string, string>();

  for (const standard of STANDARD_OBJECTS) {
    const [existing] = await tx
      .select({ id: objectDefinitions.id })
      .from(objectDefinitions)
      .where(eq(objectDefinitions.key, standard.key));

    if (existing !== undefined) {
      objectIdsByKey.set(standard.key, existing.id);
      continue; // object (and its attributes) already provisioned
    }

    const created = await createObjectDefinition(tx, {
      tenantId: input.tenantId,
      key: standard.key,
      name: standard.name,
      kind: 'standard',
      actor: input.actor,
    });
    objectIdsByKey.set(standard.key, created.id);

    for (const attribute of standard.attributes) {
      const targetObjectId =
        attribute.relationTarget === undefined
          ? undefined
          : objectIdsByKey.get(attribute.relationTarget);
      await createAttributeDefinition(tx, {
        tenantId: input.tenantId,
        objectId: created.id,
        key: attribute.key,
        name: attribute.name,
        type: attribute.type,
        system: true,
        ...(attribute.type === 'currency' ? { config: { currencyCode: 'USD' } } : {}),
        ...(targetObjectId !== undefined ? { config: { targetObjectId } } : {}),
        actor: input.actor,
      });
    }
  }
}
