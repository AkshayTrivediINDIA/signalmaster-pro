import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

export function PageHeader({
  title,
  description,
  icon,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  icon?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="mb-3.5 flex flex-col gap-2 border-b border-line pb-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {breadcrumb}
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} size={16} className="shrink-0 text-muted" />}
          <h1 className="truncate text-[17px] font-semibold leading-6 text-ink">{title}</h1>
        </div>
        {description && <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5 no-print">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = 'card-pad',
  icon,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  icon?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <Icon name={icon} size={14} className="shrink-0 text-muted" strokeWidth={1.8} />}
            <div className="min-w-0">
              {title && <h2 className="card-title truncate">{title}</h2>}
              {subtitle && <p className="card-sub mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/**
 * Compact readout used for stored counts and derived statistics. Deliberately
 * flat (no card, no fill): a row of these reads as one instrument strip.
 */
export function Metric({
  label,
  value,
  unit,
  tone = 'default',
  variant = 'boxed',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'ok' | 'warn' | 'err';
  /** `boxed` for readouts inside a panel, `plain` when the caller supplies the frame. */
  variant?: 'boxed' | 'plain';
}) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'err' ? 'text-err' : 'text-ink';
  const boxed = variant === 'boxed';
  return (
    <div className={`min-w-0 ${boxed ? 'rounded-[4px] border border-line bg-surface2/40 px-2.5 py-1.5' : 'px-3 py-2'}`}>
      <p className={`truncate font-semibold uppercase text-muted ${boxed ? 'text-[9.5px]' : 'eyebrow'}`} style={{ letterSpacing: '0.07em' }}>
        {label}
      </p>
      <p className={`mt-0.5 font-mono font-medium leading-5 tabular-nums ${boxed ? 'text-[13px]' : 'text-[15px]'} ${color}`}>
        {value}
        {unit && <span className="ml-1 font-sans text-[10px] font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest callback in a ref so the focus-management effect below only
  // runs when the dialog opens or closes. Without this, every keystroke would
  // re-run the effect and steal focus from the field being typed into.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && ref.current) {
        const focusable = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstInput = ref.current?.querySelector<HTMLElement>('input,textarea,select,button');
    firstInput?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-[8vh] backdrop-blur-sm no-print" onMouseDown={onClose}>
      <div
        ref={ref}
        className={`w-full ${width} animate-fade-in rounded-[6px] border border-line bg-surface shadow-pop`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-4 py-3.5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 w-max max-w-[16rem] -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] font-normal leading-snug text-surface opacity-0 shadow-pop transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
