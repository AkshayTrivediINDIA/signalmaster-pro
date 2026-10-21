/**
 * Signal model, generation and sampling.
 *
 * Every module works with the same `Signal` value object:
 *   { domain, axis, values, params, formula, notes }
 * where `domain === 'continuous'` means the axis holds time samples produced
 * by a sampling grid (a rendering of an underlying continuous function) and
 * `domain === 'discrete'` means the axis holds integer sample indices n.
 */
import { ExprError, evaluateNode, parseExpression, collectVariables } from './expr';
import { LIMITS, Checked } from './validation';

export type Domain = 'continuous' | 'discrete';

export type SignalType =
  | 'impulse'
  | 'step'
  | 'ramp'
  | 'exponential'
  | 'sine'
  | 'cosine'
  | 'rect'
  | 'triangle'
  | 'custom';

export interface SignalParams {
  type: SignalType;
  amplitude: number;
  /** Hz for continuous-time, cycles/sample for discrete-time. */
  frequency: number;
  /** Radians. */
  phase: number;
  /** Time offset in seconds (CT) or samples (DT). Positive = delayed to the right. */
  shift: number;
  /** Exponential decay rate σ in e^{−σ(t−t0)}. */
  decay: number;
  /** Full pulse width in seconds (CT) or samples (DT). */
  width: number;
  /** Custom expression in `t` (CT) or `n` (DT). */
  expr?: string;
}

export interface TimeSpec {
  domain: Domain;
  /** CT start/stop in seconds. */
  t0: number;
  t1: number;
  /** CT sample count used for plotting / numerical work. */
  samples: number;
  /** DT index range (integers). */
  n0: number;
  n1: number;
}

export interface Signal {
  domain: Domain;
  axis: number[];
  values: number[];
  params: SignalParams;
  /** Human-readable expression, plain text (LaTeX generated separately). */
  formula: string;
  /** Statements that must be shown to the user (assumptions, approximations). */
  notes: string[];
}

export const DEFAULT_PARAMS: SignalParams = {
  type: 'sine',
  amplitude: 1,
  frequency: 1,
  phase: 0,
  shift: 0,
  decay: 1,
  width: 1,
  expr: 'sin(2*pi*t)',
};

export const DEFAULT_TIME_SPEC: TimeSpec = {
  domain: 'continuous',
  t0: -2,
  t1: 2,
  samples: 801,
  n0: -5,
  n1: 15,
};

const u = (x: number): number => (x >= 0 ? 1 : 0);

/** Value of the ideal signal at a single point (t or n). */
export function evaluateSignal(params: SignalParams, domain: Domain, x: number): number {
  const { amplitude: A, frequency: f, phase: ph, shift: s, decay, width } = params;
  switch (params.type) {
    case 'impulse':
      // Ideal impulse: zero everywhere except exactly at the shift instant.
      return x === s ? A : 0;
    case 'step':
      return A * u(x - s);
    case 'ramp':
      return A * (x - s) * u(x - s);
    case 'exponential':
      return A * Math.exp(-decay * (x - s)) * u(x - s);
    case 'sine':
      return A * Math.sin(2 * Math.PI * f * (x - s) + ph);
    case 'cosine':
      return A * Math.cos(2 * Math.PI * f * (x - s) + ph);
    case 'rect': {
      const half = width / 2;
      return Math.abs(x - s) <= half ? A : 0;
    }
    case 'triangle': {
      const half = width / 2;
      const d = Math.abs(x - s);
      return d <= half ? A * (1 - d / half) : 0;
    }
    case 'custom': {
      const src = params.expr ?? '';
      const ast = parseExpression(src);
      const scope: Record<string, number> = domain === 'continuous' ? { t: x } : { n: x };
      return evaluateNode(ast, scope);
    }
    default:
      return 0;
  }
}

/** Compose a human-readable formula string for the current parameters. */
export function describeSignal(params: SignalParams, domain: Domain): string {
  const A = params.amplitude;
  const varName = domain === 'continuous' ? 't' : 'n';
  const sh = params.shift;
  const shifted = sh === 0 ? varName : `(${varName}${sh >= 0 ? ' − ' + sh : ' + ' + Math.abs(sh)})`;
  const phaseTxt = params.phase === 0 ? '' : ` + ${params.phase}`;
  const fTxt = params.frequency;
  const unit = domain === 'continuous' ? 'Hz' : 'cycles/sample';
  switch (params.type) {
    case 'impulse':
      return `${A}·δ(${shifted})`;
    case 'step':
      return `${A}·u(${shifted})`;
    case 'ramp':
      return `${A}·(${shifted})·u(${shifted})`;
    case 'exponential':
      return `${A}·e^(−${params.decay}${shifted})·u(${shifted})`;
    case 'sine':
      return `${A}·sin(2π·${fTxt}·${shifted}${phaseTxt})   [f in ${unit}]`;
    case 'cosine':
      return `${A}·cos(2π·${fTxt}·${shifted}${phaseTxt})   [f in ${unit}]`;
    case 'rect':
      return `${A}·rect((${varName}${sh >= 0 ? ' − ' + sh : ' + ' + Math.abs(sh)})/${params.width})`;
    case 'triangle':
      return `${A}·tri((${varName}${sh >= 0 ? ' − ' + sh : ' + ' + Math.abs(sh)})/${params.width})`;
    case 'custom':
      return params.expr || '';
    default:
      return '';
  }
}

/** Assumptions/limitations that belong with this signal definition. */
export function signalNotes(params: SignalParams, domain: Domain): string[] {
  const notes: string[] = [];
  if (domain === 'discrete' && !Number.isInteger(params.shift)) {
    notes.push('Discrete signals are only defined at integer positions: the non-integer shift was rounded to the nearest sample.');
  }
  if (domain === 'continuous' && params.type === 'impulse') {
    notes.push(
      'δ(t) is a distribution, not a function: it cannot be plotted literally. The plot shows a unit-area stem marker at t = t₀ (its strength is the area, not a finite height).',
    );
  }
  if (domain === 'discrete' && params.type === 'impulse') {
    notes.push('Discrete unit impulse δ[n] = 1 exactly at n = n₀ and 0 for every other integer.');
  }
  if (domain === 'discrete' && (params.type === 'sine' || params.type === 'cosine') && params.frequency > 0.5) {
    notes.push(
      `f = ${params.frequency} cycles/sample exceeds 0.5, so the discrete sequence is aliased: it is indistinguishable from f = ${Math.abs(
        1 - (params.frequency % 1 || 1),
      ).toFixed(4)} cycles/sample (up to sign).`,
    );
  }
  if (params.type === 'rect' || params.type === 'triangle') {
    notes.push('Pulse edges are evaluated with ≤ comparisons, so the sample exactly on an edge is included.');
  }
  if (params.type === 'custom') {
    notes.push('Custom expressions are evaluated on a fixed sample grid; discontinuities may land between samples.');
  }
  return notes;
}

export interface GenerateOptions {
  params: SignalParams;
  spec: TimeSpec;
}

export type GenerateResult = Checked<Signal>;

/**
 * Build the sampled signal. In continuous mode the axis is a uniform grid of
 * `samples` points (this is a *rendering* of a continuous function); in
 * discrete mode the axis is every integer from n₀ to n₁.
 */
export function generateSignal(opts: GenerateOptions): GenerateResult {
  const { params, spec } = opts;

  if (params.type === 'custom') {
    try {
      const ast = parseExpression(params.expr ?? '');
      const allowed = new Set(['t', 'n']);
      const vars = collectVariables(ast);
      for (const v of vars) {
        if (!allowed.has(v)) {
          return { ok: false, error: `Custom expression may only use ${spec.domain === 'continuous' ? 't' : 'n'}; found "${v}".` };
        }
      }
      evaluateNode(ast, spec.domain === 'continuous' ? { t: 0 } : { n: 0 });
    } catch (e) {
      const msg = e instanceof ExprError ? e.message : 'Invalid expression';
      return { ok: false, error: `Custom expression: ${msg}` };
    }
  }

  if (spec.domain === 'continuous') {
    if (!(spec.t1 > spec.t0)) return { ok: false, error: 'End time must be greater than start time.' };
    const n = Math.round(spec.samples);
    if (!Number.isFinite(n) || n < LIMITS.MIN_CT_POINTS || n > LIMITS.CT_POINTS) {
      return { ok: false, error: `Number of samples must be between ${LIMITS.MIN_CT_POINTS} and ${LIMITS.CT_POINTS}.` };
    }
    if (!Number.isFinite(params.amplitude) || !Number.isFinite(params.frequency) || !Number.isFinite(params.decay)) {
      return { ok: false, error: 'Signal parameters must be finite numbers.' };
    }
    const dt = (spec.t1 - spec.t0) / (n - 1);
    const axis = new Array<number>(n);
    const values = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const t = spec.t0 + i * dt;
      axis[i] = t;
      let v: number;
      try {
        v = evaluateSignal(params, 'continuous', t);
      } catch (e) {
        return { ok: false, error: e instanceof ExprError ? e.message : 'Could not evaluate the signal.' };
      }
      if (!Number.isFinite(v)) {
        return {
          ok: false,
          error: `The signal is undefined at t = ${t.toPrecision(6)} (non-finite value). Adjust the parameters or time range.`,
        };
      }
      values[i] = v;
    }
    return {
      ok: true,
      value: {
        domain: 'continuous',
        axis,
        values,
        params: { ...params },
        formula: describeSignal(params, 'continuous'),
        notes: [...signalNotes(params, 'continuous'), `Rendered with ${n} uniform time samples (Δt = ${dt.toPrecision(4)} s).`],
      },
    };
  }

  // Discrete-time
  const n0 = Math.round(spec.n0);
  const n1 = Math.round(spec.n1);
  if (!Number.isInteger(spec.n0) || !Number.isInteger(spec.n1)) {
    return { ok: false, error: 'Discrete-time start and end must be integers.' };
  }
  if (n1 < n0) return { ok: false, error: 'Discrete end index must be ≥ start index.' };
  const len = n1 - n0 + 1;
  if (len > LIMITS.SEQ_LENGTH) return { ok: false, error: `That range has ${len} samples; the limit is ${LIMITS.SEQ_LENGTH}.` };

  const axis = new Array<number>(len);
  const values = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    const nn = n0 + i;
    axis[i] = nn;
    let v: number;
    try {
      v = evaluateSignal(params, 'discrete', nn);
    } catch (e) {
      return { ok: false, error: e instanceof ExprError ? e.message : 'Could not evaluate the signal.' };
    }
    if (!Number.isFinite(v)) {
      return { ok: false, error: `The signal is undefined at n = ${nn}. Adjust the parameters or index range.` };
    }
    values[i] = v;
  }
  return {
    ok: true,
    value: {
      domain: 'discrete',
      axis,
      values,
      params: { ...params },
      formula: describeSignal(params, 'discrete'),
      notes: signalNotes(params, 'discrete'),
    },
  };
}

/** Uniform sampling grid helper (used when an operation needs a denser/coarser view). */
export function linspace(a: number, b: number, n: number): number[] {
  if (n <= 1) return [a];
  const out = new Array<number>(n);
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = a + i * step;
  return out;
}

/** Linear interpolation with explicit out-of-support handling (NaN). */
export function interpLinear(axis: number[], values: number[], x: number): number {
  const n = axis.length;
  if (n === 0) return NaN;
  if (x < axis[0] - 1e-12 || x > axis[n - 1] + 1e-12) return NaN;
  // binary search for the segment
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (axis[mid] <= x) lo = mid;
    else hi = mid;
  }
  const x0 = axis[lo];
  const x1 = axis[hi];
  if (x1 === x0) return values[lo];
  const frac = (x - x0) / (x1 - x0);
  return values[lo] + frac * (values[hi] - values[lo]);
}

/** Peak value, energy and mean power of a sampled signal (used in summaries). */
export function signalStats(s: Signal) {
  const v = s.values;
  const n = v.length;
  if (n === 0) return { min: 0, max: 0, peak: 0, rms: 0, mean: 0, energy: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;
  for (const x of v) {
    if (x < min) min = x;
    if (x > max) max = x;
    sum += x;
    sumSq += x * x;
  }
  return {
    min,
    max,
    peak: Math.max(Math.abs(min), Math.abs(max)),
    rms: Math.sqrt(sumSq / n),
    mean: sum / n,
    energy: sumSq,
  };
}
