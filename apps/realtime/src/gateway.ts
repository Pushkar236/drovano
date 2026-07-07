import type { IncomingMessage } from 'node:http';
import { createServer, type Server } from 'node:http';

import {
  INVALIDATION_CHANNEL_PREFIX,
  InvalidationMessage,
  invalidationChannel,
} from '@drovano/api-contracts';
import type { Auth } from '@drovano/identity';
import { Redis } from 'ioredis';
import { WebSocket, WebSocketServer } from 'ws';

export interface CreateGatewayOptions {
  auth: Auth;
  redisUrl: string;
  port: number;
}

export interface Gateway {
  server: Server;
  /** Sockets currently subscribed, keyed by tenant id (introspection/tests). */
  tenantSocketCounts: () => Map<string, number>;
  close: () => Promise<void>;
}

/**
 * The realtime gateway (ADR-0003, system-overview §3): deliberately thin.
 * A client connects with its session cookie; the session's ACTIVE
 * ORGANIZATION decides — server-side — which tenant's invalidation events
 * it receives. Clients never choose a channel, so there is nothing to
 * spoof (SECURITY.md: least privilege). Events carry no data, only
 * "resource X changed" — the client refetches through the authorized API.
 */
export function createGateway({ auth, redisUrl, port }: CreateGatewayOptions): Gateway {
  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });
  const socketsByTenant = new Map<string, Set<WebSocket>>();

  const subscriber = new Redis(redisUrl);
  void subscriber.psubscribe(`${INVALIDATION_CHANNEL_PREFIX}*`);
  subscriber.on('pmessage', (_pattern, channel, raw) => {
    const tenantId = channel.slice(INVALIDATION_CHANNEL_PREFIX.length);
    const sockets = socketsByTenant.get(tenantId);
    if (sockets === undefined || sockets.size === 0) return;
    const parsed = InvalidationMessage.safeParse(JSON.parse(raw));
    if (!parsed.success) return; // unknown publisher payload: drop, never crash
    const frame = JSON.stringify(parsed.data);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(frame);
    }
  });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    void (async () => {
      // Session cookie → tenant, resolved server-side before the upgrade
      // completes. No session or no active org → no socket.
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: request.headers.cookie ?? '' }),
      });
      const tenantId = session?.session.activeOrganizationId ?? null;
      if (tenantId === null) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (webSocket) => {
        let sockets = socketsByTenant.get(tenantId);
        if (sockets === undefined) {
          sockets = new Set();
          socketsByTenant.set(tenantId, sockets);
        }
        sockets.add(webSocket);
        webSocket.on('close', () => {
          sockets.delete(webSocket);
          if (sockets.size === 0) socketsByTenant.delete(tenantId);
        });
      });
    })().catch(() => {
      socket.destroy();
    });
  });

  server.listen(port);

  return {
    server,
    tenantSocketCounts: () =>
      new Map([...socketsByTenant.entries()].map(([tenant, set]) => [tenant, set.size])),
    close: async () => {
      for (const sockets of socketsByTenant.values()) {
        for (const socket of sockets) socket.terminate();
      }
      wss.close();
      subscriber.disconnect();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

export { invalidationChannel };
