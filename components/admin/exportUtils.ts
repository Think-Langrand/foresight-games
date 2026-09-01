// Small client-side export helpers shared by admin export UIs (kernel entries,
// design-group answers, …). Blob-download in the browser; no server round-trip.

// Escape a value for a CSV cell (quote when it contains a comma, quote, or newline).
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Trigger a file download of `content`. Prepend "﻿" for CSV so Excel reads UTF-8.
export function download(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
