/**
 * Typed domain errors (CODING_STANDARDS.md): expected failures carry a
 * machine code and an actionable message; the API layer maps them to
 * precise transport codes.
 */
export type AgentsErrorCode =
  | 'unknown-agent'
  | 'unknown-record'
  | 'unknown-proposal'
  | 'already-reviewed'
  | 'not-permitted'
  | 'invalid-grant'
  | 'invalid-value'
  | 'spend-cap-exceeded';

export class AgentsError extends Error {
  readonly code: AgentsErrorCode;

  constructor(code: AgentsErrorCode, message: string) {
    super(message);
    this.name = 'AgentsError';
    this.code = code;
  }
}
