import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, Card, Metric } from '../../components/ui/layout';
import { Alert, NoteList, Spinner } from '../../components/ui/feedback';
import { NumberField, SegmentedControl, SelectField, TextAreaField, TextField } from '../../components/ui/fields';
import { DataTable } from '../../components/common/DataTable';
import { ExportMenu } from '../../components/common/ExportMenu';
import { SaveExperimentButton, usePendingConfig } from '../../components/common/SaveExperimentButton';
import { Equation } from '../../components/common/Equation';
import { Plot, usePlotTheme } from '../../components/plot/Plot';
import { Z_PAIRS, analyzeInverseZ, poleZeroDiscrete } from '../../core/ztransform';
import { parseSequence } from '../../core/validation';
import { downloadCsv } from '../../services/export';
import { useFormat } from '../../app/AppContext';
import { symbolicZ } from '../../services/api';
import { Icon } from '../../components/ui/icons';

type Tab = 'table' | 'rational';

const Z_EXAMPLES = [
  { label: 'z / (z − 0.5)  (0.5ⁿu[n])', num: '1, 0', den: '1, -0.5' },
  { label: 'z / (z² − z + 0.5)  (complex poles)', num: '1, 0, 0', den: '1, -1, 0.5' },
  { label: '1 / (z − 0.9)', num: '1', den: '1, -0.9' },
  { label: '(z² ) / (z² − 1.5z + 0.5)', num: '1, 0, 0', den: '1, -1.5, 0.5' },
  { label: 'z / (z − 1.2)  (unstable)', num: '1, 0', den: '1, -1.2' },
];

export default function ZTransformLab() {
  const pending = usePendingConfig('ztransform');
  const [tab, setTab] = useState<Tab>('table');
  const [pairId, setPairId] = useState('geometric');
  const [pairParams, setPairParams] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of Z_PAIRS) for (const q of p.params) init[`${p.id}.${q.key}`] = String(q.default);
    return init;
  });
  const [numText, setNumText] = useState('1, 0');
  const [denText, setDenText] = useState('1, -0.5');
  const [count, setCount] = useState('24');
  const [symbolicExpr, setSymbolicExpr] = useState('a**n');
  const [symbolicState, setSymbolicState] = useState<{ loading: boolean; result?: string; error?: string }>({ loading: false });
  const seqRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();
  const fmt = useFormat();

  useEffect(() => {
    if (!pending) return;
    const c = pending as Record<string, unknown>;
    if (typeof c.num === 'string') setNumText(c.num);
    if (typeof c.den === 'string') setDenText(c.den);
    if (typeof c.count === 'string') setCount(c.count);
    if (typeof c.pairId === 'string') setPairId(c.pairId);
    if (c.pairParams && typeof c.pairParams === 'object') setPairParams((p) => ({ ...p, ...(c.pairParams as Record<string, string>) }));
    if (c.tab === 'table' || c.tab === 'rational') setTab(c.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const pair = Z_PAIRS.find((p) => p.id === pairId) ?? Z_PAIRS[2];
  const pairValues = useMemo(() => {
    const vals: Record<string, number> = {};
    for (const q of pair.params) {
      const n = Number(pairParams[`${pair.id}.${q.key}`]);
      vals[q.key] = Number.isFinite(n) ? n : q.default;
    }
    return vals;
  }, [pair, pairParams]);

  const parsedNum = parseSequence(numText, 'Numerator coefficients (in z)', 40);
  const parsedDen = parseSequence(denText, 'Denominator coefficients (in z)', 40);
  const countNum = Math.round(Number(count));

  const rational = useMemo(() => {
    if (!parsedNum.ok) return { ok: false as const, error: parsedNum.error };
    if (!parsedDen.ok) return { ok: false as const, error: parsedDen.error };
    if (!Number.isFinite(countNum) || countNum < 2 || countNum > 512) return { ok: false as const, error: 'Sequence length must be between 2 and 512 samples.' };
    const r = analyzeInverseZ(parsedNum.value, parsedDen.value, countNum);
    return r.ok ? { ok: true as const, value: r.value } : { ok: false as const, error: r.error };
  }, [parsedNum, parsedDen, countNum]);

  const pairBuilt = useMemo(() => (tab === 'table' ? pair.build(pairValues) : null), [tab, pair, pairValues]);

  const analysis = tab === 'table' && pairBuilt?.ok ? (() => {
    const r = analyzeInverseZ(pairBuilt.value.num, pairBuilt.value.den, Math.min(64, Math.max(8, countNum)));
    return r.ok ? { ok: true as const, value: r.value } : { ok: false as const, error: r.error };
  })() : null;

  const active = tab === 'table' ? analysis : rational;
  const report = useMemo(
    () => (tab === 'table' ? (pairBuilt?.ok ? poleZeroDiscrete(pairBuilt.value.num, pairBuilt.value.den) : null) : rational.ok ? { ok: true as const, value: rational.value.report } : { ok: false as const, error: rational.error }),
    [tab, pairBuilt, rational],
  );
  const sequence = useMemo(() => (active?.ok ? active.value.sequence : []), [active]);
  const seqTraces = useMemo(() => {
    if (!sequence.length) return [];
    const sx: (number | null)[] = [];
    const sy: (number | null)[] = [];
    sequence.forEach((v, n) => {
      sx.push(n, n, null);
      sy.push(0, v, null);
    });
    return [
      { x: sx, y: sy, mode: 'lines' as const, name: 'stem', color: theme.palette[0], width: 1.2, extra: { hoverinfo: 'skip' } },
      { x: sequence.map((_, n) => n), y: sequence, mode: 'markers' as const, name: 'x[n]', color: theme.palette[0], extra: { marker: { size: 5 } } },
    ];
  }, [sequence, theme]);

  const planeTraces = useMemo(() => {
    if (!report?.ok) return [];
    const circleX = Array.from({ length: 181 }, (_, i) => Math.cos((i * Math.PI) / 90));
    const circleY = Array.from({ length: 181 }, (_, i) => Math.sin((i * Math.PI) / 90));
    return [
      { x: circleX, y: circleY, mode: 'lines' as const, name: '|z| = 1', color: theme.muted, width: 1.2, dash: 'dot' as const },
      { x: [0], y: [0], mode: 'markers' as const, name: 'origin', color: theme.muted, extra: { marker: { size: 3 } } },
      {
        x: report.value.poles.map((p) => p.re),
        y: report.value.poles.map((p) => p.im),
        mode: 'markers' as const,
        name: 'poles',
        color: theme.palette[5],
        extra: { marker: { size: 10, symbol: 'x' } },
      },
      {
        x: report.value.zeros.map((z) => z.re),
        y: report.value.zeros.map((z) => z.im),
        mode: 'markers' as const,
        name: 'zeros',
        color: theme.palette[2],
        extra: { marker: { size: 9, symbol: 'circle-open', line: { width: 2 } } },
      },
    ];
  }, [report, theme]);

  const baseName = tab === 'table' ? `z-pair-${pair.id}` : 'z-inverse';

  const csv = () => {
    if (!sequence.length) return;
    downloadCsv(baseName, ['n', 'x[n]'], sequence.map((v, n) => [n, v]), {
      product: 'SignalMaster Pro',
      module: 'Z-Transform Lab',
      input: tab === 'table' ? pair.name : `X(z) = (${numText}) / (${denText})`,
      direction: 'causal inverse z-transform (exact recursion)',
      poles: report?.ok ? report.value.poles.map((p) => `${p.value} (|p|=${p.magnitude.toFixed(4)})`).join(' ; ') : '',
      zeros: report?.ok ? report.value.zeros.map((z) => z.value).join(' ; ') : '',
      stability: report?.ok ? (report.value.stable ? 'stable (all poles inside unit circle)' : 'not BIBO stable') : '',
      closed_form: active?.ok ? active.value.termsLatex.join(' ; ') : '',
    });
  };

  const config = tab === 'table' ? { tab, pairId, pairParams, count } : { tab, num: numText, den: denText, count };

  const runSymbolic = async () => {
    setSymbolicState({ loading: true });
    try {
      const r = await symbolicZ(symbolicExpr, false);
      if (r.error) setSymbolicState({ loading: false, error: r.error });
      else setSymbolicState({ loading: false, result: r.result ?? '' });
    } catch (e) {
      setSymbolicState({ loading: false, error: e instanceof Error ? e.message : 'Symbolic engine unavailable.' });
    }
  };

  return (
    <div>
      <PageHeader
        title="Z-Transform Lab"
        description="Bilateral z-transforms with explicit ROC reasoning, exact causal inversion by recursion, and pole–zero geometry in the z-plane."
        icon="ztransform"
        actions={
          <>
            <SaveExperimentButton module="ztransform" config={config} defaultName="z-transform analysis" summary={tab === 'table' ? pair.name : `X(z) = (${numText})/(${denText})`} disabled={!sequence.length} />
            <ExportMenu baseName={baseName} onCsv={sequence.length ? csv : undefined} onJson={() => config} pngRef={seqRef} onPrint={() => window.print()} disabled={!sequence.length} />
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
            { value: 'rational', label: 'Rational X(z) → x[n]' },
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          {tab === 'table' ? (
            <Card title="Transform pair" icon="book">
              <div className="space-y-3">
                <SelectField label="Standard pair" value={pairId} onChange={setPairId} options={Z_PAIRS.map((p) => ({ value: p.id, label: p.name }))} />
                {pair.params.map((q) => (
                  <NumberField
                    key={q.key}
                    label={q.label}
                    value={pairParams[`${pair.id}.${q.key}`] ?? String(q.default)}
                    onChange={(v) => setPairParams((p) => ({ ...p, [`${pair.id}.${q.key}`]: v }))}
                    step={0.1}
                  />
                ))}
                <NumberField label="Samples to evaluate" value={count} onChange={setCount} step={8} min={2} max={512} />
                {pairBuilt && !pairBuilt.ok && (
                  <Alert tone="warning" title="Reference formula only">
                    {pairBuilt.error}
                  </Alert>
                )}
                <div className="rounded-lg border border-line bg-surface2/40 p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Sequence</p>
                  <Equation display latex={pair.timeLatex} />
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Transform</p>
                  <Equation display latex={pair.zLatex} />
                  <p className="mt-1.5 text-[11px] text-muted">
                    <span className="font-semibold text-ink">ROC:</span> {pair.roc}
                  </p>
                </div>
                {pair.notes && <p className="text-[11px] leading-relaxed text-muted">{pair.notes}</p>}
              </div>
            </Card>
          ) : (
            <Card title="X(z) rational function" icon="settings">
              <div className="space-y-3">
                <TextAreaField label="Numerator coefficients in z (highest power first)" value={numText} onChange={setNumText} rows={2} hint="z → 1, 0" />
                <TextAreaField label="Denominator coefficients in z (highest power first)" value={denText} onChange={setDenText} rows={2} hint="z² − z + 0.5 → 1, -1, 0.5" />
                <NumberField label="Samples to evaluate" value={count} onChange={setCount} step={8} min={2} max={512} />
                <SelectField
                  label="Load an example"
                  value=""
                  onChange={(v) => {
                    const ex = Z_EXAMPLES.find((e) => e.label === v);
                    if (ex) {
                      setNumText(ex.num);
                      setDenText(ex.den);
                    }
                  }}
                  options={[{ value: '', label: 'Choose…' }, ...Z_EXAMPLES.map((e) => ({ value: e.label, label: e.label }))]}
                />
                <Alert tone="info" title="Bilateral vs unilateral">
                  X(z) = Σ x[n]z⁻ⁿ over all n. For a causal sequence (x[n] = 0 for n &lt; 0) the unilateral transform gives the same result; the inverse computed
                  here is the causal one.
                </Alert>
              </div>
            </Card>
          )}

          <Card title="Symbolic engine (optional)" icon="external">
            <TextField label="Sequence in n" value={symbolicExpr} onChange={setSymbolicExpr} monospace placeholder="a**n" hint="Python/SymPy syntax; requires the local FastAPI service." />
            <button type="button" className="btn-secondary btn-sm mt-2" onClick={runSymbolic} disabled={symbolicState.loading}>
              {symbolicState.loading ? <Spinner size={13} /> : <Icon name="play" size={13} />} Compute Z&#123;x[n]&#125;
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
          {!sequence.length ? (
            <Card title="Inverse sequence" icon="activity">
              <Alert tone="error" title="Inverse transform not computed">
                {active && !active.ok ? active.error : 'Check the inputs.'}
              </Alert>
            </Card>
          ) : (
            <>
              <Card title="Causal inverse sequence" subtitle="Computed by exact recursion of the difference equation" icon="activity">
                <Plot
                  traces={seqTraces}
                  title="Inverse z-transform"
                  summary={`Sequence x[n] for n = 0 to ${sequence.length - 1}.`}
                  containerRef={seqRef}
                  height={260}
                  xLabel="Sample index n"
                  yLabel="x[n]"
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Poles" value={String(report?.ok ? report.value.poles.length : 0)} />
                  <Metric label="Stable" value={report?.ok ? (report.value.stable ? 'yes' : 'no') : '—'} tone={report?.ok && report.value.stable ? 'ok' : 'err'} />
                  <Metric label="max |p|" value={report?.ok ? fmt(report.value.maxMagnitude) : '—'} />
                  <Metric label="Closed-form check" value={active?.ok && active.value.crossCheckError ? active.value.crossCheckError.toExponential(1) : 'exact'} />
                </div>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Pole–zero map" subtitle="Unit circle is the stability boundary" icon="ztransform">
                  <Plot
                    traces={planeTraces}
                    title="z-plane pole-zero plot"
                    summary="Poles marked with crosses, zeros with open circles, and the unit circle shown as a dotted boundary."
                    containerRef={planeRef}
                    height={300}
                    xLabel="Re{z}"
                    yLabel="Im{z}"
                    yRange={[-1.6, 1.6]}
                  />
                </Card>
                <Card title="Poles, zeros and ROC" icon="info">
                  <DataTable
                    caption="Poles and zeros"
                    maxHeight={180}
                    columns={[
                      { key: 'kind', header: 'Type' },
                      { key: 'value', header: 'Location' },
                      { key: 'mag', header: '|·|', align: 'right' },
                    ]}
                    rows={
                      report?.ok
                        ? [
                            ...report.value.poles.map((p) => ({ kind: `pole ×${p.multiplicity}`, value: p.value, mag: fmt(p.magnitude) })),
                            ...report.value.zeros.map((z) => ({ kind: 'zero', value: z.value, mag: fmt(z.magnitude) })),
                          ]
                        : []
                    }
                  />
                  <NoteList notes={report?.ok ? report.value.notes : []} title="Stability & ROC" />
                </Card>
              </div>

              <Card title="Closed form" subtitle="Partial-fraction expression, cross-checked against the recursion" icon="table">
                {active?.ok && active.value.termsLatex.length ? (
                  <>
                    <Equation display latex={'X(z) = ' + active.value.termsLatex.join(' + ')} />
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                      Each term r·z/(z − p) inverts to r·pⁿ·u[n]. The expansion is compared with the recursion over the first samples; a mismatch would
                      suppress this panel.
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-muted">
                    No closed form is shown for this transform (repeated poles, improper fraction, or verification failed). The recursion sequence above is still
                    exact.
                  </p>
                )}
                <div className="mt-3">
                  <NoteList notes={active?.ok ? active.value.notes : []} title="Method & assumptions" />
                </div>
              </Card>

              <Card title="Sequence values" icon="table">
                <DataTable
                  caption="Inverse z-transform samples"
                  maxHeight={220}
                  columns={[
                    { key: 'n', header: 'n', align: 'right', render: (r: { n: number; x: number }) => String(r.n) },
                    { key: 'x', header: 'x[n]', align: 'right', render: (r: { n: number; x: number }) => fmt(r.x) },
                  ]}
                  rows={sequence.map((x, n) => ({ n, x }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
