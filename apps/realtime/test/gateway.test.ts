import { invalidationChannel } from '@drovano/api-contracts';
import { startTestDatabase, type TestDatabase } from '@drovano/db/testing';
import { createAuth, type Auth } from '@drovano/identity';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { createGateway, type Gateway } from '../src/gateway.js';

const PORT = 3199;

describe('realtime gateway (real Postgres, real Redis, real sessions)', () => {
  let testDb: TestDatabase;
  let redis: StartedRedisContainer;
  let publisher: Redis;
  let auth: Auth;
  let gateway: Gateway;
  let tenantA: string;
  let tenantB: string;
  let cookieA: string;
  let cookieB: string;

  async function signUpWithOrganization(
    email: string,
    slug: string,
  ): Promise<{ cookie: string; organizationId: string }> {
    const { headers } = await auth.api.signUpEmail({
      body: { email, name: slug, password: 'a-long-test-password-1' },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .filter((pair): pair is string => pair !== undefined)
      .join('; ');
    const organization = await auth.api.createOrganization({
      body: { name: slug, slug },
      headers: new Headers({ cookie }),
    });
    await auth.api.setActiveOrganization({
      body: { organizationId: organization.id },
      headers: new Headers({ cookie }),
    });
    return { cookie, organizationId: organization.id };
  }

  function connect(cookie?: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://localhost:${String(PORT)}`, {
        headers: cookie === undefined ? {} : { cookie },
      });
      socket.on('open', () => {
        resolve(socket);
      });
      socket.on('error', reject);
    });
  }

  function nextMessage(socket: WebSocket, timeoutMs = 5_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('timed out waiting for a websocket message'));
      }, timeoutMs);
      socket.once('message', (raw: Buffer) => {
        clearTimeout(timer);
        resolve(JSON.parse(raw.toString()));
      });
    });
  }

  beforeAll(async () => {
    [testDb, redis] = await Promise.all([
      startTestDatabase(),
      new RedisContainer('redis:8-alpine').start(),
    ]);
    publisher = new Redis(redis.getConnectionUrl());
    auth = createAuth({
      db: testDb.app.db,
      secret: 'integration-test-secret-at-least-32-chars-long', // gitleaks:allow — intentional test dummy
      baseUrl: 'http://localhost:3000',
      mailer: { send: () => Promise.resolve() },
    });
    gateway = createGateway({ auth, redisUrl: redis.getConnectionUrl(), port: PORT });

    const a = await signUpWithOrganization('rt-a@example.com', 'rt-org-a');
    const b = await signUpWithOrganization('rt-b@example.com', 'rt-org-b');
    tenantA = a.organizationId;
    cookieA = a.cookie;
    tenantB = b.organizationId;
    cookieB = b.cookie;
  });

  afterAll(async () => {
    await gateway.close();
    publisher.disconnect();
    await Promise.allSettled([testDb.stop(), redis.stop()]);
  });

  it('answers health checks', async () => {
    const response = await fetch(`http://localhost:${String(PORT)}/healthz`);
    expect(response.status).toBe(200);
  });

  it('rejects connections without a session', async () => {
    await expect(connect()).rejects.toThrow(/401/);
  });

  it('delivers invalidation events to the session tenant only', async () => {
    const socketA = await connect(cookieA);
    const socketB = await connect(cookieB);
    expect(gateway.tenantSocketCounts().get(tenantA)).toBe(1);
    expect(gateway.tenantSocketCounts().get(tenantB)).toBe(1);

    const receivedA = nextMessage(socketA);
    let bReceived = false;
    socketB.on('message', () => {
      bReceived = true;
    });

    await publisher.publish(
      invalidationChannel(tenantA),
      JSON.stringify({ resource: 'workspaces' }),
    );

    expect(await receivedA).toEqual({ resource: 'workspaces' });
    // Give any (wrong) cross-tenant delivery a moment to surface.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(bReceived).toBe(false);

    socketA.terminate();
    socketB.terminate();
  });

  it('drops malformed publisher payloads without crashing', async () => {
    const socketA = await connect(cookieA);
    let received = false;
    socketA.on('message', () => {
      received = true;
    });
    await publisher.publish(invalidationChannel(tenantA), JSON.stringify({ nope: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toBe(false);

    // Still alive and delivering valid events afterwards.
    const next = nextMessage(socketA);
    await publisher.publish(
      invalidationChannel(tenantA),
      JSON.stringify({ resource: 'workspaces' }),
    );
    expect(await next).toEqual({ resource: 'workspaces' });
    socketA.terminate();
  });

  it('cleans up tenant registrations when sockets close', async () => {
    const socket = await connect(cookieA);
    expect(gateway.tenantSocketCounts().get(tenantA)).toBe(1);
    socket.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(gateway.tenantSocketCounts().get(tenantA)).toBeUndefined();
  });
});
