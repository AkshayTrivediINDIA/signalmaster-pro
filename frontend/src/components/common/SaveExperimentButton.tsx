import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Modal } from '../ui/layout';
import { TextField } from '../ui/fields';
import { useToast } from '../ui/feedback';
import { Icon } from '../ui/icons';
import { saveExperiment } from '../../services/storage';

/**
 * Save the current module configuration as a named local experiment.
 * Only the module's own serialisable config is stored — no derived data.
 */
export function SaveExperimentButton({
  module,
  config,
  summary,
  defaultName,
  disabled,
}: {
  module: string;
  config: Record<string, unknown>;
  summary?: string;
  defaultName: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setError(null);
    }
  }, [open, defaultName]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the experiment a name.');
      return;
    }
    if (trimmed.length > 80) {
      setError('Names are limited to 80 characters.');
      return;
    }
    const saved = saveExperiment({ name: trimmed, module, config, summary });
    if (!saved) {
      toast.push('Could not save: browser storage is unavailable or full.', 'error');
      return;
    }
    setOpen(false);
    toast.push(`Saved “${trimmed}” on this device.`);
  };

  return (
    <>
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Icon name="save" size={13} /> Save
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Save experiment"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={submit}>
              Save locally
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField label="Experiment name" value={name} onChange={setName} error={error} autoFocus />
          <p className="text-[11.5px] leading-relaxed text-muted">
            Saved in this browser only (localStorage). It is not uploaded and will not appear on other devices or browsers. Use Settings →
            Export to back up your experiments as a JSON file.
          </p>
          {summary && <p className="note">{summary}</p>}
        </div>
      </Modal>
    </>
  );
}

/**
 * Consume a saved experiment passed through router state by the dashboard.
 * Returns the config once, then clears the history entry so a refresh does not
 * re-apply it.
 */
export function usePendingConfig(module: string): Record<string, unknown> | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const state = location.state as { experiment?: { module?: string; config?: Record<string, unknown> } } | null;
    const exp = state?.experiment;
    if (exp && exp.module === module && exp.config) {
      setConfig(exp.config);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return config;
}
