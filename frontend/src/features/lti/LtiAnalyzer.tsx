import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, Card, Metric } from '../../components/ui/layout';
import { Alert, NoteList } from '../../components/ui/feedback';
import { NumberField, SegmentedControl, SelectField, TextAreaField } from '../../components/ui/fields';
import { DataTable } from '../../components/common/DataTable';
import { ExportMenu } from '../../components/common/ExportMenu';
import { SaveExperimentButton, usePendingConfig } from '../../components/common/SaveExperimentButton';
import { Equation } from '../../components/common/Equation';
import { Plot, usePlotTheme } from '../../components/plot/Plot';
import { analyzeContinuousSystem, analyzeDiscreteSystem, differenceEquationLatex, type SystemAnalysis } from '../../core/systems';
import { parseSequence } from '../../core/validation';
import { downloadCsv } from '../../services/export';
import { useFormat } from '../../app/AppContext';
import { Icon } from '../../components/ui/icons';

type Kind = 'discrete' | 'continuous';

const DISCRETE_EXAMPLES: Record<string, { b: string; a: string; note: string }> = {
  firstOrder: { b: '1', a: '1, -0.9', note: 'y[n] = 0.9y[n−1] + x[n] — stable, pole at z = 0.9.' },
  movingAverage: { b: '0.25, 0.25, 0.25, 0.25', a: '1', note: '4-point moving average (FIR, no feedback).' },
  unstable: { b: '1', a: '1, -1.2', note: 'Pole at z = 1.2 → unstable.' },
  oscillator: { b: '1, 0', a: '1, -1.414, 1', note: 'Poles on the unit circle → marginally stable (bounded oscillation).' },
  notch: { b: '1, -2, 1', a: '1, -1.6, 0.8', note: 'Zero at z = 1 blocks DC; poles inside the circle.' },
};

const CONTINUOUS_EXAMPLES: Record<string, { num: string; den: string; note: string }> = {
  secondOrder: { num: '2', den: '1, 3, 2', note: 'H(s) = 2/(s²+3s+2) — stable, DC gain 1.' },
  lowpass: { num: '1', den: '1, 1', note: 'First-order low-pass with τ = 1 s.' },
  underdamped: { num: '4', den: '1, 0.8, 4', note: 'Underdamped second-order system (complex poles).' },
  integrator: { num: '1', den: '1, 0', note: 'Integrator: pole at s = 0, marginally stable.' },
  unstable: { num: '1', den: '1, -1', note: 'Right-half-plane pole → unstable.' },
};

export default function LtiAnalyzer() {
  const pending = usePendingConfig('systems');
  const [kind, setKind] = useState<Kind>('discrete');
  const [bText, setBText] = useState('1');
  const [aText, setAText] = useState('1, -0.9');
  const [numText, setNumText] = useState('2');
  const [denText, setDenText] = useState('1, 3, 2');
  const [samples, setSamples] = useState('60');
  const [tMax, setTMax] = useState('10');
  const impulseRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const freqRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();
  const fmt = useFormat();

  useEffect(() => {
    if (!pending) return;
    const c = pending as Record<string, unknown>;
    if (c.kind === 'discrete' || c.kind === 'continuous') setKind(c.kind);
    if (typeof c.b === 'string') setBText(c.b);
    if (typeof c.a === 'string') setAText(c.a);
    if (typeof c.num === 'string') setNumText(c.num);
    if (typeof c.den === 'string') setDenText(c.den);
    if (typeof c.samples === 'string') setSamples(c.samples);
    if (typeof c.tMax === 'string') setTMax(c.tMax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const parsedB = parseSequence(bText, 'b coefficients', 60);
  const parsedA = parseSequence(aText, 'a coefficients', 60);
  const parsedNum = parseSequence(numText, 'Numerator coefficients', 40);
  const parsedDen = parseSequence(denText, 'Denominator coefficients', 40);
  const samplesNum = Math.round(Number(samples));
  const tMaxNum = Number(tMax);

  const analysis = useMemo<{ ok: true; value: SystemAnalysis } | { ok: false; error: string }>(() => {
    if (kind === 'discrete') {
      if (!parsedB.ok) return { ok: false, error: parsedB.error };
      if (!parsedA.ok) return { ok: false, error: parsedA.error };
      if (!Number.isFinite(samplesNum) || samplesNum < 5 || samplesNum > 2048) return { ok: false, error: 'Samples must be between 5 and 2048.' };
      const r = analyzeDiscreteSystem({ b: parsedB.value, a: parsedA.value }, samplesNum);
      return r.ok ? r : { ok: false, error: r.error };
    }
    if (!parsedNum.ok) return { ok: false, error: parsedNum.error };
    if (!parsedDen.ok) return { ok: false, error: parsedDen.error };
    if (!Number.isFinite(tMaxNum) || tMaxNum <= 0 || tMaxNum > 500) return { ok: false, error: 'The time window must be between 0 and 500 s.' };
    const r = analyzeContinuousSystem({ num: parsedNum.value, den: parsedDen.value }, tMaxNum, 801);
    return r.ok ? r : { ok: false, error: r.error };
  }, [kind, parsedB, parsedA, parsedNum, parsedDen, samplesNum, tMaxNum]);

  const sys = analysis.ok ? analysis.value : null;

  const impulseTraces = useMemo(
    () => (sys ? [{ x: sys.timeAxis, y: sys.impulse, mode: (sys.kind === 'discrete' ? 'markers' : 'lines') as 'markers' | 'lines', name: sys.kind === 'discrete' ? 'h[n]' : 'h(t)', color: theme.palette[0], width: 1.8 }] : []),
    [sys, theme],
  );
  const stepTraces = useMemo(
    () => (sys ? [{ x: sys.timeAxis, y: sys.step, mode: (sys.kind === 'discrete' ? 'markers' : 'lines') as 'markers' | 'lines', name: sys.kind === 'discrete' ? 's[n]' : 's(t)', color: theme.palette[3], width: 1.8 }] : []),
    [sys, theme],
  );
  const freqTraces = useMemo(
    () =>
      sys
        ? [
            { x: sys.freqAxis, y: sys.magnitudeDb, mode: 'lines' as const, name: '|H| (dB)', color: theme.palette[2], width: 1.8 },
            { x: sys.freqAxis, y: sys.phaseDeg.map((p) => p), mode: 'lines' as const, name: '∠H (°)', color: theme.palette[4], width: 1.4, yaxis: 'y2' as const },
          ]
        : [],
    [sys, theme],
  );

  const planeTraces = useMemo(() => {
    if (!sys) return [];
    const isDiscrete = sys.kind === 'discrete';
    const circleX = Array.from({ length: 181 }, (_, i) => Math.cos((i * Math.PI) / 90));
    const circleY = Array.from({ length: 181 }, (_, i) => Math.sin((i * Math.PI) / 90));
    return [
      ...(isDiscrete ? [{ x: circleX, y: circleY, mode: 'lines' as const, name: '|z| = 1', color: theme.muted, width: 1.1, dash: 'dot' as const }] : []),
      { x: sys.poles.map((p) => p.re), y: sys.poles.map((p) => p.im), mode: 'markers' as const, name: 'poles', color: theme.palette[5], extra: { marker: { size: 10, symbol: 'x' } } },
      { x: sys.zeros.map((z) => z.re), y: sys.zeros.map((z) => z.im), mode: 'markers' as const, name: 'zeros', color: theme.palette[2], extra: { marker: { size: 9, symbol: 'circle-open', line: { width: 2 } } } },
    ];
  }, [sys, theme]);

  const config = kind === 'discrete' ? { kind, b: bText, a: aText, samples } : { kind, num: numText, den: denText, tMax };
  const baseName = `lti-${kind}`;

  const csv = () => {
    if (!sys) return;
    downloadCsv(baseName, [sys.kind === 'discrete' ? 'n' : 't_s', 'impulse_response', 'step_response'], sys.timeAxis.map((t, i) => [t, sys.impulse[i], sys.step[i]]), {
      product: 'SignalMaster Pro',
      module: 'LTI System Analyzer',
      model: sys.kind === 'discrete' ? `difference equation: ${differenceEquationLatex(parsedB.ok ? parsedB.value : [], parsedA.ok ? parsedA.value : [])}` : `H(s) = (${numText})/(${denText})`,
      stable: sys.stable ? 'yes (BIBO)' : 'no',
      stability_detail: sys.stableDetail,
      poles: sys.poles.map((p) => p.value).join(' ; '),
      zeros: sys.zeros.map((z) => z.value).join(' ; '),
      notes: sys.notes.join(' | '),
    });
  };

  const freqCsv = () => {
    if (!sys) return;
    downloadCsv(`${baseName}-frequency-response`, ['omega_rad', 'magnitude_db', 'phase_deg'], sys.freqAxis.map((w, i) => [w, sys.magnitudeDb[i], sys.phaseDeg[i]]), {
      product: 'SignalMaster Pro',
      module: 'LTI System Analyzer',
      omega_units: sys.kind === 'discrete' ? 'rad/sample' : 'rad/s',
      note: 'Magnitude in dB (20·log10|H|); phase in degrees, principal value.',
    });
  };

  return (
    <div>
      <PageHeader
        title="LTI System Analyzer"
        description="Impulse and step responses, frequency response, pole–zero geometry and BIBO stability for difference equations and rational transfer functions."
        icon="system"
        actions={
          <>
            <SaveExperimentButton module="systems" config={config} defaultName={`${kind} LTI system`} summary={kind === 'discrete' ? `b = ${bText}; a = ${aText}` : `H(s) = (${numText})/(${denText})`} disabled={!sys} />
            <ExportMenu baseName={baseName} onCsv={sys ? csv : undefined} onJson={() => config} pngRef={impulseRef} onPrint={() => window.print()} disabled={!sys} />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="System model" icon="settings">
            <div className="space-y-3">
              <SegmentedControl
                label="Model type"
                value={kind}
                onChange={(v) => setKind(v)}
                options={[
                  { value: 'discrete', label: 'Difference equation' },
                  { value: 'continuous', label: 'Transfer function H(s)' },
                ]}
              />
              {kind === 'discrete' ? (
                <>
                  <TextAreaField label="Numerator b (x coefficients)" value={bText} onChange={setBText} rows={2} hint="y[n] uses b₀x[n] + b₁x[n−1] + …" />
                  <TextAreaField label="Denominator a (y coefficients)" value={aText} onChange={setAText} rows={2} hint="a₀ ≠ 0, e.g. 1, -0.9 → y[n] − 0.9y[n−1]" />
                  <NumberField label="Response length" value={samples} onChange={setSamples} step={10} min={5} max={2048} suffix="smp" />
                  <SelectField
                    label="Load an example"
                    value=""
                    onChange={(v) => {
                      const ex = DISCRETE_EXAMPLES[v];
                      if (ex) {
                        setBText(ex.b);
                        setAText(ex.a);
                      }
                    }}
                    options={[{ value: '', label: 'Choose…' }, ...Object.entries(DISCRETE_EXAMPLES).map(([k, v]) => ({ value: k, label: v.note }))]}
                  />
                </>
              ) : (
                <>
                  <TextAreaField label="Numerator B(s) (highest power first)" value={numText} onChange={setNumText} rows={2} />
                  <TextAreaField label="Denominator A(s) (highest power first)" value={denText} onChange={setDenText} rows={2} />
                  <NumberField label="Time window" value={tMax} onChange={setTMax} step={1} suffix="s" min={0.1} max={500} />
                  <SelectField
                    label="Load an example"
                    value=""
                    onChange={(v) => {
                      const ex = CONTINUOUS_EXAMPLES[v];
                      if (ex) {
                        setNumText(ex.num);
                        setDenText(ex.den);
                      }
                    }}
                    options={[{ value: '', label: 'Choose…' }, ...Object.entries(CONTINUOUS_EXAMPLES).map(([k, v]) => ({ value: k, label: v.note }))]}
                  />
                </>
              )}
              <Alert tone="info" title="What this tool can and cannot classify">
                Linearity and time invariance are assumed by the LTI model class, not deduced from data. BIBO stability, causality and invertibility are
                statements about this model under the stated initial conditions and ROC — arbitrary or black-box systems are out of scope.
              </Alert>
            </div>
          </Card>

          {sys && (
            <Card title="Transfer function" icon="book">
              <Equation display latex={sys.transferLatex} />
              {sys.kind === 'discrete' && parsedB.ok && parsedA.ok && (
                <>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">Difference equation (zero initial conditions)</p>
                  <Equation display latex={differenceEquationLatex(parsedB.value, parsedA.value)} />
                </>
              )}
              <p className="mt-1.5 text-[11px] text-muted">
                {sys.kind === 'discrete' ? 'Evaluated on the unit circle as H(e^{jω}) for 0 ≤ ω ≤ π.' : 'Evaluated along the imaginary axis as H(jω).'}
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {!sys ? (
            <Card title="System response" icon="activity">
              <Alert tone="error" title="Analysis not available">
                {!analysis.ok ? analysis.error : 'Check the inputs.'}
              </Alert>
            </Card>
          ) : (
            <>
              <Card title="Stability & key metrics" icon="info">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="BIBO stable" value={sys.stable ? 'yes' : 'no'} tone={sys.stable ? 'ok' : 'err'} />
                  <Metric label="Poles" value={String(sys.poles.length)} />
                  <Metric label="Zeros" value={String(sys.zeros.length)} />
                  <Metric label="DC gain" value={fmt(sys.step[sys.step.length - 1])} />
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">{sys.stableDetail}</p>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card
                  title="Impulse response"
                  subtitle={sys.kind === 'discrete' ? 'h[n] by exact recursion' : 'h(t) from the partial-fraction expansion'}
                  icon="activity"
                >
                  <Plot
                    traces={impulseTraces}
                    title="Impulse response"
                    summary={`Impulse response over ${sys.timeAxis.length} points. Peak magnitude ${fmt(Math.max(...sys.impulse.map(Math.abs)))}.`}
                    containerRef={impulseRef}
                    height={260}
                    xLabel={sys.kind === 'discrete' ? 'n' : 'Time t (s)'}
                    yLabel={sys.kind === 'discrete' ? 'h[n]' : 'h(t)'}
                  />
                </Card>
                <Card title="Step response" subtitle="Driven by a unit step input" icon="activity">
                  <Plot
                    traces={stepTraces}
                    title="Step response"
                    summary={`Step response over ${sys.timeAxis.length} points; final value approximates the DC gain.`}
                    containerRef={stepRef}
                    height={260}
                    xLabel={sys.kind === 'discrete' ? 'n' : 'Time t (s)'}
                    yLabel={sys.kind === 'discrete' ? 's[n]' : 's(t)'}
                  />
                </Card>
              </div>

              <Card
                title="Frequency response"
                subtitle={sys.kind === 'discrete' ? 'Magnitude (dB) and phase versus ω (rad/sample)' : 'Magnitude (dB) and phase versus ω (rad/s)'}
                icon="fourier"
                actions={
                  <button type="button" className="btn-secondary btn-sm" onClick={freqCsv}>
                    <Icon name="download" size={13} /> CSV
                  </button>
                }
              >
                <Plot
                  traces={freqTraces}
                  title="Frequency response"
                  summary="Magnitude in decibels on the left axis and phase in degrees on the right axis."
                  containerRef={freqRef}
                  height={300}
                  xLabel={sys.kind === 'discrete' ? 'ω (rad/sample)' : 'ω (rad/s)'}
                  yLabel="|H| (dB)"
                  y2Label="∠H (°)"
                />
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Pole–zero map" icon="system">
                  <Plot
                    traces={planeTraces}
                    title="Pole-zero plot"
                    summary={sys.kind === 'discrete' ? 'Poles and zeros in the z-plane with the unit circle.' : 'Poles and zeros in the s-plane; the imaginary axis is the stability boundary.'}
                    height={300}
                    xLabel={sys.kind === 'discrete' ? 'Re{z}' : 'Re{s}'}
                    yLabel={sys.kind === 'discrete' ? 'Im{z}' : 'Im{s}'}
                  />
                </Card>
                <Card title="System properties" icon="table">
                  <div className="space-y-1.5">
                    {sys.properties.map((p) => (
                      <div key={p.label} className="rounded-lg border border-line bg-surface2/40 px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-ink">{p.label}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              p.verdict === 'yes'
                                ? 'bg-ok/15 text-ok'
                                : p.verdict === 'no'
                                  ? 'bg-err/15 text-err'
                                  : p.verdict === 'conditional'
                                    ? 'bg-warn/15 text-warn'
                                    : 'bg-surface2 text-muted'
                            }`}
                          >
                            {p.verdict}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted">{p.detail}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card title="Poles and zeros" icon="table">
                <DataTable
                  caption="Pole and zero locations"
                  maxHeight={200}
                  columns={[
                    { key: 'kind', header: 'Type' },
                    { key: 'value', header: 'Location' },
                    { key: 'mag', header: 'Magnitude', align: 'right' },
                    { key: 're', header: 'Re', align: 'right' },
                    { key: 'im', header: 'Im', align: 'right' },
                  ]}
                  rows={[
                    ...sys.poles.map((p) => ({ kind: `pole ×${p.multiplicity}`, value: p.value, mag: fmt(p.magnitude), re: fmt(p.re), im: fmt(p.im) })),
                    ...sys.zeros.map((z) => ({ kind: 'zero', value: z.value, mag: fmt(z.magnitude), re: fmt(z.re), im: fmt(z.im) })),
                  ]}
                />
                <div className="mt-2">
                  <NoteList notes={sys.notes} title="Model assumptions" />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
