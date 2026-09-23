/**
 * Minimal RFC 4180 CSV reader/writer (quoted fields, escaped quotes, CRLF/LF,
 * BOM). Used for supplier price-list import/export; no dependency needed.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines (e.g. trailing newline, spreadsheet padding).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Parses CSV with a header row into objects keyed by normalized header name. */
export function parseCsvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0]!.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      // Undo toCsv's formula guard so exported files re-import unchanged.
      rec[h] = (r[idx] ?? '').trim().replace(/^'(?=[=+\-@])/, '');
    });
    return rec;
  });
  return { headers, records };
}

function escapeCell(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  // Neutralise spreadsheet formula injection (=, +, -, @) on text cells.
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}
