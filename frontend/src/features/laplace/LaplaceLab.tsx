import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, Card, Metric } from '../../components/ui/layout';
import { Alert, NoteList, Spinner } from '../../components/ui/feedback';
import { NumberField, SegmentedControl, SelectField, TextAreaField, TextField } from '../../components/ui/fields';
import { DataTable } from '../../components/common/DataTable';
import { ExportMenu } from '../../components/common/ExportMenu';
import { SaveExperimentButton, usePendingConfig } from '../../components/common/SaveExperimentButton';
import { Equation } from '../../components/common/Equation';
import { Plot, usePlotTheme } from '../../components/plot/Plot';
import { LAPLACE_PAIRS, analyzeInverseLaplace, type LaplaceAnalysis } from '../../core/laplace';
import { parseSequence } from '../../core/validation';
import { downloadCsv } from '../../services/export';
import { useFormat } from '../../app/AppContext';
import { symbolicLaplace } from '../../services/api';
import { Icon } from '../../components/ui/icons';

type Tab = 'table' | 'rational';

const RATIONAL_EXAMPLES = [
  { label: '1 / (s² + 3s + 2)', num: '1', den: '1, 3, 2' },
  { label: '(2s + 1) / (s² + 2s + 5)', num: '2, 1', den: '1, 2, 5' },
  { label: '1 / (s + 2)³ (repeated pole)', num: '1', den: '1, 6, 12, 8' },
  { label: 's / (s² + 4) (cosine)', num: '1, 0', den: '1, 0, 4' },
  { label: '(s + 3) / (s² − s − 6) (unstable)', num: '1, 3', den: '1, -1, -6' },
];

export default function LaplaceLab() {
  const pending = usePendingConfig('laplace');
  const [tab, setTab] = useState<Tab>('table');
  const [pairId, setPairId] = useState('step');
  const [pairParams, setPairParams] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of LAPLACE_PAIRS) for (const q of p.params) init[`${p.id}.${q.key}`] = String(q.default);
    return init;
  });
  const [numText, setNumText] = useState('2, 1');
  const [denText, setDenText] = useState('1, 2, 5');
  const [tMax, setTMax] = useState('10');
  const [samples, setSamples] = useState('801');
  const [symbolicExpr, setSymbolicExpr] = useState('exp(-2*t)');
  const [symbolicState, setSymbolicState] = useState<{ loading: boolean; result?: string; error?: string }>({ loading: false });
  const plotRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();
  const fmt = useFormat();

  useEffect(() => {
    if (!pending) return;
    const c = pending as Record<string, unknown>;
    if (typeof c.num === 'string') setNumText(c.num);
    if (typeof c.den === 'string') setDenText(c.den);
    if (typeof c.tMax === 'string') setTMax(c.tMax);
    if (typeof c.samples === 'string') setSamples(c.samples);
    if (typeof c.pairId === 'string') setPairId(c.pairId);
    if (c.pairParams && typeof c.pairParams === 'object') setPairParams((p) => ({ ...p, ...(c.pairParams as Record<string, string>) }));
    if (c.tab === 'table' || c.tab === 'rational') setTab(c.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const pair = LAPLACE_PAIRS.find((p) => p.id === pairId) ?? LAPLACE_PAIRS[1];
  const pairValues = useMemo(() => {
    const vals: Record<string, number> = {};
    for (const q of pair.params) {
      const raw = pairParams[`${pair.id}.${q.key}`];
      const n = Number(raw);
      vals[q.key] = Number.isFinite(n) ? n : q.default;
    }
    return vals;
  }, [pair, pairParams]);

  const pairBuilt = useMemo(() => pair.build(pairValues), [pair, pairValues]);
  const pairAnalysis = useMemo(() => {
    if (!pairBuilt.ok) return null;
    return analyzeInverseLaplace(pairBuilt.value.num, pairBuilt.value.den, 8, 601);
  }, [pairBuilt]);

  const parsedNum = parseSequence(numText, 'Numerator coefficients', 40);
  const parsedDen = parseSequence(denText, 'Denominator coefficients', 40);
  const tMaxNum = Number(tMax);
  const samplesNum = Math.round(Number(samples));

  const rationalAnalysis = useMemo<{ ok: true; value: LaplaceAnalysis } | { ok: false; error: string }>(() => {
    if (!parsedNum.ok) return { ok: false, error: parsedNum.error };
    if (!parsedDen.ok) return { ok: false, error: parsedDen.error };
    if (!Number.isFinite(tMaxNum) || tMaxNum <= 0 || tMaxNum > 1000) return { ok: false, error: 'Time window must be between 0 and 1000 s.' };
    if (!Number.isFinite(samplesNum) || samplesNum < 20 || samplesNum > 8000) return { ok: false, error: 'Sample count must be between 20 and 8000.' };
    const r = analyzeInverseLaplace(parsedNum.value, parsedDen.value, tMaxNum, samplesNum);
    return r.ok ? r : { ok: false, error: r.error };
  }, [parsedNum, parsedDen, tMaxNum, samplesNum]);

  const active = tab === 'table' ? (pairAnalysis?.ok ? pairAnalysis.value : null) : rationalAnalysis.ok ? rationalAnalysis.value : null;

  const traces = useMemo(() => {
    if (!active) return [];
    return [{ x: active.time, y: active.h, mode: 'lines' as const, name: 'f(t)', color: theme.palette[0], width: 1.9 }];
  }, [active, theme]);

  const baseName = tab === 'table' ? `laplace-pair-${pair.id}` : 'laplace-rational';

  const csv = () => {
    if (!active) return;
    downloadCsv(baseName, ['t_s', 'f(t)'], active.time.map((t, i) => [t, active.h[i]]), {
      product: 'SignalMaster Pro',
      module: 'Laplace Transform Lab',
      input: tab === 'table' ? pair.name : `F(s) = (${numText}) / (${denText})`,
      transform: 'causal inverse Laplace',
      partial_fractions: active.termsLatex.join(' ; '),
      poles: active.poles.poles.map((p) => `${p.value} (x${p.multiplicity})`).join(' ; '),
      roc_note: active.poles.notes.join(' | '),
      peak_verification_error: active.pf.verificationError.toExponential(3),
    });
  };

  const config = tab === 'table' ? { tab, pairId, pairParams } : { tab, num: numText, den: denText, tMax, samples };

  const runSymbolic = async () => {
    setSymbolicState({ loading: true });
    try {
      const r = await symbolicLaplace(symbolicExpr, false);
      if (r.error) setSymbolicState({ loading: false, error: r.error });
      else setSymbolicState({ loading: false, result: r.result ?? '' });
    } catch (e) {
      setSymbolicState({ loading: false, error: e instanceof Error ? e.message : 'Symbolic engine unavailable.' });
    }
  };

  return (
    <div>
      <PageHeader
        title="Laplace Transform Lab"
        description="Exact transform pairs, verified partial-fraction inversion, pole–zero analysis and region-of-convergence reasoning for causal signals."
        icon="laplace"
        actions={
          <>
            <SaveExperimentButton module="laplace" config={config} defaultName="laplace analysis" summary={tab === 'table' ? pair.name : `F(s) = (${numText})/(${denText})`} disabled={!active} />
            <ExportMenu baseName={baseName} onCsv={active ? csv : undefined} onJson={() => config} pngRef={plotRef} onPrint={() => window.print()} disabled={!active} />
          </>
        }
      />

      <div className="mb-4">
        <SegmentedControl
          label="Mode"
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'table', label: 'Standard pairs' },
            { value: 'rational', label: 'Rational F(s) → f(t)' },
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          {tab === 'table' ? (
            <Card title="Transform pair" icon="book">
              <div className="space-y-3">
                <SelectField label="Standard pair" value={pairId} onChange={setPairId} options={LAPLACE_PAIRS.map((p) => ({ value: p.id, label: p.name }))} />
                {pair.params.length === 0 && <p className="hint">This pair has no free parameters.</p>}
                {pair.params.map((q) => (
                  <NumberField
                    key={q.key}
                    label={q.label}
                    value={pairParams[`${pair.id}.${q.key}`] ?? String(q.default)}
                    onChange={(v) => setPairParams((p) => ({ ...p, [`${pair.id}.${q.key}`]: v }))}
                    step={0.5}
                    min={q.min}
                  />
                ))}
                {!pairBuilt.ok && (
                  <Alert tone="warning" title="Reference formula only">
                    {pairBuilt.error}
                  </Alert>
                )}
                <div className="rounded-lg border border-line bg-surface2/40 p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Transform</p>
                  <Equation display latex={pair.sLatex} />
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Time function</p>
                  <Equation display latex={pair.timeLatex} />
                  <p className="mt-1.5 text-[11px] text-muted">
                    <span className="font-semibold text-ink">ROC:</span> {pair.roc}
                  </p>
                </div>
                {pair.notes && <p className="text-[11px] leading-relaxed text-muted">{pair.notes}</p>}
              </div>
            </Card>
          ) : (
            <Card title="Transfer function F(s)" icon="settings">
              <div className="space-y-3">
                <TextAreaField label="Numerator coefficients (highest power first)" value={numText} onChange={setNumText} rows={2} hint="2s + 1 → 2, 1" />
                <TextAreaField label="Denominator coefficients (highest power first)" value={denText} onChange={setDenText} rows={2} hint="s² + 2s + 5 → 1, 2, 5" />
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Time window" value={tMax} onChange={setTMax} step={1} suffix="s" min={0.1} max={1000} />
                  <NumberField label="Samples" value={samples} onChange={setSamples} step={100} min={20} max={8000} />
                </div>
                <SelectField
                  label="Load an example"
                  value=""
                  onChange={(v) => {
                    const ex = RATIONAL_EXAMPLES.find((e) => e.label === v);
                    if (ex) {
                      setNumText(ex.num);
                      setDenText(ex.den);
                    }
                  }}
                  options={[{ value: '', label: 'Choose…' }, ...RATIONAL_EXAMPLES.map((e) => ({ value: e.label, label: e.label }))]}
                />
                <Alert tone="info">
                  Coefficients are highest power first, matching <code>numpy.roots</code>. The result is the <strong>causal</strong> inverse (ROC to the right of
                  the rightmost pole).
                </Alert>
              </div>
            </Card>
          )}

          <Card title="Symbolic engine (optional)" icon="external">
            <p className="mb-2 text-[11.5px] leading-relaxed text-muted">
              Ask the local FastAPI + SymPy service for a symbolic forward transform. If the service is not running, only this panel is affected.
            </p>
            <TextField label="Expression in t" value={symbolicExpr} onChange={setSymbolicExpr} monospace placeholder="exp(-2*t)*sin(3*t)" />
            <button type="button" className="btn-secondary btn-sm mt-2" onClick={runSymbolic} disabled={symbolicState.loading}>
              {symbolicState.loading ? <Spinner size={13} /> : <Icon name="play" size={13} />} Compute ℒ&#123;f(t)&#125;
            </button>
            {symbolicState.error && (
              <p className="note-warn mt-2" role="status">
                {symbolicState.error}
              </p>
            )}
            {symbolicState.result && (
              <div className="mt-2 rounded-lg border border-line bg-surface2/40 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted">SymPy result</p>
                <p className="mt-0.5 break-all font-mono text-[12px] text-ink">{symbolicState.result}</p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {!active ? (
            <Card title="Time-domain result" icon="activity">
              <Alert tone="error" title="Transform not computed">
                {tab === 'table' ? (pairBuilt.ok ? 'This pair has no rational transform, so no numeric plot is produced.' : pairBuilt.error) : rationalAnalysis.ok ? 'Unknown error.' : rationalAnalysis.error}
              </Alert>
            </Card>
          ) : (
            <>
              <Card title="Time-domain result" subtitle="Causal inverse transform f(t), shown for t < 0 as zero" icon="activity">
                <Plot
                  traces={traces}
                  title="Inverse Laplace transform"
                  summary={`f(t) sampled from ${fmt(active.time[0])} to ${fmt(active.time[active.time.length - 1])} seconds.`}
                  containerRef={plotRef}
                  height={300}
                  xLabel="Time t (s)"
                  yLabel="f(t)"
                  vLines={[{ x: 0, label: 't = 0' }]}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Poles" value={String(active.poles.poles.length)} />
                  <Metric label="Stable" value={active.poles.stable ? 'yes' : 'no'} tone={active.poles.stable ? 'ok' : 'err'} />
                  <Metric label="Max Re{p}" value={fmt(active.poles.maxRealPart)} tone={active.poles.maxRealPart < 0 ? 'ok' : 'err'} />
                  <Metric label="Expansion error" value={active.pf.verificationError.toExponential(1)} tone="ok" />
                </div>
              </Card>

              <Card title="Partial-fraction expansion" subtitle="Each term maps to a known inverse transform" icon="table">
                <Equation display latex={'F(s) = ' + (active.termsLatex.length ? active.termsLatex.join(' + ') : '\\text{(no finite terms)}')} />
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  Using ℒ⁻¹&#123;1/(s−p)^k&#125; = t^(k−1)/(k−1)!·e^{'{'}pt{'}'}u(t). Complex conjugate residue pairs combine into real damped sinusoids.
                </p>
                <div className="mt-3">
                  <DataTable
                    caption="Poles and zeros"
                    maxHeight={220}
                    columns={[
                      { key: 'kind', header: 'Type' },
                      { key: 'value', header: 'Location' },
                      { key: 'mult', header: 'Multiplicity', align: 'right' },
                      { key: 're', header: 'Re', align: 'right' },
                      { key: 'im', header: 'Im', align: 'right' },
                    ]}
                    rows={[
                      ...active.poles.poles.map((p) => ({ kind: 'pole', value: p.value, mult: p.multiplicity, re: fmt(p.re), im: fmt(p.im) })),
                      ...active.poles.zeros.map((z) => ({ kind: 'zero', value: z.value, mult: 1, re: fmt(z.re), im: fmt(z.im) })),
                    ]}
                  />
                </div>
              </Card>

              <Card title="Region of convergence & stability" icon="info">
                <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted">
                  {active.poles.notes.map((n, i) => (
                    <li key={i} className="flex gap-2">
                      <Icon name="chevronRight" size={13} className="mt-0.5 shrink-0 text-brand" />
                      <span>{n}</span>
                    </li>
                  ))}
                  <li className="flex gap-2">
                    <Icon name="chevronRight" size={13} className="mt-0.5 shrink-0 text-brand" />
                    <span>For a right-sided (causal) signal the ROC is Re(s) &gt; σ_max, where σ_max is the largest real part among the poles. The ROC never contains a pole.</span>
                  </li>
                </ul>
                <div className="mt-3">
                  <NoteList notes={active.notes} title="Method & verification" />
                </div>
              </Card>
            </>
          )}

          <Card title="Reference: which transforms are supported" icon="book">
            <ul className="grid gap-1 text-[12px] text-muted sm:grid-cols-2">
              {LAPLACE_PAIRS.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5">
                  <Icon name="check" size={12} className="text-ok" /> {p.name}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              Non-rational transforms (containing the delay factor e<sup>−sT</sup>) are listed as reference formulas but are not factored into poles/zeros.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
