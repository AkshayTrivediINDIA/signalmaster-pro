/**
 * Laplace transform support (causal / one-sided by default).
 *
 * The table below contains standard pairs. Results from the table are *exact*;
 * results computed from a user-entered rational function use polynomial
 * arithmetic and are also exact up to floating-point coefficient handling,
 * with each expansion verified numerically (see rational.ts).
 */
import { partialFractions, PfTerm, PartialFraction, laplaceInverseAt } from './rational';
import { Checked } from './validation';
import { roots, polyvalReal } from './poly';
import { C, cabs, formatComplex } from './complex';

export interface LaplaceParam {
  key: string;
  label: string;
  default: number;
  min?: number;
  integer?: boolean;
  hint?: string;
}

export interface LaplacePair {
  id: string;
  name: string;
  /** LaTeX for the time-domain expression. */
  timeLatex: string;
  /** LaTeX for F(s). */
  sLatex: string;
  roc: string;
  params: LaplaceParam[];
  /** Build numerator/denominator polynomials in s (highest power first). */
  build: (p: Record<string, number>) => Checked<{ num: number[]; den: number[] }>;
  notes?: string;
}

const okNum = (num: number[], den: number[]): Checked<{ num: number[]; den: number[] }> => ({ ok: true, value: { num, den } });

export const LAPLACE_PAIRS: LaplacePair[] = [
  {
    id: 'delta',
    name: 'Unit impulse δ(t)',
    timeLatex: '\\delta(t)',
    sLatex: '1',
    roc: 'all s (entire s-plane)',
    params: [],
    // F(s) = 1 inverts to δ(t), which has no finite plottable waveform, so this
    // entry is reference-only and the UI says so instead of drawing an empty axis.
    build: () => ({
      ok: false,
      error: 'F(s) = 1 inverts to the impulse δ(t): a distribution with no plottable finite waveform. The pair is shown for reference only.',
    }),
    notes: 'The impulse has an s-transform valid everywhere; it is a distribution, not a function.',
  },
  {
    id: 'step',
    name: 'Unit step u(t)',
    timeLatex: 'u(t)',
    sLatex: '\\dfrac{1}{s}',
    roc: 'Re(s) > 0',
    params: [],
    build: () => okNum([1], [1, 0]),
  },
  {
    id: 'ramp',
    name: 'Ramp t·u(t)',
    timeLatex: 't\\,u(t)',
    sLatex: '\\dfrac{1}{s^{2}}',
    roc: 'Re(s) > 0',
    params: [],
    build: () => okNum([1], [1, 0, 0]),
  },
  {
    id: 'power',
    name: 'Power tⁿ·u(t)',
    timeLatex: 't^{n}u(t)',
    sLatex: '\\dfrac{n!}{s^{n+1}}',
    roc: 'Re(s) > 0',
    params: [{ key: 'n', label: 'Exponent n', default: 2, min: 0, integer: true }],
    build: (p) => {
      const n = Math.round(p.n ?? 2);
      if (n < 0 || !Number.isInteger(n)) return { ok: false, error: 'n must be a non-negative integer.' };
      if (n > 12) return { ok: false, error: 'Exponents above 12 are not supported in this table.' };
      let fact = 1;
      for (let i = 2; i <= n; i++) fact *= i;
      const den = new Array<number>(n + 2).fill(0);
      den[0] = 1; // s^{n+1}
      return okNum([fact], den);
    },
  },
  {
    id: 'exp',
    name: 'Exponential e^{−at}·u(t)',
    timeLatex: 'e^{-at}u(t)',
    sLatex: '\\dfrac{1}{s+a}',
    roc: 'Re(s) > −a',
    params: [{ key: 'a', label: 'a', default: 1 }],
    build: (p) => okNum([1], [1, p.a ?? 1]),
  },
  {
    id: 't_exp',
    name: 'Damped ramp t·e^{−at}·u(t)',
    timeLatex: 't\\,e^{-at}u(t)',
    sLatex: '\\dfrac{1}{(s+a)^{2}}',
    roc: 'Re(s) > −a',
    params: [{ key: 'a', label: 'a', default: 1 }],
    build: (p) => {
      const a = p.a ?? 1;
      return okNum([1], [1, 2 * a, a * a]);
    },
  },
  {
    id: 'sine',
    name: 'Sine sin(ωt)·u(t)',
    timeLatex: '\\sin(\\omega t)u(t)',
    sLatex: '\\dfrac{\\omega}{s^{2}+\\omega^{2}}',
    roc: 'Re(s) > 0',
    params: [{ key: 'w', label: 'ω (rad/s)', default: 1 }],
    build: (p) => {
      const w = p.w ?? 1;
      if (w === 0) return { ok: false, error: 'ω must be non-zero.' };
      return okNum([w], [1, 0, w * w]);
    },
  },
  {
    id: 'cosine',
    name: 'Cosine cos(ωt)·u(t)',
    timeLatex: '\\cos(\\omega t)u(t)',
    sLatex: '\\dfrac{s}{s^{2}+\\omega^{2}}',
    roc: 'Re(s) > 0',
    params: [{ key: 'w', label: 'ω (rad/s)', default: 1 }],
    build: (p) => {
      const w = p.w ?? 1;
      if (w === 0) return { ok: false, error: 'ω must be non-zero.' };
      return okNum([1, 0], [1, 0, w * w]);
    },
  },
  {
    id: 'damped_sine',
    name: 'Damped sine e^{−at}sin(ωt)·u(t)',
    timeLatex: 'e^{-at}\\sin(\\omega t)u(t)',
    sLatex: '\\dfrac{\\omega}{(s+a)^{2}+\\omega^{2}}',
    roc: 'Re(s) > −a',
    params: [
      { key: 'a', label: 'a', default: 0.5 },
      { key: 'w', label: 'ω (rad/s)', default: 2 },
    ],
    build: (p) => {
      const a = p.a ?? 0.5;
      const w = p.w ?? 2;
      if (w === 0) return { ok: false, error: 'ω must be non-zero.' };
      return okNum([w], [1, 2 * a, a * a + w * w]);
    },
  },
  {
    id: 'damped_cosine',
    name: 'Damped cosine e^{−at}cos(ωt)·u(t)',
    timeLatex: 'e^{-at}\\cos(\\omega t)u(t)',
    sLatex: '\\dfrac{s+a}{(s+a)^{2}+\\omega^{2}}',
    roc: 'Re(s) > −a',
    params: [
      { key: 'a', label: 'a', default: 0.5 },
      { key: 'w', label: 'ω (rad/s)', default: 2 },
    ],
    build: (p) => {
      const a = p.a ?? 0.5;
      const w = p.w ?? 2;
      if (w === 0) return { ok: false, error: 'ω must be non-zero.' };
      return okNum([1, a], [1, 2 * a, a * a + w * w]);
    },
  },
  {
    id: 'rect',
    name: 'Rectangular pulse (0 ≤ t < T)',
    timeLatex: '\\operatorname{rect}(t/T - 1/2)',
    sLatex: '\\dfrac{1-e^{-sT}}{s}',
    roc: 'all s (entire s-plane)',
    params: [{ key: 'T', label: 'Pulse width T (s)', default: 1, min: 0 }],
    build: (p) => {
      const T = p.T ?? 1;
      if (!(T > 0)) return { ok: false, error: 'T must be positive.' };
      if (T > 20) return { ok: false, error: 'T above 20 s is not supported in this table.' };
      // (1 - e^{-sT})/s is not rational; the exponential is represented numerically only.
      return { ok: false, error: 'This transform contains e^{−sT} and is therefore not rational. Use the pole–zero/rational tools for rational transforms, or evaluate the transform pointwise in the calculator.' };
    },
    notes: 'Kept in the table as a reference pair; it is not a rational function of s, so no finite pole set exists.',
  },
  {
    id: 'delayed_step',
    name: 'Delayed step u(t − T)',
    timeLatex: 'u(t-T)',
    sLatex: '\\dfrac{e^{-sT}}{s}',
    roc: 'Re(s) > 0',
    params: [{ key: 'T', label: 'Delay T (s)', default: 1, min: 0 }],
    build: () => ({ ok: false, error: 'This transform is not rational (contains e^{−sT}); it has no finite pole set. Use it as a reference formula.' }),
  },
];

export interface PoleZeroReport {
  poles: { value: string; re: number; im: number; multiplicity: number }[];
  zeros: { value: string; re: number; im: number }[];
  stable: boolean;
  /** Largest real part among the poles. */
  maxRealPart: number;
  notes: string[];
}

/** Poles, zeros and stability of a rational F(s) = num(s)/den(s). */
export function poleZeroContinuous(num: number[], den: number[]): Checked<PoleZeroReport> {
  if (den.length < 2) return { ok: false, error: 'The denominator must have degree ≥ 1.' };
  let p: C[];
  let z: C[];
  try {
    p = roots(den);
    z = num.some((v) => v !== 0) ? roots(num.length > 1 ? num : [1, 0]) : [];
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not factor the polynomials.' };
  }
  const maxRe = p.length ? Math.max(...p.map((r) => r.re)) : -Infinity;
  const notes: string[] = [];
  if (maxRe < 0) notes.push('All poles lie in the open left half-plane → the causal system is BIBO stable.');
  else if (maxRe === 0) notes.push('At least one pole is on the imaginary axis (marginally stable / oscillatory response, not BIBO stable).');
  else notes.push('At least one pole lies in the right half-plane → the causal system is unstable.');
  notes.push('Stability here assumes the causal (right-sided) interpretation; the ROC must lie to the right of all poles.');
  return {
    ok: true,
    value: {
      poles: groupByMultiplicity(p).map((g) => ({ value: formatComplex(g.value), re: g.value.re, im: g.value.im, multiplicity: g.multiplicity })),
      zeros: z.map((v) => ({ value: formatComplex(v), re: v.re, im: v.im })),
      stable: maxRe < 0,
      maxRealPart: maxRe,
      notes,
    },
  };
}

function groupByMultiplicity(r: C[]): { value: C; multiplicity: number }[] {
  const groups: { value: C; multiplicity: number }[] = [];
  for (const v of r) {
    const g = groups.find((x) => cabs({ re: x.value.re - v.re, im: x.value.im - v.im }) < 1e-6 * Math.max(1, cabs(v)));
    if (g) g.multiplicity++;
    else groups.push({ value: v, multiplicity: 1 });
  }
  return groups;
}

export interface LaplaceAnalysis {
  pf: PartialFraction;
  /** Time-domain description produced from the residues. */
  termsLatex: string[];
  poles: PoleZeroReport;
  notes: string[];
  /** Sampled h(t) for plotting. */
  time: number[];
  h: number[];
}

/** Inverse Laplace of a strictly-proper/improper rational F(s) with causal interpretation. */
export function analyzeInverseLaplace(num: number[], den: number[], tMax = 10, samples = 801): Checked<LaplaceAnalysis> {
  if (den.length < 2) return { ok: false, error: 'Enter a denominator of degree ≥ 1, e.g. s² + 3s + 2 → “1, 3, 2”.' };
  const pf = partialFractions(num, den);
  if (!pf.ok) return { ok: false, error: pf.error };
  const pz = poleZeroContinuous(num, den);
  if (!pz.ok) return { ok: false, error: pz.error };
  const notes: string[] = [];
  if (pf.value.improper) {
    notes.push(
      'The numerator degree is ≥ the denominator degree: polynomial division produced a direct term (impulse and derivatives of the impulse in the time domain). Only the strictly proper part contributes decaying/exponential terms.',
    );
  }
  notes.push(`Partial-fraction expansion verified numerically (max error ${pf.value.verificationError.toExponential(2)}).`);
  notes.push('Result assumes the causal (right-sided) inverse transform; the ROC is to the right of the rightmost pole.');
  const time = Array.from({ length: samples }, (_, i) => (i * tMax) / (samples - 1) - 0.05 * tMax);
  const h = time.map((ti) => (ti < 0 ? 0 : termSum(pf.value.terms, ti)));
  return {
    ok: true,
    value: {
      pf: pf.value,
      termsLatex: pf.value.terms.map(termToLatex),
      poles: pz.value,
      notes,
      time,
      h,
    },
  };
}

function termSum(terms: PfTerm[], t: number): number {
  // Delegates to the single implementation used by the system analyser so the
  // time-domain formula can never drift from the plot.
  return laplaceInverseAt(terms, t);
}

function termToLatex(term: PfTerm): string {
  const r = formatComplex(term.residue, 3);
  const p = formatComplex(term.pole, 3);
  const tPow = term.power === 1 ? '' : `\\dfrac{t^{${term.power - 1}}}{${factorial(term.power - 1)}}`;
  return `${tPow} ${r} \\cdot e^{(${p})t}`;
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** Evaluate F(s) at a real s (used by the calculator for numeric transform values). */
export function evalRationalAtS(num: number[], den: number[], s: number): number {
  const d = polyvalReal(den, s);
  if (d === 0) return NaN;
  return polyvalReal(num, s) / d;
}
