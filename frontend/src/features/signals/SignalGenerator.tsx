import { useEffect, useRef, useState } from 'react';
import { PageHeader, Card, Metric } from '../../components/ui/layout';
import { NoteList, Alert } from '../../components/ui/feedback';
import { DataTable } from '../../components/common/DataTable';
import { Equation } from '../../components/common/Equation';
import { ExportMenu } from '../../components/common/ExportMenu';
import { SaveExperimentButton, usePendingConfig } from '../../components/common/SaveExperimentButton';
import { SignalPlot } from './SignalPlot';
import { SignalControls, useSignalBuilder, EXAMPLE_STATES } from './builder';
import { signalStats, type Signal } from '../../core/signals';
import { downloadCsv } from '../../services/export';
import { sanitizeSignalConfig } from '../../services/storage';
import { useFormat } from '../../app/AppContext';

export default function SignalGenerator() {
  const builder = useSignalBuilder(EXAMPLE_STATES.sine5Hz);
  const pending = usePendingConfig('signals');
  const plotRef = useRef<HTMLDivElement>(null);
  const fmt = useFormat();
  const [showTable, setShowTable] = useState(true);

  useEffect(() => {
    if (!pending) return;
    const clean = sanitizeSignalConfig(pending);
    if (clean) builder.load(clean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const signal = builder.signal;
  const stats = signal ? signalStats(signal) : null;

  const baseName = `signal-${builder.params.type}-${builder.spec.domain}`;

  const csv = () => {
    if (!signal) return;
    const meta: Record<string, string> = {
      product: 'SignalMaster Pro',
      module: 'Signal Generator',
      expression: signal.formula,
      domain: signal.domain === 'continuous' ? 'continuous-time (uniformly sampled for display)' : 'discrete-time',
      amplitude: String(builder.params.amplitude),
      frequency: `${builder.params.frequency} ${signal.domain === 'continuous' ? 'Hz' : 'cycles/sample'}`,
      phase_rad: String(builder.params.phase),
      shift: String(builder.params.shift),
      notes: signal.notes.join(' | '),
    };
    if (signal.domain === 'continuous') {
      const dt = signal.axis.length > 1 ? signal.axis[1] - signal.axis[0] : 0;
      meta.sampling_interval_s = String(dt);
      meta.sampling_rate_hz = String(dt > 0 ? 1 / dt : 'n/a');
      downloadCsv(baseName, ['t_s', 'x(t)'], signal.axis.map((t, i) => [t, signal.values[i]]), meta);
    } else {
      downloadCsv(baseName, ['n', 'x[n]'], signal.axis.map((n, i) => [n, signal.values[i]]), meta);
    }
  };

  const json = () => ({
    format: 'signalmaster-pro/signal',
    version: 1,
    params: builder.params,
    spec: builder.spec,
    expression: signal?.formula ?? builder.formula,
    notes: signal?.notes ?? builder.notes,
  });

  const copyContent = () => {
    if (!signal || !stats) return '';
    const header = signal.domain === 'continuous' ? 't,x(t)' : 'n,x[n]';
    const rows = signal.axis.map((a, i) => `${a},${signal.values[i]}`);
    return [`# ${signal.formula}`, header, ...rows].join('\n');
  };

  const peakCheck = signal && signal.params.type === 'sine' ? signalStats(signal).peak : null;

  return (
    <div>
      <PageHeader
        title="Signal Generator"
        description="Build continuous-time and discrete-time signals from standard waveforms or a custom expression, then inspect the mathematics and export the samples."
        icon="wave"
        actions={
          <>
            <SaveExperimentButton
              module="signals"
              config={{ params: builder.params, spec: builder.spec }}
              summary={`${builder.params.type} · ${builder.formula}`}
              defaultName={`${builder.params.type} signal`}
              disabled={!signal}
            />
            <ExportMenu
              baseName={baseName}
              onCsv={signal ? csv : undefined}
              onJson={json}
              pngRef={plotRef}
              copyContent={signal ? copyContent : undefined}
              onPrint={() => window.print()}
              disabled={!signal}
            />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Signal setup" icon="settings" bodyClassName="card-pad">
            <SignalControls builder={builder} />
          </Card>

          <Card title="Mathematical model" icon="book">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">Expression</p>
              <div className="overflow-x-auto rounded-lg border border-line bg-surface2/40 px-3 py-2 font-mono text-[12.5px] text-ink">{builder.formula || '—'}</div>
              {signal && (
                <p className="text-[11px] leading-relaxed text-muted">
                  {signal.domain === 'continuous'
                    ? `Rendered on ${signal.axis.length} uniform samples from t = ${fmt(signal.axis[0])} to ${fmt(signal.axis[signal.axis.length - 1])} s (Δt = ${fmt((signal.axis[1] - signal.axis[0]) || 0)} s).`
                    : `Defined at integer indices n = ${signal.axis[0]} … ${signal.axis[signal.axis.length - 1]} (${signal.axis.length} samples).`}
                </p>
              )}
              <NoteList notes={builder.notes} title="Signal assumptions" />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Time-domain waveform"
            subtitle={signal ? (signal.domain === 'continuous' ? 'Continuous-time rendering' : 'Discrete-time sequence (stem plot)') : undefined}
            icon="activity"
            actions={
              <button type="button" className="btn-ghost btn-sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
                {showTable ? 'Hide' : 'Show'} sample table
              </button>
            }
          >
            {signal ? (
              <>
                <SignalPlot signal={signal} title="Generated signal" containerRef={plotRef} height={330} />
                {stats && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <Metric label="Peak |x|" value={fmt(stats.peak)} />
                    <Metric label="Min" value={fmt(stats.min)} />
                    <Metric label="Max" value={fmt(stats.max)} />
                    <Metric label="RMS" value={fmt(stats.rms)} />
                    <Metric label="Mean" value={fmt(stats.mean)} />
                    <Metric label="Energy Σx²" value={fmt(stats.energy)} />
                  </div>
                )}
              </>
            ) : (
              <Alert tone="error" title="Signal cannot be generated">
                {builder.error}
              </Alert>
            )}
          </Card>

          {signal && showTable && (
            <Card title="Numerical samples" subtitle={`First 25 of ${signal.values.length} samples`} icon="table">
              {signal.domain === 'continuous' ? (
                <DataTable
                  caption="Signal samples"
                  maxHeight={280}
                  columns={[
                    { key: 'index', header: '#', width: '60px', render: (_r: { t: number; x: number }, i: number) => String(i + 1) },
                    { key: 't', header: 't (s)', align: 'right', render: (r: { t: number; x: number }) => fmt(r.t) },
                    { key: 'x', header: 'x(t)', align: 'right', render: (r: { t: number; x: number }) => fmt(r.x) },
                  ]}
                  rows={signal.axis.slice(0, 25).map((t, i) => ({ t, x: signal.values[i] }))}
                />
              ) : (
                <DataTable
                  caption="Signal samples"
                  maxHeight={280}
                  columns={[
                    { key: 'n', header: 'n', align: 'right', render: (r: { n: number; x: number }) => String(r.n) },
                    { key: 'x', header: 'x[n]', align: 'right', render: (r: { n: number; x: number }) => fmt(r.x) },
                  ]}
                  rows={signal.axis.slice(0, 25).map((n, i) => ({ n, x: signal.values[i] }))}
                />
              )}
            </Card>
          )}

          <Card title="Interpretation" icon="info">
            <Interpretation signal={signal} />
            {signal && signal.params.type === 'sine' && (
              <div className="mt-3 rounded-lg border border-line bg-surface2/40 p-3">
                <p className="mb-1 text-[11px] font-semibold text-muted">Check: peak value should equal the amplitude</p>
                <Equation latex={`A = ${builder.params.amplitude},\\quad \\max_t |x(t)| = ${fmt(peakCheck ?? 0)}`} display />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Interpretation({ signal }: { signal: Signal | null }) {
  if (!signal) return <p className="text-xs text-muted">Fix the highlighted input to see the interpretation.</p>;
  const p = signal.params;
  const items: string[] = [];
  if (p.type === 'sine' || p.type === 'cosine') {
    const period = signal.domain === 'continuous' ? (p.frequency !== 0 ? 1 / Math.abs(p.frequency) : Infinity) : p.frequency !== 0 ? 1 / Math.abs(p.frequency) : Infinity;
    items.push(`Period T = 1/|f| = ${Number.isFinite(period) ? period.toPrecision(5) : '∞'} ${signal.domain === 'continuous' ? 's' : 'samples'}.`);
    items.push(
      signal.domain === 'discrete'
        ? `Discrete-time frequency is ${p.frequency} cycles/sample = ${(2 * Math.PI * p.frequency).toPrecision(5)} rad/sample; the sequence is periodic only if f is rational.`
        : `Angular frequency ω = 2πf = ${(2 * Math.PI * p.frequency).toPrecision(5)} rad/s.`,
    );
  }
  if (p.type === 'exponential') items.push(`Time constant τ = 1/σ = ${(1 / (p.decay || 1)).toPrecision(5)} s; the signal decays to 1/e after τ.`);
  if (p.type === 'step') items.push('The step is right-continuous at its transition (u(0) = 1 by convention).');
  if (p.type === 'impulse') items.push(signal.domain === 'continuous' ? 'The impulse is a generalised function: only its area (weight) is physically meaningful, not a height.' : 'δ[0] = 1 and δ[n] = 0 for n ≠ 0; it is the identity element of convolution.');
  if (p.type === 'ramp') items.push('The ramp has infinite energy over an infinite interval; the plotted energy is windowed.');
  items.push('Amplitude scaling multiplies values only; it does not change the time axis or the period.');
  return (
    <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand/70" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
