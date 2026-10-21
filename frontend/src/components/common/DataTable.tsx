import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

/**
 * Compact scrollable data table used for step-by-step calculations and
 * numerical results. The first column is treated as a row header for screen
 * readers.
 */
export function DataTable<T>({
  columns,
  rows,
  caption,
  maxHeight = 340,
  emptyMessage = 'No rows to display.',
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  caption?: string;
  maxHeight?: number;
  emptyMessage?: string;
  rowKey?: (row: T, index: number) => string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">{emptyMessage}</p>;
  }
  return (
    <div className="table-wrap" style={{ maxHeight }}>
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined} className={c.align === 'right' ? 'text-right' : ''}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : i}>
              {columns.map((c, ci) => (
                <td key={c.key} className={c.align === 'right' ? 'text-right' : ''}>
                  {c.render ? c.render(row, i) : ci === 0 ? <span className="text-ink">{String((row as Record<string, unknown>)[c.key] ?? '')}</span> : String((row as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
