import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  close: vi.fn().mockResolvedValue(true),
}));

import * as Sentry from '@sentry/node';

import { initTelemetry } from './index.js';

describe('initTelemetry', () => {
  it('stays fully disabled without a DSN — no init, no capture, safe shutdown', async () => {
    const telemetry = initTelemetry({ serviceName: 'api' });
    expect(telemetry.enabled).toBe(false);
    telemetry.captureError(new Error('ignored'));
    await telemetry.shutdown();
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.close).not.toHaveBeenCalled();
  });

  it('initializes with PII disabled and forwards errors with context', async () => {
    const telemetry = initTelemetry({
      serviceName: 'api',
      sentryDsn: 'https://key@example.ingest.sentry.io/1',
      environment: 'staging',
    });
    expect(telemetry.enabled).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'staging',
        serverName: 'api',
        sendDefaultPii: false,
      }),
    );

    const failure = new Error('boom');
    telemetry.captureError(failure, { tenantId: 't-1' });
    expect(Sentry.captureException).toHaveBeenCalledWith(failure, {
      extra: { tenantId: 't-1' },
    });

    await telemetry.shutdown();
    expect(Sentry.close).toHaveBeenCalled();
  });
});
