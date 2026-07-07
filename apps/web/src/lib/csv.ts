/**
 * Minimal RFC 4180 CSV parser (TASK-0028). Handles quoted fields,
 * embedded commas/newlines/escaped quotes, and CRLF. Deliberately owned
 * rather than a dependency: the import route is the only consumer and
 * the grammar is thirty lines.
 */
export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    // Skip fully empty lines (common trailing newline).
    if (row.length > 1 || (row[0] ?? '') !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (inQuotes) {
      if (char === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      if (text.charAt(i + 1) === '\n') i += 1;
      pushRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) pushRow();

  const [headers, ...data] = rows;
  return { headers: headers ?? [], rows: data };
}
