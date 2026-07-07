import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('parses headers and rows', () => {
    const parsed = parseCsv('name,domain\nAcme,acme.com\nGlobex,globex.com\n');
    expect(parsed.headers).toEqual(['name', 'domain']);
    expect(parsed.rows).toEqual([
      ['Acme', 'acme.com'],
      ['Globex', 'globex.com'],
    ]);
  });

  it('handles quoted fields with commas, newlines, and escaped quotes', () => {
    const parsed = parseCsv('name,notes\r\n"Acme, Inc.","line one\nline ""two"""\r\n');
    expect(parsed.rows).toEqual([['Acme, Inc.', 'line one\nline "two"']]);
  });

  it('skips blank lines and preserves empty trailing fields', () => {
    const parsed = parseCsv('a,b\n\n1,\n');
    expect(parsed.rows).toEqual([['1', '']]);
  });

  it('returns empty shape for empty input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});
