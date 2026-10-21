import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MODULES, dashboardQuickStart, getModule } from '../../app/registry';
import { useEngineStatus, useSettings } from '../../app/AppContext';
import { Card, Metric, Modal, PageHeader, Tooltip } from '../../components/ui/layout';
import { Icon } from '../../components/ui/icons';
import { EmptyState, useToast } from '../../components/ui/feedback';
import { TextField } from '../../components/ui/fields';
import {
  deleteExperiment,
  duplicateExperiment,
  listExperiments,
  listRecents,
  loadProgress,
  renameExperiment,
  type SavedExperiment,
} from '../../services/storage';

const SAMPLE_TOPICS = [
  { id: 'convolution', title: 'Convolution in the time domain', blurb: 'Definition, the flip-and-slide picture, and why length is N + M − 1.' },
  { id: 'fourier', title: 'Sampling, aliasing and leakage', blurb: 'Nyquist limits, spectral leakage and choosing an analysis window.' },
  { id: 'systems', title: 'Stability and the pole-zero picture', blurb: 'BIBO stability, ROC intuition and the role of pole locations.' },
];

export function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { settings, storageOk } = useSettings();
  const { status, info } = useEngineStatus();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  // `revision` is a deliberate cache-buster: these values live in localStorage,
  // so React cannot know when they change without an explicit invalidation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const experiments = useMemo(() => listExperiments(), [revision]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recents = useMemo(() => listRecents(), [revision]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const progress = useMemo(() => loadProgress(), [revision]);

  const totals = useMemo(() => {
    const entries = Object.values(progress);
    const attempted = entries.reduce((a, e) => a + e.attempted, 0);
    const correct = entries.reduce((a, e) => a + e.correct, 0);
    return { attempted, correct, accuracy: attempted ? Math.round((correct / attempted) * 100) : null };
  }, [progress]);

  const [renaming, setRenaming] = useState<SavedExperiment | null>(null);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const openExperiment = (exp: SavedExperiment) => {
    const mod = getModule(exp.module);
    if (!mod) {
      toast.push('That experiment belongs to a module that is not available.', 'error');
      return;
    }
    navigate(mod.path, { state: { experiment: exp } });
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <PageHeader
        title="Dashboard"
        description="Nine analysis modules, running entirely in this browser. Pick a tool, or continue where you left off."
        actions={
          <>
            <Link to="/reference" className="btn-secondary btn-sm">
              <Icon name="learning" size={13} /> Formula reference
            </Link>
            <Link to="/signals" className="btn-primary btn-sm">
              <Icon name="plus" size={13} /> New signal
            </Link>
          </>
        }
      />

      {/* Status strip: environment facts, not decoration. */}
      <section aria-label="Workspace status" className="mb-3.5 flex flex-col divide-y divide-line rounded-[6px] border border-line bg-surface sm:flex-row sm:divide-x sm:divide-y-0">
        <div className="grid flex-1 grid-cols-2 divide-x divide-line sm:grid-cols-4">
          <Metric variant="plain" label="Saved experiments" value={String(experiments.length)} />
          <Metric variant="plain" label="Tools visited" value={String(recents.length)} />
          <Metric variant="plain" label="Practice answered" value={totals.attempted ? String(totals.attempted) : '—'} />
          <Metric
            variant="plain"
            label="Accuracy"
            value={totals.accuracy === null ? '—' : `${totals.accuracy}%`}
            tone={totals.accuracy === null ? 'default' : totals.accuracy >= 70 ? 'ok' : 'warn'}
          />
        </div>
        <div className="flex flex-col justify-center gap-1 px-3 py-2 text-[10.5px] text-muted sm:w-[248px]">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === 'online' ? 'bg-ok' : status === 'checking' ? 'bg-warn' : 'bg-muted'}`} aria-hidden="true" />
            <span className="truncate">
              SymPy engine{' '}
              <span className="text-ink">
                {status === 'online' ? `online · v${info?.sympy ?? '—'}` : status === 'checking' ? 'checking…' : 'offline (numeric only)'}
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="save" size={11} className="shrink-0" />
            <span className="truncate">
              Storage <span className="text-ink">{storageOk ? 'local, this browser' : 'unavailable'}</span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="activity" size={11} className="shrink-0" />
            <span className="truncate">
              Recompute <span className="text-ink">{settings.autoRun ? 'live' : 'manual'}</span>
            </span>
          </span>
        </div>
      </section>

      {/* Tool index */}
      <section aria-labelledby="tools-heading" className="mb-3.5">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="tools-heading" className="eyebrow">
            Analysis modules
          </h2>
          <span className="font-mono text-[10px] text-muted">09 modules · local compute</span>
        </div>
        <div className="grid gap-px overflow-hidden rounded-[6px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((m, i) => (
            <Link
              key={m.id}
              to={m.path}
              className="group flex items-start gap-2.5 bg-surface px-3.5 py-2.5 transition-colors hover:bg-surface2"
            >
              <span className="mt-[1px] w-5 shrink-0 font-mono text-[10px] leading-5 text-muted/70">{String(i + 1).padStart(2, '0')}</span>
              <Icon name={m.icon} size={14} className="mt-[3px] shrink-0 text-muted transition-colors group-hover:text-brand" strokeWidth={1.8} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium leading-5 text-ink">{m.title}</span>
                <span className="mt-px block text-[11px] leading-[1.45] text-muted line-clamp-2">{m.description}</span>
              </span>
              <Icon name="chevronRight" size={13} className="mt-[3px] shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>

      <div className="mb-3.5 grid gap-3 lg:grid-cols-3">
        {/* Quick start */}
        <Card title="Quick-start examples" icon="play" className="lg:col-span-1">
          <ul className="space-y-0.5">
            {dashboardQuickStart.map((q) => (
              <li key={q.title}>
                <button
                  type="button"
                  onClick={() => navigate(q.path)}
                  className="flex w-full items-start gap-2 border-l-2 border-line px-2 py-1.5 text-left transition-colors hover:border-brand hover:bg-surface2/60"
                >
                  <Icon name={q.icon} size={13} className="mt-[3px] shrink-0 text-muted" strokeWidth={1.8} />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium leading-5 text-ink">{q.title}</span>
                    <span className="block text-[10.5px] leading-snug text-muted">{q.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Recent */}
        <Card title="Recently used tools" icon="clock" className="lg:col-span-1">
          {recents.length === 0 ? (
            <EmptyState icon="clock" title="No activity yet" description="Open any module and it will appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {recents
                .filter((r) => r.route !== '/')
                .slice(0, 6)
                .map((r) => (
                  <li key={r.route}>
                    <Link to={r.route} className="flex items-center gap-2 py-1.5 text-[12.5px] text-ink hover:text-brand">
                      <Icon name="chevronRight" size={13} className="text-muted" />
                      <span className="truncate">{r.title}</span>
                      <span className="ml-auto shrink-0 text-[10.5px] text-muted">{relativeTime(r.at)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        {/* Learning */}
        <Card title="Featured learning" icon="learning" className="lg:col-span-1">
          <ul className="space-y-0.5">
            {SAMPLE_TOPICS.map((t) => (
              <li key={t.id}>
                <Link to="/learning" className="block border-l-2 border-line px-2 py-1.5 transition-colors hover:border-brand hover:bg-surface2/60">
                  <span className="block text-[12px] font-medium leading-5 text-ink">{t.title}</span>
                  <span className="block text-[10.5px] leading-snug text-muted">{t.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/learning" className="mt-2 inline-block text-xs font-medium text-brand hover:underline">
            All tutorials and practice →
          </Link>
        </Card>
      </div>

      {/* Saved experiments */}
      <Card
        title="Saved experiments"
        subtitle="Stored locally in this browser — export to back up or move them between devices."
        icon="folder"
        actions={
          <Link to="/signals" className="btn-secondary btn-sm">
            <Icon name="plus" size={13} /> New experiment
          </Link>
        }
      >
        {experiments.length === 0 ? (
          <EmptyState
            icon="folder"
            title="No saved experiments"
            description="Use the Save button in any module to keep a configuration. Saved experiments appear here with rename, duplicate, delete and export actions."
            action={
              <button type="button" className="btn-primary btn-sm mt-1" onClick={() => navigate('/signals')}>
                Create the first one
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Module</th>
                  <th scope="col">Updated</th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((exp) => (
                  <tr key={exp.id}>
                    <td>
                      <span className="font-sans text-[13px] font-medium text-ink">{exp.name}</span>
                      {exp.summary && <span className="ml-2 block truncate font-sans text-[10.5px] text-muted sm:inline">{exp.summary}</span>}
                    </td>
                    <td className="font-sans text-xs text-muted">{getModule(exp.module)?.title ?? exp.module}</td>
                    <td className="text-xs text-muted">{relativeTime(exp.updatedAt)}</td>
                    <td>
                      <div className="flex justify-end gap-0.5">
                        <Tooltip text="Open this experiment in its module">
                          <button type="button" className="btn-icon" onClick={() => openExperiment(exp)} aria-label={`Open ${exp.name}`}>
                            <Icon name="external" size={14} />
                          </button>
                        </Tooltip>
                        <Tooltip text="Rename">
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => {
                              setRenaming(exp);
                              setNewName(exp.name);
                            }}
                            aria-label={`Rename ${exp.name}`}
                          >
                            <Icon name="save" size={14} />
                          </button>
                        </Tooltip>
                        <Tooltip text="Duplicate">
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => {
                              if (duplicateExperiment(exp.id)) {
                                toast.push('Duplicated.');
                                refresh();
                              } else toast.push('Could not duplicate.', 'error');
                            }}
                            aria-label={`Duplicate ${exp.name}`}
                          >
                            <Icon name="copy" size={14} />
                          </button>
                        </Tooltip>
                        <Tooltip text="Delete permanently">
                          <button
                            type="button"
                            className="btn-icon hover:text-err"
                            onClick={() => setConfirmDelete(exp.id)}
                            aria-label={`Delete ${exp.name}`}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename experiment"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => {
                if (!renaming) return;
                const name = newName.trim();
                if (!name) {
                  toast.push('The name cannot be empty.', 'error');
                  return;
                }
                if (renameExperiment(renaming.id, name)) {
                  toast.push('Renamed.');
                  setRenaming(null);
                  refresh();
                } else toast.push('Could not rename.', 'error');
              }}
            >
              Save name
            </button>
          </>
        }
      >
        <TextField label="New name" value={newName} onChange={setNewName} autoFocus />
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete experiment"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger btn-sm"
              onClick={() => {
                if (confirmDelete && deleteExperiment(confirmDelete)) {
                  toast.push('Experiment deleted.');
                  setConfirmDelete(null);
                  refresh();
                }
              }}
            >
              Delete permanently
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">This cannot be undone. Exported JSON files are unaffected.</p>
      </Modal>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}
