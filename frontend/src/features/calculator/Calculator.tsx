import { useMemo, useState } from 'react';
import { PageHeader, Card, Metric } from '../../components/ui/layout';
import { Alert, useToast } from '../../components/ui/feedback';
import { NumberField, SelectField, TextAreaField } from '../../components/ui/fields';
import { Equation } from '../../components/common/Equation';
import { DataTable } from '../../components/common/DataTable';
import { ExportMenu } from '../../components/common/ExportMenu';
import { SaveExperimentButton } from '../../components/common/SaveExperimentButton';
import { collectVariables, parseExpression, evaluateNode, stringify, ExprError, FUNCTIONS, CONSTANTS } from '../../core/expr';
import { copyText, downloadCsv } from '../../services/export';
import { useSettings } from '../../app/AppContext';
import { Icon } from '../../components/ui/icons';

interface Preset {
  id: string;
  label: string;
  latex: string;
  expr: string;
  unit: string;
  vars: { name: string; label: string; value: string; unit: string }[];
  explanation: string;
}

const PRESETS: Preset[] = [
  {
    id: 'db-power',
    label: 'Power ratio in decibels',
    latex: 'P_{\\mathrm{dB}} = 10\\log_{10}\\!\\left(\\frac{P_2}{P_1}\\right)',
    expr: '10*log10(P2/P1)',
    unit: 'dB',
    vars: [
      { name: 'P1', label: 'Reference power P₁', value: '1', unit: 'W' },
      { name: 'P2', label: 'Measured power P₂', value: '100', unit: 'W' },
    ],
    explanation: 'A 10:1 power ratio is 10 dB. Voltage ratios use 20·log₁₀.|V₂/V₁| because power ∝ V².',
  },
  {
    id: 'db-amp',
    label: 'Amplitude (voltage) ratio in decibels',
    latex: 'A_{\\mathrm{dB}} = 20\\log_{10}\\!\\left(\\frac{V_2}{V_1}\\right)',
    expr: '20*log10(V2/V1)',
    unit: 'dB',
    vars: [
      { name: 'V1', label: 'Reference amplitude V₁', value: '1', unit: 'V' },
      { name: 'V2', label: 'Measured amplitude V₂', value: '2', unit: 'V' },
    ],
    explanation: 'Doubling an amplitude is ≈ 6.02 dB.',
  },
  {
    id: 'sine-rms',
    label: 'RMS of a sinusoid',
    latex: 'V_{\\mathrm{rms}} = \\frac{A}{\\sqrt{2}}',
    expr: 'A/sqrt(2)',
    unit: 'V',
    vars: [{ name: 'A', label: 'Peak amplitude A', value: '230', unit: 'V' }],
    explanation: 'For a pure sinusoid the RMS value is the peak divided by √2. A 230 V mains peak corresponds to ≈162.6 V RMS.',
  },
  {
    id: 'nyquist',
    label: 'Nyquist frequency',
    latex: 'f_{\\mathrm{Nyquist}} = \\frac{f_s}{2}',
    expr: 'fs/2',
    unit: 'Hz',
    vars: [{ name: 'fs', label: 'Sampling rate f_s', value: '44100', unit: 'Hz' }],
    explanation: 'Frequencies above f_s/2 cannot be represented and fold back (alias) into the band.',
  },
  {
    id: 'dft-resolution',
    label: 'DFT frequency resolution',
    latex: '\\Delta f = \\frac{f_s}{N}',
    expr: 'fs/N',
    unit: 'Hz',
    vars: [
      { name: 'fs', label: 'Sampling rate f_s', value: '1000', unit: 'Hz' },
      { name: 'N', label: 'Number of samples N', value: '500', unit: 'samples' },
    ],
    explanation: 'Resolution is set by the observation time T = N/f_s: Δf = 1/T.',
  },
  {
    id: 'observe-time',
    label: 'Required observation time for a resolution',
    latex: 'T = \\frac{1}{\\Delta f}',
    expr: '1/df',
    unit: 's',
    vars: [{ name: 'df', label: 'Desired resolution Δf', value: '0.5', unit: 'Hz' }],
    explanation: 'To resolve components 0.5 Hz apart you must observe the signal for at least 2 s.',
  },
  {
    id: 'rc-cutoff',
    label: 'RC low-pass cutoff frequency',
    latex: 'f_c = \\frac{1}{2\\pi RC}',
    expr: '1/(2*pi*R*C)',
    unit: 'Hz',
    vars: [
      { name: 'R', label: 'Resistance R', value: '1000', unit: 'Ω' },
      { name: 'C', label: 'Capacitance C', value: '1e-6', unit: 'F' },
    ],
    explanation: 'A 1 kΩ resistor with a 1 µF capacitor gives a 159 Hz cutoff.',
  },
  {
    id: 'time-constant',
    label: 'First-order time constant from a pole',
    latex: '\\tau = \\frac{1}{|p|},\\quad p = -\\sigma',
    expr: '1/abs(p)',
    unit: 's',
    vars: [{ name: 'p', label: 'Pole location p', value: '-4', unit: 'rad/s' }],
    explanation: 'The response reaches 63.2 % of its final value after one time constant τ = 1/σ.',
  },
  {
    id: 'conv-length',
    label: 'Linear convolution output length',
    latex: 'L_y = N + M - 1',
    expr: 'N + M - 1',
    unit: 'samples',
    vars: [
      { name: 'N', label: 'Length of x[n]', value: '3', unit: 'samples' },
      { name: 'M', label: 'Length of h[n]', value: '2', unit: 'samples' },
    ],
    explanation: 'Two finite sequences of lengths N and M produce N + M − 1 output samples.',
  },
  {
    id: 'snr',
    label: 'SNR from a noise power ratio',
    latex: '\\mathrm{SNR_{dB}} = 10\\log_{10}\\!\\left(\\frac{P_s}{P_n}\\right)',
    expr: '10*log10(Ps/Pn)',
    unit: 'dB',
    vars: [
      { name: 'Ps', label: 'Signal power P_s', value: '1', unit: 'W' },
      { name: 'Pn', label: 'Noise power P_n', value: '0.001', unit: 'W' },
    ],
    explanation: 'A signal 1000× stronger than the noise has an SNR of 30 dB.',
  },
  {
    id: 'energy',
    label: 'Energy of a sampled sequence',
    latex: 'E = \\sum_n |x[n]|^2',
    expr: '1^2 + 2^2 + 3^2',
    unit: 'units²',
    vars: [],
    explanation: 'Discrete-time energy is the sum of squared samples — here 1 + 4 + 9 = 14.',
  },
  {
    id: 'aliasing',
    label: 'Aliased frequency of an over-Nyquist tone',
    latex: 'f_{\\mathrm{alias}} = |f - f_s \\cdot \\mathrm{round}(f/f_s)|',
    expr: 'abs(f - fs*round(f/fs))',
    unit: 'Hz',
    vars: [
      { name: 'f', label: 'Input frequency f', value: '1200', unit: 'Hz' },
      { name: 'fs', label: 'Sampling rate f_s', value: '1000', unit: 'Hz' },
    ],
    explanation: 'With f_s = 1000 Hz, a 1200 Hz tone appears at 200 Hz — the folded image.',
  },
];

/** Best rational approximation with a bounded denominator (continued fractions). */
function rationalApprox(x: number, maxDen = 100000): { p: number; q: number } | null {
  if (!Number.isFinite(x) || Math.abs(x) > 1e9) return null;
  let a = x;
  let h1 = 1;
  let h0 = 0;
  let k1 = 0;
  let k0 = 1;
  for (let i = 0; i < 40; i++) {
    const ai = Math.floor(a);
    const h2 = ai * h1 + h0;
    const k2 = ai * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1;
    h1 = h2;
    k0 = k1;
    k1 = k2;
    const frac = a - ai;
    if (Math.abs(frac) < 1e-12) break;
    a = 1 / frac;
  }
  if (k1 === 0) return null;
  return { p: h1, q: k1 };
}

export default function Calculator() {
  const [expr, setExpr] = useState('10*log10(P2/P1)');
  const [presetId, setPresetId] = useState('db-power');
  const [varValues, setVarValues] = useState<Record<string, string>>(() => {
    const preset = PRESETS[0];
    const init: Record<string, string> = {};
    for (const v of preset.vars) init[v.name] = v.value;
    return init;
  });
  const [activePreset, setActivePreset] = useState<Preset | null>(PRESETS[0]);
  const { settings } = useSettings();
  const toast = useToast();

  const variables = useMemo(() => {
    try {
      return Array.from(collectVariables(parseExpression(expr))).sort();
    } catch {
      return [];
    }
  }, [expr]);

  const evaluation = useMemo(() => {
    try {
      const ast = parseExpression(expr);
      const scope: Record<string, number> = {};
      const substituted: string[] = [];
      for (const name of collectVariables(ast)) {
        const raw = varValues[name];
        if (raw === undefined || raw.trim() === '') {
          return { ok: false as const, error: `Variable “${name}” needs a numeric value.` };
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) return { ok: false as const, error: `Variable “${name}” must be a number (got “${raw}”).` };
        scope[name] = n;
        substituted.push(`${name} = ${n}`);
      }
      const value = evaluateNode(ast, scope);
      return { ok: true as const, value, ast, scope, substituted };
    } catch (e) {
      return { ok: false as const, error: e instanceof ExprError ? e.message : e instanceof Error ? e.message : 'Invalid expression.' };
    }
  }, [expr, varValues]);

  const resultDigits = settings.precision;
  const formatValue = (v: number) => {
    if (!Number.isFinite(v)) return 'undefined';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    const rounded = Number(v.toFixed(resultDigits));
    return String(Object.is(rounded, -0.0) ? 0 : rounded);
  };

  const exactInfo = useMemo(() => {
    if (!evaluation.ok) return null;
    const v = evaluation.value;
    if (Number.isInteger(v)) return { kind: 'exact', text: `Exact integer: ${v}` };
    const frac = rationalApprox(v);
    if (frac && frac.q !== 1 && Math.abs(frac.p / frac.q - v) < 1e-12) {
      return { kind: 'rational', text: `Exact rational: ${frac.p}/${frac.q}` };
    }
    if (frac && frac.q !== 1 && Math.abs(frac.p / frac.q - v) < 1e-9 * Math.max(1, Math.abs(v))) {
      return { kind: 'rational-approx', text: `≈ ${frac.p}/${frac.q} (best rational approximation, denominator ≤ 100000)` };
    }
    return { kind: 'approx', text: 'Approximate (floating-point result; transcendental or irrational value)' };
  }, [evaluation]);

  const loadPreset = (id: string) => {
    setPresetId(id);
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setExpr(p.expr);
    const vals: Record<string, string> = {};
    for (const v of p.vars) vals[v.name] = v.value;
    setVarValues(vals);
    setActivePreset(p);
  };

  const baseName = 'calculator-result';

  const copy = () => {
    if (!evaluation.ok) return '';
    return `${expr}\n${evaluation.substituted.join('; ')}\n= ${evaluation.value}${activePreset ? ` ${activePreset.unit}` : ''}`;
  };

  return (
    <div>
      <PageHeader
        title="Engineering Calculator"
        description="Evaluate expressions with a fixed, documented function set. No arbitrary code execution, explicit errors, and a clear exact/approximate distinction."
        icon="calculator"
        actions={
          <>
            <SaveExperimentButton module="calculator" config={{ expr, varValues, presetId }} defaultName="calculator expression" summary={expr} />
            <ExportMenu
              baseName={baseName}
              onCsv={
                evaluation.ok
                  ? () =>
                      downloadCsv(
                        baseName,
                        ['expression', 'value', 'variables', 'exactness'],
                        [[expr, evaluation.value, evaluation.substituted.join('; '), exactInfo?.text ?? '']],
                        { product: 'SignalMaster Pro', module: 'Engineering Calculator', unit: activePreset?.unit ?? 'dimensionless' },
                      )
                  : undefined
              }
              onJson={() => ({ expr, varValues, result: evaluation.ok ? evaluation.value : null })}
              copyContent={evaluation.ok ? copy : undefined}
              onPrint={() => window.print()}
            />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card title="Expression" icon="calculator">
            <div className="space-y-3">
              <TextAreaField
                label="Mathematical expression"
                value={expr}
                onChange={(v) => {
                  setExpr(v);
                  setActivePreset(null);
                }}
                rows={3}
                placeholder="10*log10(P2/P1)"
                hint="Operators: + − * / ^ % !  ·  Constants: pi, tau, e, phi  ·  Functions: sin cos tan exp ln log log2 sqrt abs sinc u min max atan2 deg rad db …"
              />
              {activePreset && (
                <div className="rounded-lg border border-line bg-surface2/40 px-3 py-2">
                  <Equation display latex={activePreset.latex} />
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{activePreset.explanation}</p>
                </div>
              )}
              {variables.length > 0 && (
                <div>
                  <p className="label">Variables detected in the expression</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {variables.map((name) => {
                      const pv = activePreset?.vars.find((v) => v.name === name);
                      return (
                        <NumberField
                          key={name}
                          label={`${name}${pv ? ` — ${pv.label}` : ''}`}
                          value={varValues[name] ?? ''}
                          onChange={(v) => setVarValues((s) => ({ ...s, [name]: v }))}
                          step={0.1}
                          suffix={pv?.unit}
                          placeholder="value"
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              {variables.length === 0 && <p className="hint">This expression has no variables — it is a pure constant computation.</p>}
            </div>
          </Card>

          <Card title="Result" icon="activity">
            {!evaluation.ok ? (
              <Alert tone="error" title="Cannot evaluate">
                {evaluation.error}
              </Alert>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3 rounded-[4px] border border-line bg-surface2/50 px-3 py-2.5">
                  <span className="font-mono text-2xl font-semibold tracking-tight text-ink">
                    {formatValue(evaluation.value)}
                    {activePreset && <span className="ml-1.5 text-sm font-normal text-muted">{activePreset.unit}</span>}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <button type="button" className="btn-secondary btn-sm" onClick={() => copyText(copy()).then(() => toast.push('Result copied.')).catch(() => toast.push('Copy failed.', 'error'))}>
                      <Icon name="copy" size={13} /> Copy
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        downloadCsv(baseName, ['expression', 'value'], [[expr, evaluation.value]], { evaluated_at: new Date().toISOString() });
                        toast.push('CSV downloaded.');
                      }}
                    >
                      <Icon name="download" size={13} /> CSV
                    </button>
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Full precision" value={evaluation.value.toPrecision(Math.max(6, resultDigits + 4))} />
                  <Metric label="|Result|" value={formatValue(Math.abs(evaluation.value))} />
                  <Metric label="Sign" value={evaluation.value > 0 ? 'positive' : evaluation.value < 0 ? 'negative' : 'zero'} />
                  <Metric label="Exactness" value={exactInfo?.kind === 'exact' ? 'exact' : exactInfo?.kind === 'rational' ? 'rational' : 'approximate'} tone={exactInfo?.kind === 'approx' ? 'warn' : 'ok'} />
                </div>

                <div className="mt-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Step by step</p>
                  <DataTable
                    caption="Evaluation steps"
                    maxHeight={220}
                    columns={[
                      { key: 'step', header: 'Step' },
                      { key: 'value', header: 'Value' },
                    ]}
                    rows={[
                      { step: '1. Parse expression', value: stringify(evaluation.ast) },
                      ...(evaluation.substituted.length ? [{ step: '2. Substitute variables', value: evaluation.substituted.join(', ') }] : []),
                      { step: '3. Evaluate', value: formatValue(evaluation.value) },
                      { step: '4. Precision', value: exactInfo?.text ?? '' },
                    ]}
                  />
                </div>
              </>
            )}
          </Card>

          <Card title="Function reference" icon="book">
            <div className="grid gap-1 sm:grid-cols-2">
              {Object.entries(FUNCTIONS).map(([name, fn]) => (
                <div key={name} className="flex items-start gap-2 rounded border border-line/60 px-2 py-1">
                  <code className="shrink-0 text-[11.5px] font-semibold text-brand">{name}</code>
                  <span className="text-[11px] leading-snug text-muted">{fn.doc}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Constants: {Object.keys(CONSTANTS).join(', ')}. Anything outside this grammar is rejected with a positioned error message; nothing is passed to
              JavaScript’s <code>eval</code>.
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Signal-processing presets" icon="layers">
            <SelectField label="Load a preset" value={presetId} onChange={loadPreset} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
            <ul className="mt-2 space-y-1">
              {PRESETS.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => loadPreset(p.id)}
                    className={`w-full rounded-[4px] border-l-2 py-1 pl-2 pr-1.5 text-left text-[11.5px] transition-colors ${
                      presetId === p.id
                        ? 'border-l-brand bg-surface2/70 font-medium text-ink'
                        : 'border-l-transparent text-muted hover:border-l-line-strong hover:bg-surface2/50 hover:text-ink'
                    }`}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Notes on accuracy" icon="info">
            <ul className="space-y-1.5 text-[11.5px] leading-relaxed text-muted">
              <li>• Results use IEEE-754 double precision (≈15–17 significant digits).</li>
              <li>• “Exact” means the value is an integer or a small rational number — not that floating-point error is zero.</li>
              <li>• Trigonometric results near zeros of sin/cos can lose precision; compare with the analytic value when it matters.</li>
              <li>• The calculator performs no symbolic algebra, integration or solving. Use the transform labs for that.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
