import { tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  addRecordToList,
  createAttributeDefinition,
  createList,
  createRecord,
  createSavedView,
  getRecord,
  listListEntries,
  removeRecordFromList,
  seedStandardObjects,
  setListEntryValues,
  updateSavedViewConfig,
  type Actor,
} from '../src/index.js';

const ACTOR: Actor = { kind: 'system' };

describe('lists, list-scoped attributes, saved views', () => {
  let testDb: TestDatabase;
  let tenantId: string;
  let companyObjectId: string;
  let pipelineListId: string;
  let acmeId: string;
  let globexId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const [tenant] = await testDb.owner.db
      .insert(tenants)
      .values({ name: 'Lists Tenant' })
      .returning({ id: tenants.id });
    tenantId = tenant?.id ?? '';

    await withTenant(testDb.app.db, tenantId, async (tx) => {
      await seedStandardObjects(tx, { tenantId, actor: ACTOR });
      const objects = await tx.query.objectDefinitions.findMany();
      companyObjectId = objects.find((o) => o.key === 'company')?.id ?? '';

      const list = await createList(tx, {
        tenantId,
        objectId: companyObjectId,
        name: 'Q3 outbound',
        actor: ACTOR,
      });
      pipelineListId = list.id;

      // The Attio-signature move: process state as a LIST-scoped attribute.
      await createAttributeDefinition(tx, {
        tenantId,
        listId: list.id,
        key: 'stage',
        name: 'Stage',
        type: 'select',
        config: { options: ['prospect', 'contacted', 'won'] },
        actor: ACTOR,
      });

      acmeId = (
        await createRecord(tx, {
          tenantId,
          objectId: companyObjectId,
          values: { name: 'Acme' },
          actor: ACTOR,
        })
      ).id;
      globexId = (
        await createRecord(tx, {
          tenantId,
          objectId: companyObjectId,
          values: { name: 'Globex' },
          actor: ACTOR,
        })
      ).id;
    });
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('adds records, sets list-scoped values, and hydrates both value planes', async () => {
    await withTenant(testDb.app.db, tenantId, async (tx) => {
      const entry = await addRecordToList(tx, {
        tenantId,
        listId: pipelineListId,
        recordId: acmeId,
        actor: ACTOR,
      });
      await addRecordToList(tx, {
        tenantId,
        listId: pipelineListId,
        recordId: globexId,
        actor: ACTOR,
      });
      await setListEntryValues(tx, {
        tenantId,
        entryId: entry.id,
        values: { stage: 'contacted' },
        actor: ACTOR,
      });
    });

    const page = await withTenant(testDb.app.db, tenantId, (tx) =>
      listListEntries(tx, { listId: pipelineListId }),
    );
    expect(page.items).toHaveLength(2);
    const acmeEntry = page.items.find((item) => item.recordId === acmeId);
    expect(acmeEntry?.recordValues).toEqual({ name: 'Acme' });
    expect(acmeEntry?.entryValues).toEqual({ stage: 'contacted' });
    const globexEntry = page.items.find((item) => item.recordId === globexId);
    expect(globexEntry?.entryValues).toEqual({});
  });

  it('list state never pollutes the record (the separation is real)', async () => {
    const record = await withTenant(testDb.app.db, tenantId, (tx) => getRecord(tx, acmeId));
    expect(record.values).toEqual({ name: 'Acme' }); // no 'stage' anywhere
  });

  it('rejects wrong-object records, duplicates, and unknown list attributes', async () => {
    await withTenant(testDb.app.db, tenantId, async (tx) => {
      const objects = await tx.query.objectDefinitions.findMany();
      const personObjectId = objects.find((o) => o.key === 'person')?.id ?? '';
      const person = await createRecord(tx, {
        tenantId,
        objectId: personObjectId,
        values: { name: 'Ada' },
        actor: ACTOR,
      });
      await expect(
        addRecordToList(tx, {
          tenantId,
          listId: pipelineListId,
          recordId: person.id,
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'object-mismatch' });
      await expect(
        addRecordToList(tx, { tenantId, listId: pipelineListId, recordId: acmeId, actor: ACTOR }),
      ).rejects.toMatchObject({ code: 'duplicate-key' });

      const page = await listListEntries(tx, { listId: pipelineListId });
      const entry = page.items[0];
      await expect(
        setListEntryValues(tx, {
          tenantId,
          entryId: entry?.entryId ?? '',
          values: { nonexistent: 'x' },
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'unknown-attribute' });
    });
  });

  it('removing a record from a list drops its entry (and entry values via cascade)', async () => {
    await withTenant(testDb.app.db, tenantId, (tx) =>
      removeRecordFromList(tx, {
        tenantId,
        listId: pipelineListId,
        recordId: globexId,
        actor: ACTOR,
      }),
    );
    const page = await withTenant(testDb.app.db, tenantId, (tx) =>
      listListEntries(tx, { listId: pipelineListId }),
    );
    expect(page.items.map((item) => item.recordId)).toEqual([acmeId]);
  });

  it('saved views validate their config and support updates', async () => {
    const view = await withTenant(testDb.app.db, tenantId, (tx) =>
      createSavedView(tx, {
        tenantId,
        listId: pipelineListId,
        name: 'Contacted first',
        type: 'table',
        config: {
          filters: [{ attributeKey: 'stage', op: 'eq', value: 'contacted' }],
          sorts: [{ attributeKey: 'name', direction: 'asc' }],
          columns: ['name', 'stage'],
        },
        actor: ACTOR,
      }),
    );
    expect(view.type).toBe('table');

    await withTenant(testDb.app.db, tenantId, (tx) =>
      updateSavedViewConfig(tx, {
        tenantId,
        viewId: view.id,
        config: { filters: [], sorts: [], columns: ['name'] },
        actor: ACTOR,
      }),
    );

    await expect(
      withTenant(testDb.app.db, tenantId, (tx) =>
        createSavedView(tx, {
          tenantId,
          listId: pipelineListId,
          name: 'Broken',
          config: { filters: [{ attributeKey: '', op: 'eq' }] },
          actor: ACTOR,
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-value' });

    await expect(
      withTenant(testDb.app.db, tenantId, (tx) =>
        createSavedView(tx, {
          tenantId,
          // both scopes → invalid
          listId: pipelineListId,
          objectId: companyObjectId,
          name: 'Two scopes',
          config: {},
          actor: ACTOR,
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-value' });
  });
});
