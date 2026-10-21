import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, Card, Metric } from '../../components/ui/layout';
import { Alert, NoteList } from '../../components/ui/feedback';
import { NumberField, SelectField, SegmentedControl, TextAreaField } from '../../components/ui/fields';
import { DataTable } from '../../components/common/DataTable';
import { ExportMenu } from '../../components/common/ExportMenu';
import { SaveExperimentButton, usePendingConfig } from '../../components/common/SaveExperimentButton';
import { Equation } from '../../components/common/Equation';
import { Plot, usePlotTheme, type PlotTrace } from '../../components/plot/Plot';
import { SignalControls, useSignalBuilder, EXAMPLE_STATES } from '../signals/builder';
import { circularConvolution, continuousConvolution, linearConvolution, type ConvStep } from '../../core/convolution';
import { parseSequence, checkNumber } from '../../core/validation';
import { downloadCsv } from '../../services/export';
import { useFormat } from '../../app/AppContext';
import type { SignalParams, TimeSpec } from '../../core/signals';

type Mode = 'linear' | 'circular' | 'continuous';

const EXAMPLES = {
  textbook: { x: '1, 2, 3', h: '1, 1', nx: '0', nh: '0', N: '4', note: 'Textbook identity: {1,2,3} * {1,1} = {1,3,5,3}.' },
  delta: { x: '2, -1, 4, 0', h: '0, 1, 0', nx: '0', nh: '0', N: '6', note: 'Convolution with a shifted unit impulse copies the signal.' },
  average: { x: '1, 4, 2, 8, 5', h: '0.25, 0.25, 0.25, 0.25', nx: '0', nh: '0', N: '8', note: 'A 4-point moving average smooths the sequence (FIR filter).' },
  shifted: { x: '1, 2, 3', h: '1, 2', nx: '2', nh: '-1', N: '5', note: 'Index origins add: the output starts at n₀ₓ + n₀ₕ = 1.' },
};

export default function ConvolutionLab() {
  const pending = usePendingConfig('convolution');
  const [mode, setMode] = useState<Mode>('linear');
  const [xText, setXText] = useState(EXAMPLES.textbook.x);
  const [hText, setHText] = useState(EXAMPLES.textbook.h);
  const [nxText, setNxText] = useState(EXAMPLES.textbook.nx);
  const [nhText, setNhText] = useState(EXAMPLES.textbook.nh);
  const [nText, setNText] = useState(EXAMPLES.textbook.N);
  const [convMode, setConvMode] = useState<'full' | 'same' | 'valid'>('full');
  const [stepCount, setStepCount] = useState('8');
  const ctA = useSignalBuilder(EXAMPLE_STATES.pulse);
  const ctB = useSignalBuilder(EXAMPLE_STATES.pulse);
  const plotRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();
  const fmt = useFormat();

  useEffect(() => {
    if (!pending) return;
    const c = pending as Record<string, unknown>;
    if (typeof c.x === 'string') setXText(c.x);
    if (typeof c.h === 'string') setHText(c.h);
    if (typeof c.nx === 'string') setNxText(c.nx);
    if (typeof c.nh === 'string') setNhText(c.nh);
    if (typeof c.N === 'string') setNText(c.N);
    if (typeof c.convMode === 'string') setConvMode(c.convMode as 'full' | 'same' | 'valid');
    if (c.mode === 'linear' || c.mode === 'circular' || c.mode === 'continuous') setMode(c.mode);
    if (c.ctA && typeof c.ctA === 'object') ctA.load(c.ctA as { params: SignalParams; spec: TimeSpec });
    if (c.ctB && typeof c.ctB === 'object') ctB.load(c.ctB as { params: SignalParams; spec: TimeSpec });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const parsedX = parseSequence(xText, 'x[n]');
  const parsedH = parseSequence(hText, 'h[n]');
  const parsedNx = checkNumber(nxText, 'x index origin n₀ₓ', { integer: true });
  const parsedNh = checkNumber(nhText, 'h index origin n₀ₕ', { integer: true });
  const parsedN = checkNumber(nText, 'Circular length N', { integer: true, min: 1 });

  const discreteResult = useMemo(() => {
    if (mode === 'continuous') return null;
    if (!parsedX.ok) return { ok: false as const, error: parsedX.error };
    if (!parsedH.ok) return { ok: false as const, error: parsedH.error };
    if (!parsedNx.ok) return { ok: false as const, error: parsedNx.error };
    if (!parsedNh.ok) return { ok: false as const, error: parsedNh.error };
    if (mode === 'linear') {
      const steps = Math.max(1, Math.min(50, Number(stepCount) || 8));
      const r = linearConvolution({ values: parsedX.value, origin: parsedNx.value }, { values: parsedH.value, origin: parsedNh.value }, { stepCount: steps, mode: convMode });
      return r.ok ? { ok: true as const, kind: 'linear' as const, value: r.value } : { ok: false as const, error: r.error };
    }
    if (!parsedN.ok) return { ok: false as const, error: parsedN.error };
    const r = circularConvolution({ values: parsedX.value, origin: parsedNx.value }, { values: parsedH.value, origin: parsedNh.value }, parsedN.value);
    return r.ok ? { ok: true as const, kind: 'circular' as const, value: r.value } : { ok: false as const, error: r.error };
  }, [mode, parsedX, parsedH, parsedNx, parsedNh, parsedN, convMode, stepCount]);

  const ctResult = useMemo(() => {
    if (mode !== 'continuous') return null;
    if (!ctA.signal) return { ok: false as const, error: ctA.error ?? 'Signal x(t) is invalid.' };
    if (!ctB.signal) return { ok: false as const, error: ctB.error ?? 'Signal h(t) is invalid.' };
    const r = continuousConvolution(ctA.signal, ctB.signal);
    return r.ok ? { ok: true as const, value: r.value } : { ok: false as const, error: r.error };
  }, [mode, ctA.signal, ctA.error, ctB.signal, ctB.error]);

  const outputValues: number[] = discreteResult?.ok ? discreteResult.value.values : ctResult?.ok ? ctResult.value.values : [];
  const outputAxis: number[] = discreteResult?.ok ? discreteResult.value.values.map((_, i) => discreteResult.value.origin + i) : ctResult?.ok ? ctResult.value.axis : [];

  const traces = useMemo(() => {
    const list: PlotTrace[] = [];
    if (mode === 'continuous') {
      if (ctA.signal) list.push({ x: ctA.signal.axis, y: ctA.signal.values, mode: 'lines', name: 'x(t)', color: theme.palette[0], width: 1.6, dash: 'dash', extra: { line: { shape: 'hv' } } });
      if (ctB.signal) list.push({ x: ctB.signal.axis, y: ctB.signal.values, mode: 'lines', name: 'h(t)', color: theme.palette[2], width: 1.6, dash: 'dot', extra: { line: { shape: 'hv' } } });
      if (ctResult?.ok) list.push({ x: ctResult.value.axis, y: ctResult.value.values, mode: 'lines', name: 'y(t) = x*h', color: theme.palette[3], width: 2.4, dash: 'solid' });
      return list;
    }
    if (!discreteResult?.ok) return list;
    if (parsedX.ok && parsedNx.ok) {
      list.push(...stemTrace(parsedX.value.map((_, i) => parsedNx.value + i), parsedX.value, 'x[n]', theme.palette[0]));
    }
    if (parsedH.ok && parsedNh.ok) {
      list.push(...stemTrace(parsedH.value.map((_, i) => parsedNh.value + i), parsedH.value, 'h[n]', theme.palette[2]));
    }
    list.push(...stemTrace(outputAxis, outputValues, 'y[n]', theme.palette[3]));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, discreteResult, ctResult, parsedX, parsedH, parsedNx, parsedNh, theme]);

  const steps: ConvStep[] = discreteResult?.ok ? discreteResult.value.steps : [];
  const notes: string[] = useMemo(() => {
    const n: string[] = [];
    if (discreteResult?.ok && discreteResult.kind === 'linear') {
      n.push('Linear convolution: y[n] = Σₖ x[k]·h[n−k]; the output length is N + M − 1 and the origin is n₀ₓ + n₀ₕ.');
      n.push(`Here N = ${parsedX.ok ? parsedX.value.length : 0}, M = ${parsedH.ok ? parsedH.value.length : 0} → output length ${outputValues.length}.`);
      if (convMode !== 'full') n.push(`Mode “${convMode}” trims the full result; the untrimmed length is ${parsedX.ok && parsedH.ok ? parsedX.value.length + parsedH.value.length - 1 : 0}.`);
    }
    if (discreteResult?.ok && discreteResult.kind === 'circular') {
      n.push('Circular convolution is periodic modulo N: y[n] = Σₖ x[k]·h[(n−k) mod N].');
      if (discreteResult.value.padded) n.push('At least one input was zero-padded to length N.');
      if (discreteResult.value.truncated) n.push('At least one input was longer than N and was truncated — information was lost. Use linear convolution or a larger N.');
      n.push('Circular and linear convolution agree exactly when N ≥ N + M − 1 (zero padding to at least that length).');
    }
    if (ctResult?.ok) {
      n.push(`Continuous convolution approximated by a Riemann sum with Δτ = ${ctResult.value.dt.toPrecision(4)} s: y(t) ≈ Δτ·Σ x(kΔτ)h(t−kΔτ).`);
      n.push('Finite grid and rectangle-rule integration introduce O(Δτ) error for discontinuous signals; increase the sample count to reduce it.');
      n.push('Signals are treated as zero outside their plotted time windows.');
    }
    return n;
  }, [discreteResult, ctResult, parsedX, parsedH, convMode, outputValues.length]);

  const baseName = `convolution-${mode}`;

  const csv = () => {
    if (mode === 'continuous' && ctResult?.ok) {
      downloadCsv(baseName, ['t_s', 'y(t)'], ctResult.value.axis.map((t, i) => [t, ctResult.value.values[i]]), {
        product: 'SignalMaster Pro',
        module: 'Convolution Lab',
        method: 'continuous convolution, Riemann sum',
        delta_tau_s: String(ctResult.value.dt),
        x_signal: ctA.signal?.formula ?? '',
        h_signal: ctB.signal?.formula ?? '',
        notes: notes.join(' | '),
      });
      return;
    }
    if (!discreteResult?.ok) return;
    downloadCsv(
      baseName,
      ['n', 'y[n]'],
      outputAxis.map((n, i) => [n, outputValues[i]]),
      {
        product: 'SignalMaster Pro',
        module: 'Convolution Lab',
        method: `${discreteResult.kind} convolution`,
        x_sequence: xText,
        h_sequence: hText,
        x_origin: nxText,
        h_origin: nhText,
        output_origin: String(discreteResult.value.origin),
        output_length: String(outputValues.length),
        notes: notes.join(' | '),
      },
    );
  };

  const config = mode === 'continuous' ? { mode, ctA: { params: ctA.params, spec: ctA.spec }, ctB: { params: ctB.params, spec: ctB.spec } } : { mode, x: xText, h: hText, nx: nxText, nh: nhText, N: nText, convMode };

  return (
    <div>
      <PageHeader
        title="Convolution Lab"
        description="Convolve discrete sequences or sampled continuous signals, with the arithmetic expanded term by term so every result can be checked by hand."
        icon="convolution"
        actions={
          <>
            <SaveExperimentButton module="convolution" config={config} defaultName="convolution experiment" summary={mode === 'continuous' ? 'continuous convolution' : `${xText} * ${hText}`} disabled={outputValues.length === 0} />
            <ExportMenu baseName={baseName} onCsv={outputValues.length ? csv : undefined} onJson={() => config} pngRef={plotRef} onPrint={() => window.print()} disabled={!outputValues.length} />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Setup" icon="settings">
            <div className="space-y-3">
              <SegmentedControl
                label="Convolution type"
                value={mode}
                onChange={(v) => setMode(v)}
                options={[
                  { value: 'linear', label: 'Linear' },
                  { value: 'circular', label: 'Circular' },
                  { value: 'continuous', label: 'Continuous' },
                ]}
              />
              {mode !== 'continuous' ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted">Load a worked example</span>
                    <select
                      className="select max-w-[190px] py-1 text-xs"
                      value=""
                      aria-label="Load a worked example"
                      onChange={(e) => {
                        const ex = EXAMPLES[e.target.value as keyof typeof EXAMPLES];
                        if (!ex) return;
                        setXText(ex.x);
                        setHText(ex.h);
                        setNxText(ex.nx);
                        setNhText(ex.nh);
                        setNText(ex.N);
                        e.target.value = '';
                      }}
                    >
                      <option value="">Choose…</option>
                      <option value="textbook">Textbook {`{1,2,3}*{1,1}`}</option>
                      <option value="delta">Impulse copies signal</option>
                      <option value="average">Moving average</option>
                      <option value="shifted">Non-zero origins</option>
                    </select>
                  </div>
                  <TextAreaField label="x[n] — comma separated" value={xText} onChange={setXText} rows={2} hint="e.g. 1, 2, 3" />
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label="x origin n₀ₓ" value={nxText} onChange={setNxText} step={1} />
                    {mode === 'circular' ? (
                      <NumberField label="Circular length N" value={nText} onChange={setNText} step={1} min={1} />
                    ) : (
                      <NumberField label="Step rows shown" value={stepCount} onChange={setStepCount} step={1} min={1} max={50} hint="Breakdown rows" />
                    )}
                  </div>
                  <TextAreaField label="h[n] — comma separated" value={hText} onChange={setHText} rows={2} hint="e.g. 1, 1" />
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label="h origin n₀ₕ" value={nhText} onChange={setNhText} step={1} />
                    {mode === 'circular' ? (
                      <NumberField label="Step rows shown" value={stepCount} onChange={setStepCount} step={1} min={1} max={50} hint="Breakdown rows" />
                    ) : null}
                  </div>
                  {mode === 'linear' && (
                    <SelectField
                      label="Output range"
                      value={convMode}
                      onChange={(v) => setConvMode(v as 'full' | 'same' | 'valid')}
                      options={[
                        { value: 'full', label: 'Full — length N + M − 1' },
                        { value: 'same', label: 'Same — length of x, aligned to x' },
                        { value: 'valid', label: 'Valid — only fully overlapping samples' },
                      ]}
                    />
                  )}
                  {mode === 'circular' && (
                    <Alert tone="info">
                      Circular convolution wraps around. It equals the linear result when N ≥ N + M − 1; otherwise the tail is folded back (and reported).
                    </Alert>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="seg w-full">
                    <span className="seg-item seg-item-active w-full text-center">x(t) and h(t)</span>
                  </div>
                  <div className="rounded-lg border border-line p-2.5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-brand">Signal x(t)</p>
                    <SignalControls builder={ctA} idPrefix="conv-a" compact />
                  </div>
                  <div className="rounded-lg border border-line p-2.5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-brand">Signal h(t)</p>
                    <SignalControls builder={ctB} idPrefix="conv-b" compact />
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Definition" icon="book">
            <Equation display latex={mode === 'circular' ? 'y[n] = \\sum_{k=0}^{N-1} x[k]\\,h[(n-k) \\bmod N]' : mode === 'continuous' ? 'y(t) = \\int_{-\\infty}^{\\infty} x(\\tau)\\,h(t-\\tau)\\,d\\tau' : 'y[n] = \\sum_{k=-\\infty}^{\\infty} x[k]\\,h[n-k] = \\sum_k x[k]\\,h[n-k]'} />
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              {mode === 'continuous'
                ? 'The integral is evaluated numerically with a rectangle rule on the common sample grid; the step size is reported with the result.'
                : 'For finite sequences the sum has at most N·M non-zero terms; the output support starts at n₀ₓ + n₀ₕ.'}
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Result" subtitle={outputValues.length ? `${outputValues.length} output samples` : undefined} icon="activity">
            {(mode !== 'continuous' && !discreteResult?.ok) || (mode === 'continuous' && !ctResult?.ok) ? (
              <Alert tone="error" title="Convolution not computed">
                {(mode !== 'continuous' ? discreteResult : ctResult)?.ok === false ? (mode !== 'continuous' ? (discreteResult as { error: string }).error : (ctResult as { error: string }).error) : 'Check the inputs.'}
              </Alert>
            ) : (
              <>
                <Plot
                  traces={traces}
                  title="Convolution result"
                  summary={`Input signal(s) and the convolution output. Output has ${outputValues.length} samples.`}
                  containerRef={plotRef}
                  height={340}
                  xLabel={mode === 'continuous' ? 'Time t (s)' : 'Index n'}
                  yLabel="Amplitude"
                  vLines={mode !== 'continuous' ? [{ x: 0, label: 'n = 0' }] : undefined}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Output length" value={String(outputValues.length)} />
                  <Metric label="Origin" value={mode === 'continuous' ? fmt(outputAxis[0] ?? 0) : String(discreteResult?.ok ? discreteResult.value.origin : '—')} />
                  <Metric label="Peak |y|" value={fmt(outputValues.length ? Math.max(...outputValues.map(Math.abs)) : 0)} />
                  <Metric label="Energy Σy²" value={fmt(outputValues.reduce((s, v) => s + v * v, 0))} />
                </div>
                <div className="mt-3">
                  <NoteList notes={notes} title="Method & assumptions" />
                </div>
                {mode === 'circular' && discreteResult?.ok && (
                  <p className="mt-2 text-[11px] text-muted">
                    Linearity check: sum of y = (sum x)·(sum h) = {fmt((parsedX.ok ? parsedX.value.reduce((s, v) => s + v, 0) : 0) * (parsedH.ok ? parsedH.value.reduce((s, v) => s + v, 0) : 0))}
                    {' '}— the computed output sums to {fmt(outputValues.reduce((s, v) => s + v, 0))}.
                  </p>
                )}
              </>
            )}
          </Card>

          {steps.length > 0 && (
            <Card title="Step-by-step calculation" subtitle="y[n] = Σ x[k]·h[n−k], expanded for the first output samples" icon="table">
              <div className="divide-y divide-line rounded-[4px] border border-line">
                {steps.map((step) => (
                  <div key={step.n} className="flex flex-wrap items-baseline gap-x-3 px-2.5 py-1.5 hover:bg-surface2/50">
                    <span className="w-12 shrink-0 font-mono text-[11.5px] font-medium text-ink">y[{step.n}]</span>
                    <span className="min-w-0 flex-1 break-words font-mono text-[11px] leading-5 text-muted">
                      {step.terms.length === 0
                        ? 'no overlapping terms → 0'
                        : step.terms.map((t) => `x[${t.k}]·h[${t.hIndex}] = ${fmt(t.xValue)}·${fmt(t.hValue)}`).join('  +  ')}
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink">{fmt(step.sum)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                Each row lists only the terms where both sequences are defined. Zero-valued products are included when the samples exist, so the index
                bookkeeping matches a hand calculation.
              </p>
            </Card>
          )}

          {outputValues.length > 0 && (
            <Card title="Output samples" icon="table">
              <DataTable
                caption="Convolution output"
                maxHeight={260}
                columns={[
                  { key: 'index', header: mode === 'continuous' ? 't (s)' : 'n', align: 'right', render: (r: { index: number; y: number }) => fmt(r.index) },
                  { key: 'y', header: 'y', align: 'right', render: (r: { index: number; y: number }) => fmt(r.y) },
                ]}
                rows={outputAxis.slice(0, 200).map((index, i) => ({ index, y: outputValues[i] }))}
              />
              {outputValues.length > 200 && <p className="mt-1 text-[11px] text-muted">Showing the first 200 of {outputValues.length} samples — export the CSV for the full data.</p>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Stem representation of a discrete sequence: vertical stems (no legend entry)
 * plus a marker trace so the sequence itself is what the legend names.
 */
function stemTrace(x: number[], y: number[], label: string, color: string): PlotTrace[] {
  const sx: (number | null)[] = [];
  const sy: (number | null)[] = [];
  for (let i = 0; i < x.length; i++) {
    sx.push(x[i], x[i], null);
    sy.push(0, y[i], null);
  }
  return [
    { x: sx, y: sy, mode: 'lines', name: `${label} (stems)`, color, width: 1.3, extra: { hoverinfo: 'skip', showlegend: false } },
    { x, y, mode: 'markers', name: label, color, extra: { marker: { size: 5 } } },
  ];
}
