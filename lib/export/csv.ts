/**
 * CSV serialisation helper for list exports.
 *
 * Server-safe (no DOM dependencies) so it can be called from a Route Handler
 * that streams the CSV back to the browser, OR from a client-side "Export"
 * button that builds a Blob inline. Either side uses the same escape rules.
 */

/**
 * Convert an array of row objects into a CSV string.
 *
 * - The header row is taken from `columns` (caller-controlled — avoids
 *   leaking internal fields when serialising Prisma rows).
 * - Cell values are escaped: `null` / `undefined` → empty string; strings
 *   containing commas, double-quotes, or newlines are wrapped in double-quotes
 *   with embedded double-quotes doubled (RFC 4180 §2.7).
 *
 * Rows are joined with `\n` and the result has no trailing newline.
 */
export function rowsToCsv(
  rows: Record<string, unknown>[],
  columns: string[]
): string {
  const header = columns.join(",")
  const dataRows = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","))
  return [header, ...dataRows].join("\n")
}

/** Escape a single cell value per RFC 4180. */
function csvEscape(v: unknown): string {
  if (v == null) return ""
  const s = String(v)
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
