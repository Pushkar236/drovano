/**
 * Typed domain errors (CODING_STANDARDS.md): expected failures carry a
 * machine code and an actionable message; the API layer maps them to
 * precise transport codes. Never generic 500s for validation.
 */
export type PlatformErrorCode = 'unknown-api-key' | 'unknown-webhook' | 'invalid-value';

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;

  constructor(code: PlatformErrorCode, message: string) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
  }
}
