/**
 * Typed domain errors (CODING_STANDARDS.md): expected failures carry a
 * machine code and an actionable message; the API layer maps them to
 * precise transport codes. Never generic 500s for validation.
 */
export type CrmErrorCode =
  | 'unknown-attribute'
  | 'archived-attribute'
  | 'invalid-value'
  | 'invalid-key'
  | 'duplicate-key'
  | 'unknown-object'
  | 'unknown-record'
  | 'unknown-relation-target'
  | 'wrong-relation-target';

export class CrmError extends Error {
  readonly code: CrmErrorCode;

  constructor(code: CrmErrorCode, message: string) {
    super(message);
    this.name = 'CrmError';
    this.code = code;
  }
}
