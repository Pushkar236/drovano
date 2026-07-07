import * as Sentry from '@sentry/node';

export interface TelemetryOptions {
  serviceName: string;
  /** No DSN (local dev, CI) → telemetry stays fully disabled. */
  sentryDsn?: string;
  environment?: string;
  /** Trace sample rate, 0–1. Modest default; raise per-service when needed. */
  tracesSampleRate?: number;
}

export interface Telemetry {
  enabled: boolean;
  /** Report an error with optional structured context. */
  captureError: (error: unknown, context?: Record<string, unknown>) => void;
  /** Flush pending events (call on shutdown); resolves when done or timed out. */
  shutdown: () => Promise<void>;
}

/**
 * Telemetry initialization (TASK-0010, ARCHITECTURE.md principle 7).
 * Sentry's Node SDK is OpenTelemetry-based — its tracing uses OTel
 * instrumentation and semantics — so instrumenting through it keeps
 * backends swappable: when a dedicated OTLP backend arrives (Axiom, M2+),
 * exporters attach without re-instrumenting call sites. Call sites depend
 * on THIS interface, never on Sentry directly.
 *
 * Must be called before other imports take effect for auto-instrumentation
 * (see apps/api/src/instrument.ts).
 */
export function initTelemetry(options: TelemetryOptions): Telemetry {
  const enabled = options.sentryDsn !== undefined && options.sentryDsn !== '';
  if (enabled) {
    Sentry.init({
      dsn: options.sentryDsn,
      environment: options.environment ?? 'development',
      serverName: options.serviceName,
      tracesSampleRate: options.tracesSampleRate ?? 0.1,
      // SECURITY.md: no request bodies / PII by default.
      sendDefaultPii: false,
    });
  }

  return {
    enabled,
    captureError: (error, context) => {
      if (!enabled) return;
      Sentry.captureException(error, context === undefined ? undefined : { extra: context });
    },
    shutdown: async () => {
      if (!enabled) return;
      await Sentry.close(2_000);
    },
  };
}
