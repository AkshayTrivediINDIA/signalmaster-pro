import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PARAMS,
  DEFAULT_TIME_SPEC,
  generateSignal,
  signalNotes,
  describeSignal,
  type Signal,
  type SignalParams,
  type SignalType,
  type TimeSpec,
} from '../../core/signals';
import { useSettings } from '../../app/AppContext';
import { NumberField, SelectField, SegmentedControl, TextField } from '../../components/ui/fields';
import { Icon } from '../../components/ui/icons';
import { LIMITS } from '../../core/validation';

export interface BuilderState {
  params: SignalParams;
  spec: TimeSpec;
}

export const SIGNAL_TYPES: { value: SignalType; label: string }[] = [
  { value: 'sine', label: 'Sine  A·sin(2πft + φ)' },
  { value: 'cosine', label: 'Cosine  A·cos(2πft + φ)' },
  { value: 'step', label: 'Unit step  A·u(t)' },
  { value: 'impulse', label: 'Unit impulse  A·δ(t)' },
  { value: 'ramp', label: 'Ramp  A·t·u(t)' },
  { value: 'exponential', label: 'Exponential  A·e^(−σt)·u(t)' },
  { value: 'rect', label: 'Rectangular pulse' },
  { value: 'triangle', label: 'Triangular pulse' },
  { value: 'custom', label: 'Custom expression…' },
];

export const EXAMPLE_STATES: Record<string, BuilderState> = {
  sine5Hz: {
    params: { ...DEFAULT_PARAMS, type: 'sine', amplitude: 1, frequency: 5, phase: 0, shift: 0 },
    spec: { ...DEFAULT_TIME_SPEC, domain: 'continuous', t0: 0, t1: 1, samples: 801 },
  },
  decaying: {
    params: { ...DEFAULT_PARAMS, type: 'exponential', amplitude: 2, decay: 3, shift: 0 },
    spec: { ...DEFAULT_TIME_SPEC, domain: 'continuous', t0: -0.5, t1: 2, samples: 601 },
  },
  discreteCosine: {
    params: { ...DEFAULT_PARAMS, type: 'cosine', amplitude: 1, frequency: 0.125, phase: 0 },
    spec: { ...DEFAULT_TIME_SPEC, domain: 'discrete', n0: 0, n1: 31 },
  },
  unitStepSequence: {
    params: { ...DEFAULT_PARAMS, type: 'step', amplitude: 1, shift: 0 },
    spec: { ...DEFAULT_TIME_SPEC, domain: 'discrete', n0: -4, n1: 12 },
  },
  pulse: {
    params: { ...DEFAULT_PARAMS, type: 'rect', amplitude: 1, width: 1, shift: 0 },
    spec: { ...DEFAULT_TIME_SPEC, domain: 'continuous', t0: -2, t1: 2, samples: 801 },
  },
  custom: {
    params: { ...DEFAULT_PARAMS, type: 'custom', expr: 'exp(-2*t)*sin(6*pi*t)', amplitude: 1 },
    spec: { ...DEFAULT_TIME_SPEC, domain: 'continuous', t0: 0, t1: 2, samples: 801 },
  },
};

/**
 * Shared signal-building state machine.
 *
 * Holds raw text for every numeric field so the user can type freely (e.g. a
 * trailing minus sign) while validation runs on the parsed numbers. The
 * generated signal is recomputed only when inputs actually change.
 */
export function useSignalBuilder(initial?: Partial<BuilderState>) {
  const { settings } = useSettings();
  const [params, setParams] = useState<SignalParams>({ ...(initial?.params ?? DEFAULT_PARAMS) });
  const [spec, setSpec] = useState<TimeSpec>({ ...(initial?.spec ?? DEFAULT_TIME_SPEC) });
  const [version, setVersion] = useState(0);

  // `version` is bumped by the Generate/Reset/Examples actions to force a
  // recomputation when auto-run is disabled.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const computed = useMemo(() => generateSignal({ params, spec }), [params, spec, version]);
  const value: Signal | null = computed.ok ? computed.value : null;
  const error = computed.ok ? null : computed.error;

  const setParam = useCallback(<K extends keyof SignalParams>(key: K, v: SignalParams[K]) => {
    setParams((p) => ({ ...p, [key]: v }));
  }, []);

  const setSpecField = useCallback(<K extends keyof TimeSpec>(key: K, v: TimeSpec[K]) => {
    setSpec((s) => ({ ...s, [key]: v }));
  }, []);

  const load = useCallback((state: BuilderState) => {
    setParams({ ...state.params });
    setSpec({ ...state.spec });
    setVersion((v) => v + 1);
  }, []);

  const reset = useCallback(() => {
    setParams({ ...DEFAULT_PARAMS });
    setSpec({ ...DEFAULT_TIME_SPEC });
    setVersion((v) => v + 1);
  }, []);

  return {
    params,
    spec,
    setParam,
    setSpecField,
    setParams,
    setSpec,
    signal: value,
    error,
    autoRun: settings.autoRun,
    apply: () => setVersion((v) => v + 1),
    load,
    reset,
    notes: signalNotes(params, spec.domain),
    formula: describeSignal(params, spec.domain),
  };
}

export type SignalBuilder = ReturnType<typeof useSignalBuilder>;

/** Editable numeric state kept as strings, converted back to numbers on change. */
function useNumericField(value: number, onCommit: (v: number) => void) {
  const [text, setText] = useState(String(value));
  // Keep the visible text in sync when the value changes from outside this
  // field (example loading, reset, linked controls).
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return {
    text,
    setText: (t: string) => {
      setText(t);
      const n = Number(t);
      if (t.trim() !== '' && Number.isFinite(n)) onCommit(n);
    },
  };
}

export function SignalControls({
  builder,
  idPrefix = 'sig',
  compact = false,
  hideDomain = false,
}: {
  builder: SignalBuilder;
  idPrefix?: string;
  compact?: boolean;
  hideDomain?: boolean;
}) {
  const { params, spec, setParam, setSpecField } = builder;
  const amplitude = useNumericField(params.amplitude, (v) => setParam('amplitude', v));
  const frequency = useNumericField(params.frequency, (v) => setParam('frequency', v));
  const phase = useNumericField(params.phase, (v) => setParam('phase', v));
  const shift = useNumericField(params.shift, (v) => setParam('shift', v));
  const decay = useNumericField(params.decay, (v) => setParam('decay', v));
  const width = useNumericField(params.width, (v) => setParam('width', v));
  const t0 = useNumericField(spec.t0, (v) => setSpecField('t0', v));
  const t1 = useNumericField(spec.t1, (v) => setSpecField('t1', v));
  const samples = useNumericField(spec.samples, (v) => setSpecField('samples', Math.round(v)));
  const n0 = useNumericField(spec.n0, (v) => setSpecField('n0', Math.round(v)));
  const n1 = useNumericField(spec.n1, (v) => setSpecField('n1', Math.round(v)));

  const isPulse = params.type === 'rect' || params.type === 'triangle';
  const usesFreq = params.type === 'sine' || params.type === 'cosine';
  const usesDecay = params.type === 'exponential';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-3.5'}>
      {!hideDomain && (
        <SegmentedControl
          label="Time domain"
          value={spec.domain}
          onChange={(v) => setSpecField('domain', v)}
          options={[
            { value: 'continuous', label: 'Continuous t', icon: 'wave' },
            { value: 'discrete', label: 'Discrete n', icon: 'layers' },
          ]}
        />
      )}

      <SelectField
        label="Waveform"
        id={`${idPrefix}-type`}
        value={params.type}
        onChange={(v) => setParam('type', v as SignalType)}
        options={SIGNAL_TYPES}
      />

      {params.type === 'custom' && (
        <TextField
          label={spec.domain === 'continuous' ? 'Expression in t' : 'Expression in n'}
          id={`${idPrefix}-expr`}
          value={params.expr ?? ''}
          onChange={(v) => setParam('expr', v)}
          monospace
          placeholder="e.g. exp(-2*t)*sin(6*pi*t)"
          hint="Functions: sin cos tan exp ln log sqrt abs sinc u sign min max … Operators: + − * / ^ % ! and parentheses."
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Amplitude A" id={`${idPrefix}-amp`} value={amplitude.text} onChange={amplitude.setText} step={0.1} />
        {usesFreq && (
          <NumberField
            label={spec.domain === 'continuous' ? 'Frequency f' : 'Frequency f'}
            id={`${idPrefix}-freq`}
            value={frequency.text}
            onChange={frequency.setText}
            step={0.1}
            suffix={spec.domain === 'continuous' ? 'Hz' : 'cyc/s'}
            hint={spec.domain === 'discrete' ? '0.5 = Nyquist; above 0.5 aliases.' : undefined}
          />
        )}
        {usesDecay && <NumberField label="Decay σ" id={`${idPrefix}-decay`} value={decay.text} onChange={decay.setText} step={0.1} suffix="1/s" />}
        {isPulse && <NumberField label="Pulse width" id={`${idPrefix}-width`} value={width.text} onChange={width.setText} step={0.1} min={0} suffix={spec.domain === 'continuous' ? 's' : 'smp'} />}
        {!usesFreq && !usesDecay && !isPulse && <div />}
        {usesFreq && <NumberField label="Phase φ" id={`${idPrefix}-phase`} value={phase.text} onChange={phase.setText} step={0.1} suffix="rad" />}
        <NumberField
          label={spec.domain === 'continuous' ? 'Time shift t₀' : 'Sample shift n₀'}
          id={`${idPrefix}-shift`}
          value={shift.text}
          onChange={shift.setText}
          step={1}
          suffix={spec.domain === 'continuous' ? 's' : 'smp'}
          hint={spec.domain === 'discrete' ? 'Whole samples only.' : undefined}
        />
      </div>

      <div className="rounded-lg border border-line bg-surface2/40 p-2.5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {spec.domain === 'continuous' ? 'Time window & sampling' : 'Sample index range'}
        </p>
        {spec.domain === 'continuous' ? (
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Start t₀" id={`${idPrefix}-t0`} value={t0.text} onChange={t0.setText} step={0.5} suffix="s" />
            <NumberField label="End t₁" id={`${idPrefix}-t1`} onChange={t1.setText} value={t1.text} step={0.5} suffix="s" />
            <NumberField
              label="Samples"
              id={`${idPrefix}-samples`}
              value={samples.text}
              onChange={samples.setText}
              step={100}
              min={LIMITS.MIN_CT_POINTS}
              max={LIMITS.CT_POINTS}
              hint={`${LIMITS.MIN_CT_POINTS}–${LIMITS.CT_POINTS}`}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Start n₀" id={`${idPrefix}-n0`} value={n0.text} onChange={n0.setText} step={1} hint="Integer" />
            <NumberField label="End n₁" id={`${idPrefix}-n1`} value={n1.text} onChange={n1.setText} step={1} hint={`≤ ${LIMITS.SEQ_LENGTH} samples`} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {!builder.autoRun && (
          <button type="button" className="btn-primary btn-sm" onClick={builder.apply}>
            <Icon name="play" size={13} /> Generate
          </button>
        )}
        <button type="button" className="btn-secondary btn-sm" onClick={builder.reset}>
          <Icon name="reset" size={13} /> Reset
        </button>
        <div className="relative">
          <select
            className="peer absolute inset-0 cursor-pointer opacity-0"
            aria-label="Load an example signal"
            value=""
            onChange={(e) => {
              const ex = EXAMPLE_STATES[e.target.value];
              if (ex) builder.load(ex);
              e.target.value = '';
            }}
          >
            <option value="">Load example…</option>
            <option value="sine5Hz">5 Hz sine, 1 s</option>
            <option value="decaying">Decaying exponential</option>
            <option value="discreteCosine">Discrete cosine, 32 samples</option>
            <option value="unitStepSequence">Unit step sequence</option>
            <option value="pulse">Rectangular pulse</option>
            <option value="custom">Custom: damped sinusoid</option>
          </select>
          <span className="btn-secondary btn-sm pointer-events-none">
            <Icon name="book" size={13} /> Examples
          </span>
        </div>
      </div>

      {builder.error && (
        <p className="note-err" role="alert">
          {builder.error}
        </p>
      )}
    </div>
  );
}
