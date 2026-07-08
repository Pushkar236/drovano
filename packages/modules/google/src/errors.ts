/**
 * Typed domain errors (CODING_STANDARDS.md): expected failures carry a
 * machine code and an actionable message.
 */
export type GoogleErrorCode =
  | 'oauth-failed'
  | 'token-refresh-failed'
  | 'api-error'
  /** Calendar 410: the sync token expired — do a full resync. */
  | 'sync-token-expired'
  | 'unknown-connection';

export class GoogleError extends Error {
  readonly code: GoogleErrorCode;

  constructor(code: GoogleErrorCode, message: string) {
    super(message);
    this.name = 'GoogleError';
    this.code = code;
  }
}
