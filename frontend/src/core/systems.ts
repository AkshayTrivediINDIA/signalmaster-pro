/**
 * LTI system analysis for two explicitly supported model classes:
 *
 *  1. Discrete-time difference equations
 *        Σ_{k=0}^{Q} a_k y[n−k] = Σ_{k=0}^{P} b_k x[n−k]
 *     with zero initial conditions. h[n] is computed by exact recursion.
 *
 *  2. Continuous-time rational transfer functions
 *        H(s) = B(s)/A(s)
 *     with a causal (right-sided) interpretation. h(t) is obtained from the
 *     verified partial-fraction expansion.
 *
 * Properties are reported only for these classes. In particular, linearity and
 * time-invariance are *model assumptions* of the LTI class — they are not
 * inferred from data. Arbitrary user-supplied systems (nonlinear, time-varying,
 * or given only as a black-box signal pair) cannot be conclusively classified
 * by this tool, and the UI says so.
 */
import { roots } from './poly';
import { partialFractions } from './rational';
import { impulseResponse, lfilter, freqz, isBiboStableContinuous, isBiboStableDiscrete } from './dsp';
import { laplaceInverseAt, PfTerm } from './rational';
import { C, cabs } from './complex';
import { Checked } from './validation';

export type SystemKind = 'discrete' | 'continuous';

export interface PropertyReport {
  label: string;
  verdict: 'yes' | 'no' | 'conditional' | 'unknown';
  detail: string;
}

export interface SystemAnalysis {
  kind: SystemKind;
  transferLatex: string;
  poles: { value: string; re: number; im: number; magnitude: number; multiplicity: number }[];
  zeros: { value: string; re: number; im: number; magnitude: number }[];
  stable: boolean;
  stableDetail: string;
  /** Time axis for the impulse/step responses. */
  timeAxis: number[];
  impulse: number[];
  step: number[];
  /** Frequency axis in rad/sample (discrete) or rad/s (continuous). */
  freqAxis: number[];
  magnitudeDb: number[];
  phaseDeg: number[];
  properties: PropertyReport[];
  notes: string[];
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

const fmtC = (v: C, d = 4) => {
  const re = Number(v.re.toFixed(d));
  const im = Math.abs(v.im) < 10 ** -d ? 0 : Number(Math.abs(v.im).toFixed(d));
  return im === 0 ? `${re}` : `${re} ± ${im}j`;
};

/** Render Σ c_k s^{-k} style polynomials for display. */
function polynomialLatex(coeffs: number[], variable: 's' | 'z', inversePowers = false): string {
  const terms: string[] = [];
  const n = coeffs.length - 1;
  coeffs.forEach((c, i) => {
    if (c === 0) return;
    const power = inversePowers ? n - i : n - i;
    const sign = c < 0 ? '−' : '+';
    const mag = Math.abs(c);
    const magTxt = mag === 1 && power !== 0 ? '' : String(Number(mag.toFixed(4)));
    const varTxt = power === 0 ? '' : power === 1 ? variable : `${variable}^{${power}}`;
    terms.push(`${terms.length === 0 ? (c < 0 ? '−' : '') : ` ${sign} `}${magTxt}${varTxt}`);
  });
  return terms.length ? terms.join('') : '0';
}

/* ------------------------------------------------------------------ */
/* Discrete-time systems                                              */
/* ------------------------------------------------------------------ */

export interface DiscreteSystemSpec {
  b: number[];
  a: number[];
}

export function analyzeDiscreteSystem(spec: DiscreteSystemSpec, samples = 60): Checked<SystemAnalysis> {
  const { b, a } = spec;
  if (a.length === 0 || a[0] === 0) return { ok: false, error: 'a[0] must be non-zero.' };
  if (b.length === 0) return { ok: false, error: 'At least one numerator coefficient is required.' };
  if (samples < 5 || samples > 4096) return { ok: false, error: 'The sample count must be between 5 and 4096.' };

  const stab = isBiboStableDiscrete(a);
  const az = [...a].reverse(); // coefficients in z, highest power first
  const bz = [...b].reverse();
  let poles: C[];
  let zeros: C[];
  try {
    poles = roots(az);
    zeros = bz.length > 1 ? roots(bz) : [];
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not factor the numerator/denominator.' };
  }

  const h = Array.from(impulseResponse({ b, a }, samples));
  const step = Array.from(lfilter({ b, a }, new Float64Array(samples).fill(1)));
  if (h.some((v) => !Number.isFinite(v)) || step.some((v) => !Number.isFinite(v))) {
    return { ok: false, error: 'The recursion diverged numerically (unstable system with very large poles). Reduce the sample count.' };
  }

  const omega = Array.from({ length: 401 }, (_, i) => (Math.PI * i) / 400);
  const H = freqz({ b, a }, omega);
  const magnitudeDb = H.map((v) => 20 * Math.log10(Math.max(cabs(v), 1e-12)));
  const phaseDeg = H.map((v) => (Math.atan2(v.im, v.re) * 180) / Math.PI);

  const notes: string[] = [
    'Model: linear, time-invariant difference equation with zero initial conditions (causal by construction).',
    'h[n] is computed by exact recursion of the difference equation; the frequency response is evaluated as H(e^{jω}) = B(e^{jω})/A(e^{jω}).',
  ];
  const stableDetail = poles.length === 0
    ? 'No finite poles (pure FIR gain): stable.'
    : stab.stable
      ? `All ${poles.length} pole(s) strictly inside the unit circle (largest |p| = ${(1 - stab.margin).toFixed(6)} < 1).`
      : `Largest pole magnitude is ${(1 - stab.margin).toFixed(6)} ≥ 1 → the causal system is not BIBO stable.`;

  const properties: PropertyReport[] = [
    { label: 'Linearity', verdict: 'yes', detail: 'Assumed by the LTI difference-equation model.' },
    { label: 'Time invariance', verdict: 'yes', detail: 'Constant coefficients make the recursion time-invariant.' },
    {
      label: 'Memory',
      verdict: isMemoryless(b, a) ? 'no' : 'yes',
      detail: isMemoryless(b, a)
        ? 'y[n] = b₀x[n] depends only on the present input.'
        : 'The output depends on past inputs and/or past outputs.',
    },
    {
      label: 'Causality',
      verdict: 'yes',
      detail: 'The recursion only uses x[n−k], y[n−k] with k ≥ 0, so h[n] = 0 for n < 0 (h[0] = b₀/a₀).',
    },
    { label: 'BIBO stability', verdict: stab.stable ? 'yes' : 'no', detail: stableDetail },
    {
      label: 'Invertibility',
      verdict: zeros.length === 0 ? 'yes' : zeros.every((z) => cabs(z) < 1) ? 'conditional' : 'no',
      detail: invertibleDetailDiscrete(zeros),
    },
  ];

  return {
    ok: true,
    value: {
      kind: 'discrete',
      transferLatex: `H(z) = \\dfrac{${polynomialLatex(b, 'z')}}{${polynomialLatex(a, 'z')}}`,
      poles: groupByMultiplicity(poles).map((g) => ({
        value: fmtC(g.value),
        re: g.value.re,
        im: g.value.im,
        magnitude: cabs(g.value),
        multiplicity: g.multiplicity,
      })),
      zeros: zeros.map((z) => ({ value: fmtC(z), re: z.re, im: z.im, magnitude: cabs(z) })),
      stable: stab.stable,
      stableDetail,
      timeAxis: Array.from({ length: samples }, (_, i) => i),
      impulse: h,
      step,
      freqAxis: omega,
      magnitudeDb,
      phaseDeg,
      properties,
      notes,
    },
  };
}

function isMemoryless(b: number[], a: number[]): boolean {
  const bTailZero = b.slice(1).every((v) => v === 0);
  const aTailZero = a.slice(1).every((v) => v === 0);
  return bTailZero && aTailZero;
}

function invertibleDetailDiscrete(zeros: C[]): string {
  if (zeros.length === 0) return 'There are no finite zeros, so the inverse is a pure FIR differentiator-like system and is stable.';
  const minPhase = zeros.every((z) => cabs(z) < 1);
  if (minPhase) {
    return 'All zeros are strictly inside the unit circle (minimum phase), so a causal AND stable inverse exists.';
  }
  return 'At least one zero is on or outside the unit circle: a causal inverse exists but is not stable (or cannot be realised).';
}

/* ------------------------------------------------------------------ */
/* Continuous-time systems                                            */
/* ------------------------------------------------------------------ */

export interface ContinuousSystemSpec {
  num: number[];
  den: number[];
}

export function analyzeContinuousSystem(spec: ContinuousSystemSpec, tMax = 10, samples = 801): Checked<SystemAnalysis> {
  const { num, den } = spec;
  if (den.length < 2) return { ok: false, error: 'The denominator must have degree ≥ 1 (e.g. s + 2 → “1, 2”).' };
  if (den[0] === 0) return { ok: false, error: 'The denominator’s leading coefficient must be non-zero.' };
  if (samples < 20 || samples > 8000) return { ok: false, error: 'Sample count must be between 20 and 8000.' };

  let poles: C[];
  let zeros: C[];
  try {
    poles = roots(den);
    zeros = num.length > 1 ? roots(num) : [];
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not factor the transfer function.' };
  }

  const stab = isBiboStableContinuous(den);
  const pfImpulse = partialFractions(num, den);
  if (!pfImpulse.ok) return { ok: false, error: pfImpulse.error };

  const time = Array.from({ length: samples }, (_, i) => (i * tMax) / (samples - 1));
  const h = time.map((t) => (t < 0 ? 0 : impulseAt(pfImpulse.value.terms, t)));

  // Step response: Y(s) = H(s)/s
  const stepDen = [...den, 0];
  const pfStep = partialFractions(num, stepDen);
  const step = pfStep.ok ? time.map((t) => (t < 0 ? 0 : impulseAt(pfStep.value.terms, t))) : new Array<number>(time.length).fill(NaN);

  if (h.some((v) => !Number.isFinite(v))) {
    return { ok: false, error: 'The response could not be evaluated (numerical overflow); check the pole locations.' };
  }

  const fMax = Math.max(10, 20 * Math.max(1, ...poles.map((p) => Math.abs(p.im)) || [0]));
  const omega = Array.from({ length: 601 }, (_, i) => (fMax * i) / 600);
  const magnitudeDb: number[] = [];
  const phaseDeg: number[] = [];
  for (const w of omega) {
    const reNum = evalPolyC(num, w);
    const denv = evalPolyC(den, w);
    const mag = Math.hypot(reNum.re, reNum.im) / Math.max(1e-12, Math.hypot(denv.re, denv.im));
    magnitudeDb.push(20 * Math.log10(Math.max(mag, 1e-12)));
    phaseDeg.push(((Math.atan2(reNum.im, reNum.re) - Math.atan2(denv.im, denv.re)) * 180) / Math.PI);
  }

  const stableDetail = poles.length === 0
    ? 'Constant gain: stable.'
    : stab.stable
      ? `All ${poles.length} pole(s) have strictly negative real parts (max Re{p} = ${(-stab.margin).toFixed(6)} < 0).`
      : `max Re{p} = ${(-stab.margin).toFixed(6)} ≥ 0 → the causal system is not BIBO stable.`;

  const notes: string[] = [
    'Model: rational transfer function H(s) = B(s)/A(s) with a causal (right-sided) interpretation.',
    'h(t) comes from the partial-fraction expansion of H(s); the step response uses H(s)/s. Both expansions are verified numerically.',
    'The frequency response is evaluated as H(jω) = B(jω)/A(jω) over a grid chosen from the pole locations.',
  ];
  if (pfImpulse.value.improper) {
    notes.push('The transfer function is improper (deg B ≥ deg A): the direct term corresponds to impulses at t = 0 and is not shown in the continuous plot.');
  }
  if (pfImpulse.value.poles.some((p) => p.multiplicity > 1)) {
    notes.push('Repeated poles are present: the response includes t^k·e^{pt} terms; the expansion handles them exactly.');
  }

  const properties: PropertyReport[] = [
    { label: 'Linearity', verdict: 'yes', detail: 'Assumed by the rational LTI transfer-function model.' },
    { label: 'Time invariance', verdict: 'yes', detail: 'Constant (time-invariant) coefficients.' },
    {
      label: 'Memory',
      verdict: isMemorylessContinuous(num, den) ? 'no' : 'yes',
      detail: isMemorylessContinuous(num, den) ? 'H(s) = k: y(t) = k·x(t).' : 'The response depends on past values (dynamic system).',
    },
    { label: 'Causality', verdict: 'yes', detail: 'The causal inverse Laplace transform is used, so h(t) = 0 for t < 0.' },
    { label: 'BIBO stability', verdict: stab.stable ? 'yes' : 'no', detail: stableDetail },
    {
      label: 'Invertibility',
      verdict: zeros.length === 0 ? 'yes' : zeros.every((z) => z.re < 0) ? 'conditional' : 'no',
      detail: zeros.every((z) => z.re < 0)
        ? 'All zeros lie in the open left half-plane, so the inverse 1/H(s) is causal and stable (minimum phase).'
        : 'At least one zero is in the right half-plane or on the imaginary axis: the causal inverse is unstable or not realisable.',
    },
  ];

  return {
    ok: true,
    value: {
      kind: 'continuous',
      transferLatex: `H(s) = \\dfrac{${polynomialLatex(num, 's')}}{${polynomialLatex(den, 's')}}`,
      poles: groupByMultiplicity(poles).map((g) => ({
        value: fmtC(g.value),
        re: g.value.re,
        im: g.value.im,
        magnitude: cabs(g.value),
        multiplicity: g.multiplicity,
      })),
      zeros: zeros.map((z) => ({ value: fmtC(z), re: z.re, im: z.im, magnitude: cabs(z) })),
      stable: stab.stable,
      stableDetail,
      timeAxis: time,
      impulse: h,
      step,
      freqAxis: omega,
      magnitudeDb,
      phaseDeg,
      properties,
      notes,
    },
  };
}

function impulseAt(terms: PfTerm[], t: number): number {
  return laplaceInverseAt(terms, t);
}

function evalPolyC(coeffs: number[], omega: number): C {
  // Evaluate at s = jω
  let re = 0;
  let im = 0;
  for (const c of coeffs) {
    const newRe = re * 0 - im * omega + c;
    const newIm = re * omega + im * 0;
    re = newRe;
    im = newIm;
  }
  return { re, im };
}

function isMemorylessContinuous(num: number[], den: number[]): boolean {
  return den.length === 1 && num.length === 1;
}

export function differenceEquationLatex(b: number[], a: number[]): string {
  const side = (coeffs: number[], signal: 'x' | 'y') => {
    const parts: string[] = [];
    coeffs.forEach((c, k) => {
      if (Math.abs(c) < 1e-14) return;
      const mag = Math.abs(c) === 1 && k > 0 ? '' : String(Math.abs(c));
      const idx = k === 0 ? '[n]' : `[n-${k}]`;
      const sign = c < 0 ? '−' : '+';
      parts.push(`${parts.length === 0 ? (c < 0 ? '−' : '') : ` ${sign} `}${mag}${signal}${idx}`);
    });
    return parts.length ? parts.join('') : '0';
  };
  return `${side(a, 'y')} = ${side(b, 'x')}`;
}
