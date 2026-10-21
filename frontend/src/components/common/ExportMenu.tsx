import { useState, useRef, useEffect } from 'react';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/feedback';
import { copyText } from '../../services/export';
import { exportPlotPng } from '../plot/Plot';

export interface ExportMenuProps {
  /** Base filename without extension. */
  baseName: string;
  onCsv?: () => void;
  onJson?: () => void;
  pngRef?: React.RefObject<HTMLDivElement>;
  /** Text copied by the "Copy data" action. */
  copyContent?: () => string;
  onPrint?: () => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Single export entry point shared by all modules: CSV, JSON, PNG, clipboard
 * and print. Actions that a module does not support are not rendered at all —
 * there are no decorative or dead buttons.
 */
export function ExportMenu({ baseName, onCsv, onJson, pngRef, copyContent, onPrint, disabled, compact }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (fn: () => void | Promise<void>, message: string) => {
    setOpen(false);
    try {
      await fn();
      toast.push(message);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Export failed.', 'error');
    }
  };

  const hasAny = Boolean(onCsv || onJson || pngRef || copyContent || onPrint);
  if (!hasAny) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`btn-secondary ${compact ? 'btn-sm' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
      >
        <Icon name="download" size={14} />
        Export
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Export ${baseName}`}
          className="absolute right-0 z-40 mt-1.5 w-52 animate-fade-in overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-pop"
        >
          {onCsv && (
            <MenuItem icon="table" label="Download CSV" hint="numeric data + metadata" onClick={() => run(onCsv, 'CSV downloaded.')} />
          )}
          {onJson && <MenuItem icon="save" label="Download JSON" hint="configuration snapshot" onClick={() => run(onJson, 'JSON downloaded.')} />}
          {pngRef && (
            <MenuItem
              icon="download"
              label="Download plot PNG"
              hint="1200×700, 2× scale"
              onClick={() => run(() => exportPlotPng(pngRef.current, baseName), 'Plot image downloaded.')}
            />
          )}
          {copyContent && (
            <MenuItem
              icon="copy"
              label="Copy results"
              hint="to clipboard"
              onClick={() =>
                run(async () => {
                  await copyText(copyContent());
                }, 'Results copied to the clipboard.')
              }
            />
          )}
          {onPrint && <MenuItem icon="print" label="Printable view" hint="browser print dialog" onClick={() => run(onPrint, 'Print dialog opened.')} />}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, hint, onClick }: { icon: string; label: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-surface2">
      <Icon name={icon} size={14} className="mt-0.5 text-muted" />
      <span>
        <span className="block text-xs font-medium text-ink">{label}</span>
        <span className="block text-[10px] text-muted">{hint}</span>
      </span>
    </button>
  );
}
