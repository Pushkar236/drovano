import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { tenants, withTenant } from '@drovano/db';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createApiKey,
  createWebhook,
  createWebhookDispatcher,
  findApiKeyBySecret,
  listApiKeys,
  listWebhooks,
  removeWebhook,
  revokeApiKey,
  verifyWebhookSignature,
  type Actor,
} from '../src/index.js';

const ACTOR: Actor = { kind: 'system' };

describe('platform module (api keys + webhooks)', () => {
  let testDb: TestDatabase;
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const created = await testDb.owner.db
      .insert(tenants)
      .values([{ name: 'Platform Tenant' }, { name: 'Other Tenant' }])
      .returning({ id: tenants.id });
    tenantId = created[0]?.id ?? '';
    otherTenantId = created[1]?.id ?? '';
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('api key lifecycle: create shows the secret once, lookup authenticates, revoke kills it', async () => {
    const created = await withTenant(testDb.app.db, tenantId, (tx) =>
      createApiKey(tx, { tenantId, name: 'CI key', actor: ACTOR }),
    );
    expect(created.secret).toMatch(/^drv_[0-9a-f]{48}$/);
    expect(created.keyPrefix).toBe(created.secret.slice(0, 12));

    const summaries = await withTenant(testDb.app.db, tenantId, (tx) =>
      listApiKeys(tx, { tenantId }),
    );
    expect(summaries.map((key) => key.name)).toContain('CI key');
    expect(JSON.stringify(summaries)).not.toContain(created.secret);

    const found = await findApiKeyBySecret(testDb.app.db, created.secret);
    expect(found).toMatchObject({ id: created.id, tenantId });

    // last_used_at was stamped by the successful lookup.
    const [afterUse] = await withTenant(testDb.app.db, tenantId, (tx) =>
      listApiKeys(tx, { tenantId }),
    );
    expect(afterUse?.lastUsedAt).not.toBeNull();

    await withTenant(testDb.app.db, tenantId, (tx) =>
      revokeApiKey(tx, { tenantId, keyId: created.id, actor: ACTOR }),
    );
    expect(await findApiKeyBySecret(testDb.app.db, created.secret)).toBeNull();

    // Revoking again (or a bogus id) is an actionable domain error.
    await expect(
      withTenant(testDb.app.db, tenantId, (tx) =>
        revokeApiKey(tx, { tenantId, keyId: created.id, actor: ACTOR }),
      ),
    ).rejects.toMatchObject({ code: 'unknown-api-key' });
  });

  it('bad secrets authenticate nothing', async () => {
    expect(await findApiKeyBySecret(testDb.app.db, 'drv_' + '0'.repeat(48))).toBeNull();
    expect(await findApiKeyBySecret(testDb.app.db, 'not-even-the-right-shape')).toBeNull();
  });

  it('api keys are tenant-scoped in every read path (global table, explicit filters)', async () => {
    const created = await withTenant(testDb.app.db, tenantId, (tx) =>
      createApiKey(tx, { tenantId, name: 'Scoped key', actor: ACTOR }),
    );
    const otherList = await withTenant(testDb.app.db, otherTenantId, (tx) =>
      listApiKeys(tx, { tenantId: otherTenantId }),
    );
    expect(otherList.map((key) => key.id)).not.toContain(created.id);

    // A key authenticates as ITS tenant — never the caller's guess.
    const found = await findApiKeyBySecret(testDb.app.db, created.secret);
    expect(found?.tenantId).toBe(tenantId);

    // Cross-tenant revoke misses (explicit tenant filter on the update).
    await expect(
      withTenant(testDb.app.db, otherTenantId, (tx) =>
        revokeApiKey(tx, { tenantId: otherTenantId, keyId: created.id, actor: ACTOR }),
      ),
    ).rejects.toMatchObject({ code: 'unknown-api-key' });
  });

  it('webhooks: create/list/remove under RLS; other tenants see nothing', async () => {
    const created = await withTenant(testDb.app.db, tenantId, (tx) =>
      createWebhook(tx, {
        tenantId,
        url: 'https://receiver.example/hooks',
        events: ['record.created'],
        actor: ACTOR,
      }),
    );
    expect(created.secret).toMatch(/^whsec_[0-9a-f]{48}$/);

    const mine = await withTenant(testDb.app.db, tenantId, (tx) => listWebhooks(tx, { tenantId }));
    expect(mine.map((hook) => hook.id)).toContain(created.id);
    expect(JSON.stringify(mine)).not.toContain(created.secret);

    const theirs = await withTenant(testDb.app.db, otherTenantId, (tx) =>
      listWebhooks(tx, { tenantId: otherTenantId }),
    );
    expect(theirs.map((hook) => hook.id)).not.toContain(created.id);

    await withTenant(testDb.app.db, tenantId, (tx) =>
      removeWebhook(tx, { tenantId, webhookId: created.id, actor: ACTOR }),
    );
    await expect(
      withTenant(testDb.app.db, tenantId, (tx) =>
        removeWebhook(tx, { tenantId, webhookId: created.id, actor: ACTOR }),
      ),
    ).rejects.toMatchObject({ code: 'unknown-webhook' });
  });

  it('rejects a webhook with no events', async () => {
    await expect(
      withTenant(testDb.app.db, tenantId, (tx) =>
        createWebhook(tx, { tenantId, url: 'https://x.example', events: [], actor: ACTOR }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-value' });
  });

  describe('dispatcher', () => {
    let server: Server;
    let url: string;
    const received: { body: string; signature: string }[] = [];

    beforeAll(async () => {
      server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk.toString()));
        req.on('end', () => {
          received.push({ body, signature: req.headers['x-drovano-signature'] as string });
          res.writeHead(200).end();
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    });

    afterAll(() => {
      server.close();
    });

    it('delivers a signed POST to matching subscriptions only; failures never throw', async () => {
      const subscription = await withTenant(testDb.app.db, tenantId, (tx) =>
        createWebhook(tx, {
          tenantId,
          url,
          events: ['record.created'],
          actor: ACTOR,
        }),
      );
      // A dead receiver on the same tenant must not break dispatch.
      await withTenant(testDb.app.db, tenantId, (tx) =>
        createWebhook(tx, {
          tenantId,
          url: 'http://127.0.0.1:9/unreachable',
          events: ['record.created'],
          actor: ACTOR,
        }),
      );

      const dispatcher = createWebhookDispatcher({ db: testDb.app.db, timeoutMs: 2000 });
      await dispatcher.dispatch(tenantId, { event: 'record.created', recordId: 'rec-1' });
      // Unsubscribed event: nothing arrives.
      await dispatcher.dispatch(tenantId, { event: 'record.deleted', recordId: 'rec-1' });

      expect(received).toHaveLength(1);
      const delivery = received[0];
      expect(delivery).toBeDefined();
      if (delivery === undefined) return;
      expect(JSON.parse(delivery.body)).toMatchObject({
        event: 'record.created',
        recordId: 'rec-1',
      });
      expect(verifyWebhookSignature(subscription.secret, delivery.body, delivery.signature)).toBe(
        true,
      );
      expect(verifyWebhookSignature('whsec_wrong', delivery.body, delivery.signature)).toBe(false);
    });
  });
});
