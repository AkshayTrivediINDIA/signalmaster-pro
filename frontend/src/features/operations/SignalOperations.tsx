import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, Card, Metric } from '../../components/ui/layout';
import { Alert, NoteList } from '../../components/ui/feedback';
import { NumberField, SelectField, SegmentedControl } from '../../components/ui/fields';
import { DataTable } from '../../components/common/DataTable';
import { ExportMenu } from '../../components/common/ExportMenu';
import { SaveExperimentButton, usePendingConfig } from '../../components/common/SaveExperimentButton';
import { Equation } from '../../components/common/Equation';
import { Plot, usePlotTheme } from '../../components/plot/Plot';
import { SignalControls, useSignalBuilder, EXAMPLE_STATES } from '../signals/builder';
import { applyBinary, applyUnary, type BinaryOp, type SupportPolicy, type UnaryOp } from '../../core/operations';
import type { Signal, SignalParams, TimeSpec } from '../../core/signals';
import { downloadCsv } from '../../services/export';
import { useFormat } from '../../app/AppContext';
import { Icon } from '../../components/ui/icons';

type Mode = 'binary' | 'unary';

const BINARY_OPS: { value: BinaryOp; label: string }[] = [
  { value: 'add', label: 'Addition — x₁ + x₂' },
  { value: 'subtract', label: 'Subtraction — x₁ − x₂' },
  { value: 'multiply', label: 'Multiplication — x₁ · x₂' },
  { value: 'compare', label: 'Comparison — difference & metrics' },
];

const UNARY_OPS: { value: UnaryOp; label: string }[] = [
  { value: 'amplitudeScale', label: 'Amplitude scaling — k·x' },
  { value: 'timeShift', label: 'Time shift — x(t − t₀) / x[n − k]' },
  { value: 'timeReverse', label: 'Time reversal / folding — x(−t) / x[−n]' },
  { value: 'timeScale', label: 'Time scaling — x(at) (continuous only)' },
];

export default function SignalOperations() {
  const a = useSignalBuilder(EXAMPLE_STATES.sine5Hz);
  const b = useSignalBuilder({
    params: { ...EXAMPLE_STATES.sine5Hz.params, amplitude: 0.5, frequency: 5, phase: Math.PI / 2 },
    spec: { ...EXAMPLE_STATES.sine5Hz.spec },
  });
  const pending = usePendingConfig('operations');
  const [mode, setMode] = useState<Mode>('binary');
  const [binaryOp, setBinaryOp] = useState<BinaryOp>('add');
  const [unaryOp, setUnaryOp] = useState<UnaryOp>('amplitudeScale');
  const [support, setSupport] = useState<SupportPolicy>('zero');
  const [factor, setFactor] = useState('2');
  const [shiftAmount, setShiftAmount] = useState('0.2');
  const [scaleFactor, setScaleFactor] = useState('2');
  const [activeOperand, setActiveOperand] = useState<'a' | 'b'>('a');
  const plotRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();
  const fmt = useFormat();

  useEffect(() => {
    if (!pending) return;
    const cfg = pending as {
      a?: { params: SignalParams; spec: TimeSpec };
      b?: { params: SignalParams; spec: TimeSpec };
      mode?: Mode;
      binaryOp?: BinaryOp;
      unaryOp?: UnaryOp;
      support?: SupportPolicy;
      factor?: string;
      shiftAmount?: string;
      scaleFactor?: string;
    };
    if (cfg.a) a.load(cfg.a);
    if (cfg.b) b.load(cfg.b);
    if (cfg.mode) setMode(cfg.mode);
    if (cfg.binaryOp) setBinaryOp(cfg.binaryOp);
    if (cfg.unaryOp) setUnaryOp(cfg.unaryOp);
    if (cfg.support) setSupport(cfg.support);
    if (cfg.factor !== undefined) setFactor(cfg.factor);
    if (cfg.shiftAmount !== undefined) setShiftAmount(cfg.shiftAmount);
    if (cfg.scaleFactor !== undefined) setScaleFactor(cfg.scaleFactor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Keep both operands in the same domain: the domain control drives both builders.
  const domain = a.spec.domain;
  useEffect(() => {
    if (b.spec.domain !== domain) b.setSpecField('domain', domain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  const result = useMemo(() => {
    if (!a.signal) return { ok: false as const, error: a.error ?? 'Signal 1 is invalid.' };
    if (mode === 'binary') {
      if (!b.signal) return { ok: false as const, error: b.error ?? 'Signal 2 is invalid.' };
      return applyBinary(binaryOp, a.signal, b.signal, { support });
    }
    const options =
      unaryOp === 'amplitudeScale'
        ? { factor: Number(factor) }
        : unaryOp === 'timeShift'
          ? { shift: Number(shiftAmount) }
          : unaryOp === 'timeScale'
            ? { scale: Number(scaleFactor) }
            : {};
    if (unaryOp === 'amplitudeScale' && !Number.isFinite(Number(factor))) {
      return { ok: false as const, error: 'The amplitude factor k must be a number.' };
    }
    if (unaryOp === 'timeShift' && !Number.isFinite(Number(shiftAmount))) {
      return { ok: false as const, error: 'The shift amount must be a number.' };
    }
    if (unaryOp === 'timeScale' && !Number.isFinite(Number(scaleFactor))) {
      return { ok: false as const, error: 'The scaling factor a must be a number.' };
    }
    return applyUnary(unaryOp, a.signal, options);
  }, [a.signal, a.error, b.signal, b.error, mode, binaryOp, unaryOp, support, factor, shiftAmount, scaleFactor]);

  const out: Signal | null = result.ok ? result.value.signal : null;
  const metrics = result.ok ? result.value.metrics : undefined;

  const baseName = `operation-${mode === 'binary' ? binaryOp : unaryOp}`;

  const csv = () => {
    if (!out || !a.signal) return;
    const isCt = out.domain === 'continuous';
    const header = isCt ? ['t_s', 'x1', ...(mode === 'binary' && b.signal ? ['x2'] : []), 'result'] : ['n', 'x1', ...(mode === 'binary' && b.signal ? ['x2'] : []), 'result'];
    const rows = out.axis.map((ax, i) => {
      const get = (s: Signal) => {
        const idx = s.axis.findIndex((v) => Math.abs(v - ax) < 1e-12);
        return idx >= 0 ? s.values[idx] : '';
      };
      return isCt
        ? [ax, get(a.signal!), ...(mode === 'binary' && b.signal ? [get(b.signal)] : []), out.values[i]]
        : [ax, get(a.signal!), ...(mode === 'binary' && b.signal ? [get(b.signal)] : []), out.values[i]];
    });
    downloadCsv(baseName, header, rows, {
      product: 'SignalMaster Pro',
      module: 'Signal Operations',
      operation: mode === 'binary' ? binaryOp : unaryOp,
      operand_1: a.signal.formula,
      operand_2: mode === 'binary' && b.signal ? b.signal.formula : 'n/a',
      support_policy: mode === 'binary' ? support : 'n/a',
      domain: out.domain,
      notes: result.ok ? result.value.notes.join(' | ') : '',
    });
  };

  const traces = useMemo(() => {
    const list = [] as ReturnType<typeof makeTrace>[];
    if (a.signal) list.push(makeTrace(a.signal, 'x₁', theme.palette[0], 1.5, 'dash'));
    if (mode === 'binary' && b.signal) list.push(makeTrace(b.signal, 'x₂', theme.palette[2], 1.5, 'dot'));
    if (out) list.push(makeTrace(out, mode === 'binary' ? `x₁ ${opSymbol(binaryOp)} x₂` : `result`, theme.palette[3], 2.4, 'solid'));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.signal, b.signal, out, mode, binaryOp, theme]);

  const config = {
    a: { params: a.params, spec: a.spec },
    b: { params: b.params, spec: b.spec },
    mode,
    binaryOp,
    unaryOp,
    support,
    factor,
    shiftAmount,
    scaleFactor,
  };

  return (
    <div>
      <PageHeader
        title="Signal Operations"
        description="Combine, scale and transform signals. Domain rules, interpolation and out-of-support behaviour are stated explicitly — nothing is applied silently."
        icon="operations"
        actions={
          <>
            <SaveExperimentButton
              module="operations"
              config={config}
              summary={`${mode === 'binary' ? binaryOp : unaryOp} · ${a.signal?.formula ?? ''}`}
              defaultName={`${mode === 'binary' ? binaryOp : unaryOp} operation`}
              disabled={!out}
            />
            <ExportMenu baseName={baseName} onCsv={out ? csv : undefined} onJson={() => config} pngRef={plotRef} onPrint={() => window.print()} disabled={!out} />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Operation" icon="operations">
            <div className="space-y-3">
              <SegmentedControl
                label="Operation type"
                value={mode}
                onChange={(v) => setMode(v)}
                options={[
                  { value: 'binary', label: 'Two signals' },
                  { value: 'unary', label: 'One signal' },
                ]}
              />
              {mode === 'binary' ? (
                <>
                  <SelectField label="Binary operation" value={binaryOp} onChange={(v) => setBinaryOp(v as BinaryOp)} options={BINARY_OPS} />
                  <SelectField
                    label="Outside a sequence's support"
                    value={support}
                    onChange={(v) => setSupport(v as SupportPolicy)}
                    options={[
                      { value: 'zero', label: 'Treat as zero (assumption)' },
                      { value: 'intersect', label: 'Restrict to the intersection' },
                    ]}
                    hint="Applies where one operand has no defined samples."
                  />
                </>
              ) : (
                <>
                  <SelectField label="Unary operation" value={unaryOp} onChange={(v) => setUnaryOp(v as UnaryOp)} options={UNARY_OPS} />
                  {unaryOp === 'amplitudeScale' && <NumberField label="Amplitude factor k" value={factor} onChange={setFactor} step={0.5} />}
                  {unaryOp === 'timeShift' && (
                    <NumberField
                      label={domain === 'continuous' ? 'Shift t₀ (positive = delay)' : 'Shift k samples (integer)'}
                      value={shiftAmount}
                      onChange={setShiftAmount}
                      step={domain === 'continuous' ? 0.1 : 1}
                      suffix={domain === 'continuous' ? 's' : 'smp'}
                    />
                  )}
                  {unaryOp === 'timeScale' && (
                    <NumberField
                      label="Time-scale factor a in x(at)"
                      value={scaleFactor}
                      onChange={setScaleFactor}
                      step={0.5}
                      hint={domain === 'discrete' ? 'Undefined for discrete sequences — the operation will be refused.' : 'a > 1 compresses, 0 < a < 1 stretches, a < 0 also reverses.'}
                    />
                  )}
                </>
              )}
              <Alert tone="info" title="Domain semantics">
                {domain === 'continuous'
                  ? 'Continuous operands are aligned on a shared uniform grid using linear interpolation between existing samples.'
                  : 'Discrete operands keep integer indices; the result is indexed over the union (or intersection) of supports.'}
              </Alert>
            </div>
          </Card>

          <Card
            title="Operands"
            icon="wave"
            actions={
              mode === 'binary' ? (
                <div className="seg">
                  <button type="button" className={`seg-item ${activeOperand === 'a' ? 'seg-item-active' : ''}`} onClick={() => setActiveOperand('a')}>
                    x₁
                  </button>
                  <button type="button" className={`seg-item ${activeOperand === 'b' ? 'seg-item-active' : ''}`} onClick={() => setActiveOperand('b')}>
                    x₂
                  </button>
                </div>
              ) : undefined
            }
          >
            <div className="space-y-3">
              <SegmentedControl
                label="Domain (applies to both operands)"
                value={domain}
                onChange={(v) => {
                  a.setSpecField('domain', v);
                  b.setSpecField('domain', v);
                }}
                options={[
                  { value: 'continuous', label: 'Continuous t' },
                  { value: 'discrete', label: 'Discrete n' },
                ]}
              />
              {mode === 'unary' || activeOperand === 'a' ? <SignalControls builder={a} idPrefix="op-a" hideDomain compact /> : <SignalControls builder={b} idPrefix="op-b" hideDomain compact />}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Result" subtitle={result.ok ? result.value.signal.formula : undefined} icon="activity">
            {!result.ok ? (
              <Alert tone="error" title="Operation not applied">
                {result.error}
              </Alert>
            ) : (
              <>
                <Plot
                  traces={traces}
                  title="Operands and result"
                  summary={`Overlay of input signal(s) and the result of the ${mode === 'binary' ? binaryOp : unaryOp} operation.`}
                  containerRef={plotRef}
                  height={340}
                  xLabel={out?.domain === 'continuous' ? 'Time t (s)' : 'Sample index n'}
                  yLabel="Amplitude"
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Result samples" value={String(out?.values.length ?? 0)} />
                  <Metric label="Result min" value={fmt(Math.min(...(out?.values ?? [0])))} />
                  <Metric label="Result max" value={fmt(Math.max(...(out?.values ?? [0])))} />
                  <Metric label="Result energy" value={fmt((out?.values ?? []).reduce((s, v) => s + v * v, 0))} />
                </div>
                <div className="mt-3">
                  <NoteList notes={result.value.notes} title="What this operation assumed" />
                </div>
              </>
            )}
          </Card>

          {metrics && (
            <Card title="Comparison metrics" icon="table">
              <DataTable
                caption="Comparison metrics"
                maxHeight={200}
                columns={[
                  { key: 'metric', header: 'Metric' },
                  { key: 'value', header: 'Value', align: 'right' },
                ]}
                rows={[
                  { metric: 'Samples compared', value: String(metrics.samplesCompared) },
                  { metric: 'Max |x₁ − x₂|', value: fmt(metrics.maxAbsDifference) },
                  { metric: 'RMS difference', value: fmt(metrics.rmsDifference) },
                  { metric: 'Mean |difference|', value: fmt(metrics.meanAbsDifference) },
                  { metric: 'Correlation coefficient', value: Number.isNaN(metrics.correlation) ? 'undefined (zero variance)' : fmt(metrics.correlation) },
                ]}
              />
              <div className="mt-2">
                <Equation latex="r = \dfrac{\sum_i (x_1[i]-\bar{x}_1)(x_2[i]-\bar{x}_2)}{\sqrt{\sum_i (x_1[i]-\bar{x}_1)^2\,\sum_i (x_2[i]-\bar{x}_2)^2}}" display />
              </div>
            </Card>
          )}

          <Card title="How to read this" icon="info">
            <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted">
              <li className="flex gap-2">
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-ok" />
                <span>Amplitude scaling (vertical) and time shifting (horizontal) are independent: y = k·x(t − t₀) applies both, in that order.</span>
              </li>
              <li className="flex gap-2">
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-ok" />
                <span>Multiplication corresponds to modulation when one operand is a carrier; addition of equal-frequency sinusoids changes amplitude and phase but not frequency.</span>
              </li>
              <li className="flex gap-2">
                <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-warn" />
                <span>Continuous results are interpolated renderings. If the original record has few samples, sharp edges will be smoothed — increase the sample count.</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function opSymbol(op: BinaryOp): string {
  return op === 'add' ? '+' : op === 'subtract' ? '−' : op === 'multiply' ? '·' : 'vs';
}

function makeTrace(signal: Signal, name: string, color: string, width: number, dash: 'solid' | 'dash' | 'dot') {
  return {
    x: signal.axis,
    y: signal.values,
    mode: (signal.domain === 'discrete' ? 'markers' : 'lines') as 'markers' | 'lines',
    name,
    color,
    width,
    dash,
    extra: { marker: { size: 5 } },
  };
}
