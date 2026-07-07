/**
 * Telemetry bootstrap — MUST be the first import of main.ts so Sentry's
 * OTel auto-instrumentation patches modules before they load
 * (packages/telemetry README).
 */
import { initTelemetry } from '@drovano/telemetry';

export const telemetry = initTelemetry({
  serviceName: 'drovano-api',
  ...(process.env.SENTRY_DSN !== undefined && process.env.SENTRY_DSN !== ''
    ? { sentryDsn: process.env.SENTRY_DSN }
    : {}),
  environment: process.env.DEPLOY_ENV ?? 'development',
});
