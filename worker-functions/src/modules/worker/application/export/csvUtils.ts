/**
 * csvUtils.ts
 *
 * RFC 4180-compliant CSV helpers.
 * Ported from worker-functions/scripts/export-registered-workers-csv.ts.
 */

/**
 * Escapes a single cell value per RFC 4180:
 * - null/undefined/empty → empty string (no quotes)
 * - Contains comma, double-quote, CR or LF → wrap in double quotes,
 *   internal double quotes are doubled.
 */
export function csvCell(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Joins an array of values as a single CSV line (no trailing CRLF). */
export function csvRow(cells: Array<string | null | undefined>): string {
  return cells.map(csvCell).join(',');
}
