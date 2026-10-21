import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MODULES } from './registry';
import { Icon } from '../components/ui/icons';

/** Contextual help drawer: shows the guidance for the module currently open. */
export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const current = MODULES.find((m) => m.path === location.pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 no-print" role="presentation">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-md animate-fade-in flex-col border-l border-line bg-surface shadow-pop"
        role="dialog"
        aria-modal="true"
        aria-label="Contextual help"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Help</p>
            <h2 className="text-sm font-semibold">{current ? current.title : 'SignalMaster Pro'}</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close help panel">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3.5 text-sm">
          {current ? (
            <div className="space-y-4">
              <p className="leading-relaxed text-muted">{current.help.summary}</p>
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">How to use</h3>
                <ol className="space-y-1.5">
                  {current.help.steps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand-ink">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </section>
              {current.help.conventions && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Conventions used</h3>
                  <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted">
                    {current.help.conventions.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand/70" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {current.help.tips && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Tips</h3>
                  <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted">
                    {current.help.tips.map((t, i) => (
                      <li key={i} className="note">
                        {t}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="text-[11px] leading-relaxed text-muted">
                Every module states its mathematical assumptions in the “Assumptions &amp; limitations” section beneath the results.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-[13px] text-muted">
              <p>Welcome to SignalMaster Pro — a workbench for signals and systems.</p>
              <ul className="space-y-1.5">
                <li>
                  <span className="kbd">Ctrl</span> / <span className="kbd">⌘</span> + <span className="kbd">K</span> opens the command menu.
                </li>
                <li>
                  <span className="kbd">Ctrl</span> / <span className="kbd">⌘</span> + <span className="kbd">/</span> opens this help panel.
                </li>
                <li>All calculations run locally in your browser; saved experiments stay on this device.</li>
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
