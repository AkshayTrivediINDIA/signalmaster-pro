import { useRef, useState } from 'react';
import { Modal, Tooltip } from '../components/ui/layout';
import { NumberField, SegmentedControl, CheckboxField } from '../components/ui/fields';
import { Alert, useToast } from '../components/ui/feedback';
import { Icon } from '../components/ui/icons';
import { useSettings, useEngineStatus } from './AppContext';
import { useTheme } from '../hooks/useTheme';
import {
  clearRecents,
  exportExperiments,
  importExperiments,
  listExperiments,
  resetProgress,
  storageAvailable,
} from '../services/storage';
import { downloadText } from '../services/export';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update } = useSettings();
  const { choice, setChoice } = useTheme();
  const { status, info } = useEngineStatus();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const count = open ? listExperiments().length : 0;

  const handleImport = async (file: File) => {
    const text = await file.text();
    const report = importExperiments(text);
    if (report.errors.length) toast.push(report.errors[0], 'error');
    else toast.push(`Imported ${report.imported} experiment(s)${report.skipped ? `, skipped ${report.skipped}` : ''}.`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings" width="max-w-xl">
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Appearance</h3>
          <SegmentedControl
            label="Theme"
            value={choice}
            onChange={(v) => setChoice(v)}
            options={[
              { value: 'light', label: 'Light', icon: 'sun' },
              { value: 'dark', label: 'Dark', icon: 'moon' },
              { value: 'system', label: 'System', icon: 'settings' },
            ]}
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted sm:col-span-2">Numerical display</h3>
          <NumberField
            label="Decimal places in result tables"
            value={String(settings.precision)}
            min={0}
            max={10}
            step={1}
            onChange={(v) => {
              const n = Number(v);
              if (Number.isInteger(n) && n >= 0 && n <= 10) update({ precision: n });
            }}
            hint="0–10. Plots always use the full precision of the underlying data."
          />
          <div className="space-y-2.5 pt-1">
            <CheckboxField
              checked={settings.autoRun}
              onChange={(v) => update({ autoRun: v })}
              label="Recompute automatically"
              hint="When off, modules wait for the Compute/Generate button."
            />
            <CheckboxField
              checked={settings.seedExamples}
              onChange={(v) => update({ seedExamples: v })}
              label="Prefill example values"
              hint="Modules open with a working example loaded."
            />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Symbolic engine</h3>
          <div className="flex items-center gap-2 rounded-[4px] border border-line bg-surface2/50 px-2.5 py-2 text-[11.5px]">
            <span
              className={`inline-block h-2 w-2 rounded-full ${status === 'online' ? 'bg-ok' : status === 'checking' ? 'bg-warn' : 'bg-muted'}`}
              aria-hidden="true"
            />
            <span className="font-medium text-ink">
              {status === 'online' ? 'Connected' : status === 'checking' ? 'Checking…' : 'Not running'}
            </span>
            <span className="text-muted">
              {status === 'online'
                ? `FastAPI + SymPy ${info?.sympy ?? ''} — symbolic Laplace/Z transforms available.`
                : 'Optional FastAPI service. All numeric modules work without it.'}
            </span>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your data</h3>
          {!storageAvailable() && <Alert tone="warning">Browser storage is unavailable (private browsing?), so saved experiments will not persist.</Alert>}
          <p className="mb-2 text-[11.5px] leading-relaxed text-muted">
            {count} saved experiment{count === 1 ? '' : 's'} in this browser. Everything is stored locally on this device — there is no cloud
            account or synchronisation.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                downloadText('signalmaster-experiments.json', exportExperiments(), 'application/json');
                toast.push('Experiments exported.');
              }}
            >
              <Icon name="download" size={13} /> Export all
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={13} /> Import file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                clearRecents();
                toast.push('Recent activity cleared.');
              }}
            >
              <Icon name="clock" size={13} /> Clear recent activity
            </button>
            <Tooltip text="Deletes all locally stored practice answers. Cannot be undone.">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  if (!confirmReset) {
                    setConfirmReset(true);
                    toast.push('Press again to confirm resetting practice progress.', 'warning');
                    return;
                  }
                  resetProgress();
                  setConfirmReset(false);
                  toast.push('Practice progress reset.');
                }}
              >
                <Icon name="reset" size={13} /> {confirmReset ? 'Confirm reset' : 'Reset progress'}
              </button>
            </Tooltip>
          </div>
        </section>

        <section className="border-t border-line pt-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">About</h3>
          <p className="text-[11.5px] leading-relaxed text-muted">
            SignalMaster Pro 1.0.0 — an open-source signal processing and systems workbench. Calculations run in your browser with no account,
            no tracking and no paid services. Educational use only; verify critical results independently.
          </p>
        </section>
      </div>
    </Modal>
  );
}
