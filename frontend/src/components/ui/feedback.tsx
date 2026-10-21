import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from './icons';

/* ------------------------------- Alerts ------------------------------- */

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const toneStyles: Record<AlertTone, { box: string; icon: string }> = {
  info: { box: 'note', icon: 'info' },
  success: { box: 'note-ok', icon: 'check' },
  warning: { box: 'note-warn', icon: 'alert' },
  error: { box: 'note-err', icon: 'alert' },
};

export function Alert({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const s = toneStyles[tone];
  return (
    <div className={`${s.box} flex gap-2.5 ${className}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={s.icon} size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/* ------------------------------- Notes -------------------------------- */

export function NoteList({ notes, title = 'Assumptions & limitations' }: { notes: string[]; title?: string }) {
  const [open, setOpen] = useState(false);
  if (!notes.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface2/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-ink"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <Icon name="info" size={14} className="text-brand" />
          {title}
          <span className="chip ml-1">{notes.length}</span>
        </span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} className="text-muted" />
      </button>
      {open && (
        <ul className="animate-fade-in space-y-1.5 border-t border-line px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
          {notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand/70" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ Empty state ---------------------------- */

export function EmptyState({ icon = 'activity', title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-line px-5 py-7 text-center">
      <div className="rounded-full border border-line bg-surface p-2 text-muted">
        <Icon name={icon} size={20} />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function Spinner({ size = 16, label = 'Working' }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted" role="status" aria-label={label}>
      <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
        <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* -------------------------------- Toasts ------------------------------- */

export interface Toast {
  id: number;
  tone: AlertTone;
  message: string;
}

interface ToastApi {
  push: (message: string, tone?: AlertTone) => void;
}

const ToastContext = createContext<ToastApi>({ push: () => undefined });

/** Access the toast queue; throws only if used outside the provider (developer error). */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: AlertTone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((t) => t.slice(1)), 4200);
    return () => clearTimeout(timer);
  }, [toasts]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2 no-print" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto animate-fade-in rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm shadow-pop"
            role="status"
          >
            <div className="flex items-start gap-2">
              <Icon
                name={t.tone === 'error' ? 'alert' : t.tone === 'warning' ? 'alert' : 'check'}
                size={15}
                className={t.tone === 'error' ? 'mt-0.5 text-err' : t.tone === 'warning' ? 'mt-0.5 text-warn' : 'mt-0.5 text-ok'}
              />
              <span className="text-ink">{t.message}</span>
              <button
                type="button"
                className="ml-auto text-muted hover:text-ink"
                onClick={() => setToasts((v) => v.filter((x) => x.id !== t.id))}
                aria-label="Dismiss notification"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
