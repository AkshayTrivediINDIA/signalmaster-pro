/** CSV / JSON / clipboard export helpers with explicit metadata headers. */

export type Cell = string | number | null | undefined;

function escapeCsv(value: Cell): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Build a CSV string. Metadata is written as leading `# key: value` comment
 * lines so the numbers, axes and units stay attached to the data without
 * breaking column parsing (comment lines are trivially skipped).
 */
export function buildCsv(headers: string[], rows: Cell[][], meta: Record<string, string> = {}): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    lines.push(`# ${k}: ${String(v).replace(/\r?\n/g, ' ')}`);
  }
  lines.push(headers.map(escapeCsv).join(','));
  for (const row of rows) lines.push(row.map(escapeCsv).join(','));
  return lines.join('\r\n');
}

export function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][], meta: Record<string, string> = {}): void {
  downloadText(filename.endsWith('.csv') ? filename : `${filename}.csv`, buildCsv(headers, rows, meta), 'text/csv;charset=utf-8');
}

export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename.endsWith('.json') ? filename : `${filename}.json`, JSON.stringify(data, null, 2), 'application/json');
}

/** Copy text to the clipboard with a legacy fallback for non-secure contexts. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand?.('copy');
  ta.remove();
  if (!ok) throw new Error('Copying is not available in this browser.');
}

export function timestampedName(base: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `signalmaster-${base}-${stamp}.${ext}`;
}
