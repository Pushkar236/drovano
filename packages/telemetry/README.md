# @drovano/telemetry

Error monitoring and tracing initialization (TASK-0010; ARCHITECTURE.md
principle 7). Services call `initTelemetry` at boot and depend only on
the returned `Telemetry` interface — never on Sentry directly.

## Posture

- Sentry's Node SDK is OpenTelemetry-based (its tracing rides OTel
  instrumentation and semantic conventions), so call sites keep OTel
  semantics; when a dedicated OTLP backend arrives (Axiom for volume
  logs, M2+), exporters attach here without touching services.
- No DSN → fully disabled (local dev and CI emit nothing).
- `sendDefaultPii: false` — request bodies and user PII never leave the
  service by default (SECURITY.md).
- The audit log is domain data in Postgres (`@drovano/db`
  `writeAuditEntry`), not telemetry — this package never handles it.
