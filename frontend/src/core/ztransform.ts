/**
 * Z-transform support.
 *
 * Default convention: **bilateral (two-sided)** transform
 *   X(z) = Σ_{n=−∞}^{∞} x[n] z^{−n}
 * The unilateral (one-sided) transform is the special case where x[n] = 0 for
 * n < 0; for causal sequences the two agree, which is stated wherever it
 * matters. Each table entry documents its ROC, because a Z-transform is only
 * meaningful together with its region of convergence.
 */
import { Checked } from './validation';
import { roots } from './poly';
import { partialFractions } from './rational';
import { impulseResponse } from './dsp';
import { C, cabs, formatComplex } from './complex';

export interface ZParam {
  key: string;
  label: string;
  default: number;
  hint?: string;
}

export interface ZPair {
  id: string;
  name: string;
  /** LaTeX for x[n]. */
  timeLatex: string;
  /** LaTeX for X(z). */
  zLatex: string;
  roc: string;
  params: ZParam[];
  /** Build numerator/denominator polynomials in z (highest power first). */
  build: (p: Record<string, number>) => Checked<{ num: number[]; den: number[] }>;
  notes?: string;
}

const okNum = (num: number[], den: number[]): Checked<{ num: number[]; den: number[] }> => ({ ok: true, value: { num, den } });

export const Z_PAIRS: ZPair[] = [
  {
    id: 'delta',
    name: 'Unit impulse δ[n]',
    timeLatex: '\\delta[n]',
    zLatex: '1',
    roc: 'entire z-plane',
    params: [],
    build: () => okNum([1], [1]),
  },
  {
    id: 'delayed_delta',
    name: 'Delayed impulse δ[n − k]',
    timeLatex: '\\delta[n-k]',
    zLatex: 'z^{-k}',
    roc: 'entire z-plane except z = 0 (k > 0)',
    params: [{ key: 'k', label: 'Delay k (samples)', default: 2 }],
    build: (p) => {
      const k = Math.round(p.k ?? 2);
      if (k < 0 || !Number.isInteger(k)) return { ok: false, error: 'k must be a non-negative integer.' };
      if (k > 20) return { ok: false, error: 'Delays above 20 samples are not supported in this table.' };
      return okNum([1], [1, ...new Array(k).fill(0)]);
    },
  },
  {
    id: 'step',
    name: 'Unit step u[n]',
    timeLatex: 'u[n]',
    zLatex: '\\dfrac{z}{z-1}',
    roc: '|z| > 1',
    params: [],
    build: () => okNum([1, 0], [1, -1]),
  },
  {
    id: 'ramp',
    name: 'Ramp n·u[n]',
    timeLatex: 'n\\,u[n]',
    zLatex: '\\dfrac{z}{(z-1)^{2}}',
    roc: '|z| > 1',
    params: [],
    build: () => okNum([1, 0], [1, -2, 1]),
  },
  {
    id: 'geometric',
    name: 'Geometric aⁿ·u[n]',
    timeLatex: 'a^{n}u[n]',
    zLatex: '\\dfrac{z}{z-a}',
    roc: '|z| > |a|',
    params: [{ key: 'a', label: 'a', default: 0.5 }],
    build: (p) => okNum([1, 0], [1, -(p.a ?? 0.5)]),
  },
  {
    id: 'n_geometric',
    name: 'n·aⁿ·u[n]',
    timeLatex: 'n\\,a^{n}u[n]',
    zLatex: '\\dfrac{az}{(z-a)^{2}}',
    roc: '|z| > |a|',
    params: [{ key: 'a', label: 'a', default: 0.5 }],
    build: (p) => {
      const a = p.a ?? 0.5;
      return okNum([a, 0], [1, -2 * a, a * a]);
    },
  },
  {
    id: 'cosine',
    name: 'cos(ω₀n)·u[n]',
    timeLatex: '\\cos(\\omega_0 n)u[n]',
    zLatex: '\\dfrac{z(z-\\cos\\omega_0)}{z^{2}-2z\\cos\\omega_0+1}',
    roc: '|z| > 1',
    params: [{ key: 'w', label: 'ω₀ (rad/sample)', default: Math.PI / 4 }],
    build: (p) => {
      const w = p.w ?? Math.PI / 4;
      const c = Math.cos(w);
      return okNum([1, -c], [1, -2 * c, 1]);
    },
  },
  {
    id: 'sine',
    name: 'sin(ω₀n)·u[n]',
    timeLatex: '\\sin(\\omega_0 n)u[n]',
    zLatex: '\\dfrac{z\\sin\\omega_0}{z^{2}-2z\\cos\\omega_0+1}',
    roc: '|z| > 1',
    params: [{ key: 'w', label: 'ω₀ (rad/sample)', default: Math.PI / 4 }],
    build: (p) => {
      const w = p.w ?? Math.PI / 4;
      const c = Math.cos(w);
      return okNum([Math.sin(w), 0], [1, -2 * c, 1]);
    },
  },
  {
    id: 'damped_cosine',
    name: 'aⁿcos(ω₀n)·u[n]',
    timeLatex: 'a^{n}\\cos(\\omega_0 n)u[n]',
    zLatex: '\\dfrac{z(z-a\\cos\\omega_0)}{z^{2}-2az\\cos\\omega_0+a^{2}}',
    roc: '|z| > |a|',
    params: [
      { key: 'a', label: 'a', default: 0.8 },
      { key: 'w', label: 'ω₀ (rad/sample)', default: Math.PI / 4 },
    ],
    build: (p) => {
      const a = p.a ?? 0.8;
      const w = p.w ?? Math.PI / 4;
      const c = Math.cos(w);
      return okNum([1, -a * c], [1, -2 * a * c, a * a]);
    },
  },
  {
    id: 'damped_sine',
    name: 'aⁿsin(ω₀n)·u[n]',
    timeLatex: 'a^{n}\\sin(\\omega_0 n)u[n]',
    zLatex: '\\dfrac{za\\sin\\omega_0}{z^{2}-2az\\cos\\omega_0+a^{2}}',
    roc: '|z| > |a|',
    params: [
      { key: 'a', label: 'a', default: 0.8 },
      { key: 'w', label: 'ω₀ (rad/sample)', default: Math.PI / 4 },
    ],
    build: (p) => {
      const a = p.a ?? 0.8;
      const w = p.w ?? Math.PI / 4;
      const c = Math.cos(w);
      return okNum([a * Math.sin(w), 0], [1, -2 * a * c, a * a]);
    },
  },
];

export interface ZPoleZeroReport {
  poles: { value: string; re: number; im: number; magnitude: number; multiplicity: number }[];
  zeros: { value: string; re: number; im: number; magnitude: number }[];
  stable: boolean;
  maxMagnitude: number;
  notes: string[];
}

/** Poles/zeros of X(z) = num(z)/den(z) plus stability of the causal interpretation. */
export function poleZeroDiscrete(num: number[], den: number[]): Checked<ZPoleZeroReport> {
  if (den.length < 1) return { ok: false, error: 'A denominator is required.' };
  if (den[0] === 0) return { ok: false, error: 'The leading coefficient of the denominator must be non-zero.' };
  if (den.length === 1) {
    // Constant (degree-0) denominator: a pure gain, with no finite poles.
    const gain = num[0] / den[0];
    return {
      ok: true,
      value: {
        poles: [],
        // A constant denominator leaves only finite zeros from the numerator.
        zeros: num.length > 1 ? roots(num).map((v) => ({ value: formatComplex(v), re: v.re, im: v.im, magnitude: cabs(v) })) : [],
        stable: true,
        maxMagnitude: 0,
        notes: [
          'The transform has a constant denominator, so there are no finite poles: the sequence is a finite-length (FIR) sequence or a scaled impulse.',
          `Constant gain factor: ${gain}.`,
        ],
      },
    };
  }
  let p: C[];
  let z: C[];
  try {
    p = roots(den);
    z = num.length > 1 ? roots(num) : [];
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not factor the polynomials.' };
  }
  const maxMag = p.length ? Math.max(...p.map(cabs)) : 0;
  const notes: string[] = [];
  notes.push('Poles are plotted in the z-plane; the shaded unit circle marks |z| = 1.');
  if (maxMag < 1) notes.push('All poles strictly inside the unit circle → the causal system is BIBO stable.');
  else if (maxMag === 1) notes.push('A pole lies exactly on the unit circle (marginally stable: bounded but not absolutely summable impulse response).');
  else notes.push('At least one pole lies outside the unit circle → the causal system is unstable.');
  notes.push('Stability applies to the causal ROC (|z| > max|pole|). A different ROC would describe a different sequence with different stability properties.');
  return {
    ok: true,
    value: {
      poles: groupByMultiplicity(p).map((g) => ({
        value: formatComplex(g.value),
        re: g.value.re,
        im: g.value.im,
        magnitude: cabs(g.value),
        multiplicity: g.multiplicity,
      })),
      zeros: z.map((v) => ({ value: formatComplex(v), re: v.re, im: v.im, magnitude: cabs(v) })),
      stable: maxMag < 1,
      maxMagnitude: maxMag,
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

export interface ZAnalysis {
  report: ZPoleZeroReport;
  /** Causal inverse transform sequence h[n], n = 0 … len−1, computed by recursion. */
  sequence: number[];
  /** Closed-form residues (only when the transform is a proper rational function). */
  termsLatex: string[];
  notes: string[];
  /** Cross-check: max |closed form − recursion| over the computed samples. */
  crossCheckError: number;
}

/**
 * Inverse Z-transform of a rational H(z) = num(z)/den(z).
 * The sequence is produced by exact recursion (impulse response of the
 * difference equation). When a partial-fraction expansion is available, the
 * closed form is cross-checked against the recursion so a wrong expansion can
 * never be displayed silently.
 */
export function analyzeInverseZ(num: number[], den: number[], samples = 30): Checked<ZAnalysis> {
  if (den.length < 1) return { ok: false, error: 'Enter a denominator in z of degree ≥ 0, e.g. z² − 0.5z → “1, -0.5, 0”.' };
  if (den[0] === 0) return { ok: false, error: 'The leading coefficient of the denominator must be non-zero.' };
  if (samples < 2 || samples > 4096) return { ok: false, error: 'Sample count must be between 2 and 4096.' };
  const report = poleZeroDiscrete(num, den);
  if (!report.ok) return { ok: false, error: report.error };

  // H(z) with num/den in z → filter coefficients in z^{-1}.
  // A polynomial c[0]z^d + … + c[d] divided by z^d gives Σ c[i] z^{-i}, so the
  // arrays are used as-is once both are expressed to the same degree (front
  // zero-padding preserves the degree).
  const P = Math.max(num.length, den.length);
  const b = [...new Array(P - num.length).fill(0), ...num];
  const a = [...new Array(P - den.length).fill(0), ...den];
  const seq = Array.from(impulseResponse({ b, a }, samples));

  const notes: string[] = [
    'The sequence below is the **causal** inverse-transform result, obtained by exact recursion of the difference equation (not by numerical inversion).',
    'Bilateral vs unilateral: for a causal sequence (x[n] = 0 for n < 0) both transforms coincide. For a two-sided sequence the ROC and the inverse differ — that case is not supported here.',
  ];

  // Closed form via partial fractions of H(z)/z (so terms are z/(z−p))
  let termsLatex: string[] = [];
  let crossCheckError = 0;
  const pf = partialFractions(num, den);
  if (pf.ok && !pf.value.improper && pf.value.terms.length > 0 && pf.value.poles.every((p) => p.multiplicity === 1)) {
    // h[n] = Σ r_k p_k^{n-1} u[n-1] for terms of 1/(z-p)
    const terms = pf.value.terms;
    let maxErr = 0;
    for (let n = 0; n < Math.min(samples, 25); n++) {
      let acc = 0;
      for (const t of terms) {
        if (n < 1) continue;
        const mag = Math.pow(cabs(t.pole), n - 1);
        const ang = Math.atan2(t.pole.im, t.pole.re) * (n - 1);
        acc += t.residue.re * mag * Math.cos(ang) - t.residue.im * mag * Math.sin(ang);
      }
      maxErr = Math.max(maxErr, Math.abs(acc - seq[n]));
    }
    crossCheckError = maxErr;
    if (maxErr < 1e-6 * Math.max(1, Math.max(...seq.map(Math.abs)))) {
      termsLatex = terms.map((t) => `${formatComplex(t.residue, 4)} \\cdot \\dfrac{z}{z-(${formatComplex(t.pole, 4)})}`);
      notes.push(`Closed form verified against the recursion (max difference ${maxErr.toExponential(2)}).`);
    } else {
      notes.push('The closed-form partial-fraction expression could not be verified against the recursion, so it is withheld.');
    }
  } else if (!pf.ok) {
    notes.push('A closed form was not produced: ' + pf.error);
  } else {
    notes.push('A closed form is not shown for repeated poles or improper fractions; the recursion result is still exact.');
  }

  return { ok: true, value: { report: report.value, sequence: seq, termsLatex, notes, crossCheckError } };
}
