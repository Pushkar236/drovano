/**
 * Typed domain errors (CODING_STANDARDS.md): expected failures carry a
 * machine code and an actionable message; the API layer maps them to
 * precise transport codes.
 */
export type RetrievalErrorCode = 'not-permitted' | 'invalid-input';

export class RetrievalError extends Error {
  readonly code: RetrievalErrorCode;

  constructor(code: RetrievalErrorCode, message: string) {
    super(message);
    this.name = 'RetrievalError';
    this.code = code;
  }
}
