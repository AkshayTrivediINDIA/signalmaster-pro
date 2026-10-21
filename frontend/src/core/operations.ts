/**
 * Signal operations with explicit domain semantics.
 *
 * Rules enforced here (and surfaced in the UI):
 *  • Binary operations require both operands in the same domain. Mixing a
 *    continuous rendering with a discrete sequence is refused rather than
 *    silently interpolated.
 *  • Continuous-time operands are evaluated on a shared uniform grid covering
 *    the union of both supports. Linear interpolation is used between existing
 *    samples — this is an approximation and is always reported.
 *  • Discrete-time operands are combined over the union of their integer
 *    supports. Values outside a finite sequence's support are handled by the
 *    selected `support` policy: 'zero' (assume zero outside) or 'intersect'
 *    (only indices where both are defined).
 *  • Time scaling x(at) is undefined for a discrete sequence, so it is refused
 *    for discrete-time inputs (only integer decimation/interpolation exists,
 *    which requires a resampling design decision).
 */
import { Signal, interpLinear, linspace } from './signals';
import { Checked, LIMITS } from './validation';

export type BinaryOp = 'add' | 'subtract' | 'multiply' | 'compare';
export type UnaryOp = 'amplitudeScale' | 'timeShift' | 'timeReverse' | 'timeScale';

export type SupportPolicy = 'zero' | 'intersect';

export interface OperationResult {
  signal: Signal;
  notes: string[];
  metrics?: CompareMetrics;
}

export interface CompareMetrics {
  maxAbsDifference: number;
  rmsDifference: number;
  meanAbsDifference: number;
  /** Pearson correlation coefficient; NaN when either signal has zero variance. */
  correlation: number;
  samplesCompared: number;
}

const opLabel: Record<BinaryOp | UnaryOp, string> = {
  add: 'x₁ + x₂',
  subtract: 'x₁ − x₂',
  multiply: 'x₁ · x₂',
  compare: 'comparison',
  amplitudeScale: 'k·x',
  timeShift: 'x(t − t₀) / x[n − k]',
  timeReverse: 'x(−t) / x[−n]',
  timeScale: 'x(at)',
};

export function operationLabel(op: BinaryOp | UnaryOp): string {
  return opLabel[op];
}

function checkSameDomain(a: Signal, b: Signal): string | null {
  if (a.domain !== b.domain) {
    return `Both signals must be in the same domain. Signal 1 is ${a.domain}-time and signal 2 is ${b.domain}-time. Convert one of them first (e.g. sample it on a grid) instead of mixing domains silently.`;
  }
  return null;
}

/** Common uniform grid for two continuous-time operands. */
function unionGrid(a: Signal, b: Signal, points: number) {
  const start = Math.min(a.axis[0], b.axis[0]);
  const stop = Math.max(a.axis[a.axis.length - 1], b.axis[b.axis.length - 1]);
  const n = Math.max(LIMITS.MIN_CT_POINTS, Math.min(Math.round(points), LIMITS.CT_POINTS));
  return linspace(start, stop, n);
}

export interface BinaryOptions {
  points?: number;
  support?: SupportPolicy;
  /** Output label, e.g. "y₁". */
  label?: string;
}

export function applyBinary(
  op: BinaryOp,
  a: Signal,
  b: Signal,
  options: BinaryOptions = {},
): Checked<OperationResult> {
  const domainError = checkSameDomain(a, b);
  if (domainError) return { ok: false, error: domainError };
  const support: SupportPolicy = options.support ?? 'zero';
  const notes: string[] = [];

  if (a.domain === 'continuous') {
    const grid = unionGrid(a, b, options.points ?? Math.max(a.axis.length, b.axis.length));
    const av = new Array<number>(grid.length);
    const bv = new Array<number>(grid.length);
    let outside = 0;
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      const x1 = interpLinear(a.axis, a.values, t);
      const x2 = interpLinear(b.axis, b.values, t);
      if ((Number.isNaN(x1) || Number.isNaN(x2)) && support === 'zero') outside++;
      av[i] = Number.isNaN(x1) ? (support === 'zero' ? 0 : NaN) : x1;
      bv[i] = Number.isNaN(x2) ? (support === 'zero' ? 0 : NaN) : x2;
    }
    if (outside > 0) {
      notes.push(
        'One operand did not cover the full union of the time axes; the missing region was treated as zero (support policy “zero”). Choose “intersection” to restrict the result instead.',
      );
    }
    const values = new Array<number>(grid.length);
    for (let i = 0; i < grid.length; i++) {
      const x1 = av[i];
      const x2 = bv[i];
      values[i] =
        op === 'add' ? x1 + x2 : op === 'subtract' ? x1 - x2 : op === 'multiply' ? x1 * x2 : x1 - x2;
    }
    notes.push('Continuous-time operands were evaluated on a shared uniform grid using linear interpolation of the existing samples.');
    const signal: Signal = {
      domain: 'continuous',
      axis: grid,
      values,
      params: { ...a.params },
      formula: `y(t) = ${binaryFormula(op, 'x₁', 'x₂')}`,
      notes,
    };
    const result: OperationResult = { signal, notes };
    if (op === 'compare') result.metrics = compareMetrics(av, bv);
    return { ok: true, value: result };
  }

  // Discrete-time: union of integer supports
  const getA = indexMap(a);
  const getB = indexMap(b);
  let lo = Math.min(a.axis[0], b.axis[0]);
  let hi = Math.max(a.axis[a.axis.length - 1], b.axis[b.axis.length - 1]);
  if (support === 'intersect') {
    lo = Math.max(a.axis[0], b.axis[0]);
    hi = Math.min(a.axis[a.axis.length - 1], b.axis[b.axis.length - 1]);
    if (hi < lo) return { ok: false, error: 'The two sequences have no overlapping index range, so the intersection is empty.' };
  }
  const len = hi - lo + 1;
  if (len > LIMITS.SEQ_LENGTH) {
    return { ok: false, error: `Resulting sequence would have ${len} samples; the limit is ${LIMITS.SEQ_LENGTH}.` };
  }
  const axis: number[] = [];
  const values: number[] = [];
  const av: number[] = [];
  const bv: number[] = [];
  let undefinedCount = 0;
  for (let n = lo; n <= hi; n++) {
    const x1 = getA(n);
    const x2 = getB(n);
    if (x1 === undefined || x2 === undefined) undefinedCount++;
    const v1 = x1 ?? 0;
    const v2 = x2 ?? 0;
    axis.push(n);
    av.push(v1);
    bv.push(v2);
    values.push(op === 'add' ? v1 + v2 : op === 'subtract' ? v1 - v2 : op === 'multiply' ? v1 * v2 : v1 - v2);
  }
  if (undefinedCount > 0 && support === 'zero') {
    notes.push(
      'Part of the union index range is outside one sequence’s support; those samples were treated as zero. This is an assumption, not a mathematical identity — choose “intersection” to restrict the result to where both are defined.',
    );
  }
  notes.push('Discrete-time result is indexed on the union of the two integer supports (n is a sample index, not seconds).');
  const signal: Signal = {
    domain: 'discrete',
    axis,
    values,
    params: { ...a.params },
    formula: `y[n] = ${binaryFormula(op, 'x₁', 'x₂')}`,
    notes,
  };
  const result: OperationResult = { signal, notes };
  if (op === 'compare') result.metrics = compareMetrics(av, bv);
  return { ok: true, value: result };
}

function binaryFormula(op: BinaryOp, a: string, b: string): string {
  switch (op) {
    case 'add':
      return `${a} + ${b}`;
    case 'subtract':
      return `${a} − ${b}`;
    case 'multiply':
      return `${a} · ${b}`;
    case 'compare':
      return `${a} − ${b}  (difference)`;
  }
}

/** Build a Map from index → value for O(1) discrete lookup. */
function indexMap(s: Signal): (n: number) => number | undefined {
  const map = new Map<number, number>();
  for (let i = 0; i < s.axis.length; i++) map.set(s.axis[i], s.values[i]);
  return (n: number) => map.get(n);
}

function compareMetrics(a: number[], b: number[]): CompareMetrics {
  const n = Math.min(a.length, b.length);
  let maxAbs = 0;
  let sumSq = 0;
  let sumAbs = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    maxAbs = Math.max(maxAbs, Math.abs(d));
    sumSq += d * d;
    sumAbs += Math.abs(d);
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const corr = varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : NaN;
  return {
    maxAbsDifference: maxAbs,
    rmsDifference: Math.sqrt(sumSq / n),
    meanAbsDifference: sumAbs / n,
    correlation: corr,
    samplesCompared: n,
  };
}

export interface UnaryOptions {
  /** Amplitude factor for `amplitudeScale`. */
  factor?: number;
  /** Shift amount: seconds (CT) or samples (DT). */
  shift?: number;
  /** Time-scaling factor a in x(at); must be non-zero. */
  scale?: number;
  points?: number;
}

export function applyUnary(op: UnaryOp, s: Signal, options: UnaryOptions = {}): Checked<OperationResult> {
  const notes: string[] = [];

  if (op === 'amplitudeScale') {
    const k = options.factor;
    if (k === undefined || !Number.isFinite(k)) return { ok: false, error: 'Provide a finite amplitude factor k.' };
    if (Math.abs(k) > 1e12) return { ok: false, error: 'Amplitude factor exceeds the supported magnitude.' };
    return {
      ok: true,
      value: {
        signal: {
          ...s,
          values: s.values.map((v) => v * k),
          formula: `y = ${k}·(${s.formula})`,
          notes: [...s.notes, `Amplitude scaled by k = ${k}.`],
        },
        notes: [`Amplitude scaling y = ${k}·x multiplies every sample by ${k}.`],
      },
    };
  }

  if (op === 'timeShift') {
    const t0 = options.shift;
    if (t0 === undefined || !Number.isFinite(t0)) return { ok: false, error: 'Provide a finite shift amount.' };
    if (s.domain === 'discrete') {
      if (!Number.isInteger(t0)) {
        return { ok: false, error: 'A discrete-time shift must be a whole number of samples (e.g. 2 or −3).' };
      }
      const axis = s.axis.map((n) => n + t0);
      return {
        ok: true,
        value: {
          signal: { ...s, axis, values: [...s.values], formula: `y[n] = x[n − ${t0}]`, notes: [...s.notes] },
          notes: [
            `x[n − ${t0}] delays the sequence by ${t0} samples (a positive shift moves the sequence right).`,
            'The sample values are unchanged; only the index labels move.',
          ],
        },
      };
    }
    // Continuous-time: re-evaluate on the same axis using y(t) = x(t − t0)
    const axis = [...s.axis];
    const values = axis.map((t) => {
      const v = interpLinear(s.axis, s.values, t - t0);
      return Number.isNaN(v) ? 0 : v;
    });
    notes.push(
      `y(t) = x(t − ${t0}) shifts the waveform by ${t0} s (positive = delay). Interpolation is used; regions that fall outside the original record are shown as zero.`,
    );
    return { ok: true, value: { signal: { ...s, axis, values, formula: `y(t) = x(t − ${t0})`, notes: [...s.notes, ...notes] }, notes } };
  }

  if (op === 'timeReverse') {
    if (s.domain === 'continuous') {
      const axis = s.axis.map((t) => -t).reverse();
      const values = [...s.values].reverse();
      notes.push('x(−t) mirrors the waveform about t = 0.');
      return { ok: true, value: { signal: { ...s, axis, values, formula: 'y(t) = x(−t)', notes: [...s.notes, ...notes] }, notes } };
    }
    const axis = s.axis.map((n) => (n === 0 ? 0 : -n)).reverse();
    return {
      ok: true,
      value: {
        signal: { ...s, axis, values: [...s.values].reverse(), formula: 'y[n] = x[−n]', notes: [...s.notes] },
        notes: ['x[−n] folds the sequence about n = 0; sample values stay the same but the index labels reverse sign.'],
      },
    };
  }

  // timeScale
  const a = options.scale;
  if (a === undefined || !Number.isFinite(a)) return { ok: false, error: 'Provide a finite, non-zero scaling factor a.' };
  if (a === 0) return { ok: false, error: 'Time scaling by a = 0 collapses the signal to a single point and is refused.' };
  if (s.domain === 'discrete') {
    return {
      ok: false,
      error:
        'Time scaling x(at) is undefined for a discrete-time sequence. It would require decimation or interpolation (a resampling design choice), which is intentionally not applied implicitly. Use the sampling controls in the Signal Generator instead.',
    };
  }
  const axis = [...s.axis];
  const values = axis.map((t) => {
    const v = interpLinear(s.axis, s.values, a * t);
    return Number.isNaN(v) ? 0 : v;
  });
  notes.push(
    a > 0
      ? `x(${a}t) compresses the waveform by ${a} when a > 1 and stretches it when 0 < a < 1.`
      : `x(${a}t) with a negative factor combines time scaling with time reversal.`,
  );
  notes.push('The result is re-sampled on the original time axis; edges that fall outside the original record are zero.');
  return {
    ok: true,
    value: { signal: { ...s, axis, values, formula: `y(t) = x(${a}t)`, notes: [...s.notes, ...notes] }, notes },
  };
}

export type { Signal };
