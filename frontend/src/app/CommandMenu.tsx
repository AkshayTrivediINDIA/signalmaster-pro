import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MODULES } from './registry';
import { Icon } from '../components/ui/icons';

/**
 * Global command palette (Ctrl/⌘+K). Searches module titles, descriptions and
 * keywords, supports arrow-key navigation, Enter to open and Escape to close.
 */
export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MODULES;
    return MODULES.map((m) => {
      const haystack = [m.title, m.description, m.short, ...m.keywords].join(' ').toLowerCase();
      let score = 0;
      if (m.title.toLowerCase().includes(q)) score += 5;
      if (m.title.toLowerCase().startsWith(q)) score += 5;
      if (haystack.includes(q)) score += 2;
      for (const w of q.split(/\s+/)) if (haystack.includes(w)) score += 1;
      return { m, score };
    })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.m);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 p-4 pt-[12vh] backdrop-blur-sm no-print" onMouseDown={onClose} role="presentation">
      <div
        className="w-full max-w-xl animate-fade-in overflow-hidden rounded-[6px] border border-line bg-surface shadow-pop"
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
          <Icon name="search" size={16} className="text-muted" />
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted/70"
            placeholder="Search tools, e.g. “convolution”, “stability”, “FFT”…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter' && results[active]) go(results[active].path);
            }}
            aria-label="Search modules"
            aria-controls="command-results"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            role="combobox"
            aria-expanded
          />
          <span className="kbd">esc</span>
        </div>
        <ul id="command-results" role="listbox" className="max-h-[52vh] overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted">No module matches “{query}”.</li>}
          {results.map((m, i) => (
            <li key={m.id} id={`cmd-${m.id}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(m.path)}
                className={`flex w-full items-center gap-3 px-3.5 py-2 text-left ${i === active ? 'bg-brand-soft' : ''}`}
              >
                <Icon name={m.icon} size={16} className="text-brand" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{m.title}</span>
                  <span className="block truncate text-[11px] text-muted">{m.short}</span>
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted">{m.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
