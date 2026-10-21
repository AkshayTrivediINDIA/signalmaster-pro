/**
 * Rational-function toolkit: polynomial arithmetic over ℂ, partial-fraction
 * expansion (with repeated poles) and time-domain responses.
 *
 * Polynomial convention: coefficients highest power first, e.g. s²+3s+2 → [1,3,2].
 *
 * Partial fractions:
 *   B(s)/A(s) = P(s) + Σ_i Σ_{k=1..m_i} r_{ik} / (s − p_i)^k
 * where p_i are the poles of A with multiplicity m_i and P is the polynomial
 * part produced by long division. The residues r_{ik} are obtained by solving
 * the exact coefficient-identity linear system, not by curve fitting, and the
 * expansion is verified against the original rational function at test points.
 *
 * Time-domain mapping (for causal, right-sided signals):
 *   ℒ⁻¹{ 1/(s−p)^k } = t^{k−1}/(k−1)! · e^{pt} u(t)
 *   𝒵⁻¹{ z^{-1}·z/(z−p)^k } = C(n−1, k−1) p^{n−k} u[n−1]
 */
import { C, cx, cadd, csub, cmul, cdiv, cscale, cabs, cexp } from './complex';
import { roots } from './poly';
import { Checked } from './validation';

export interface PoleInfo {
  pole: C;
  multiplicity: number;
}

export interface PfTerm {
  residue: C;
  pole: C;
  power: number;
}

export interface PartialFraction {
  /** Polynomial part (empty/[] when the fraction is strictly proper). */
  direct: number[];
  terms: PfTerm[];
  poles: PoleInfo[];
  /** Verification error: max |B(s)/A(s) − expansion(s)| at random test points. */
  verificationError: number;
  /** True when deg(B) ≥ deg(A) and polynomial division was applied. */
  improper: boolean;
}

/* ------------------------------------------------------------------ */
/* Complex polynomial helpers                                          */
/* ------------------------------------------------------------------ */

export function cpolyMul(a: C[], b: C[]): C[] {
  const out: C[] = Array.from({ length: a.length + b.length - 1 }, () => cx(0, 0));
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] = cadd(out[i + j], cmul(a[i], b[j]));
  return out;
}

export function cpolyEval(a: C[], z: C): C {
  let acc = cx(0, 0);
  for (const c of a) acc = cadd(cmul(acc, z), c);
  return acc;
}

export function cpolyFromRoots(r: C[]): C[] {
  let out: C[] = [cx(1, 0)];
  for (const root of r) out = cpolyMul(out, [cx(1, 0), cx(-root.re, -root.im)]);
  return out;
}

export function cpolyAdd(a: C[], b: C[]): C[] {
  const n = Math.max(a.length, b.length);
  const out: C[] = Array.from({ length: n }, () => cx(0, 0));
  for (let i = 0; i < n; i++) {
    const ai = a[a.length - 1 - i] ?? cx(0, 0);
    const bi = b[b.length - 1 - i] ?? cx(0, 0);
    out[n - 1 - i] = cadd(ai, bi);
  }
  return stripLeadingZeroC(out);
}

function stripLeadingZeroC(a: C[]): C[] {
  let i = 0;
  while (i < a.length - 1 && cabs(a[i]) < 1e-14) i++;
  return a.slice(i);
}

/** Gaussian elimination with partial pivoting on a complex system. */
export function solveComplex(A: C[][], b: C[]): Checked<C[]> {
  const n = b.length;
  if (A.length !== n) return { ok: false, error: 'Internal error: coefficient matrix is not square.' };
  const M = A.map((row) => row.map((v) => cx(v.re, v.im)));
  const rhs = b.map((v) => cx(v.re, v.im));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (cabs(M[r][col]) > cabs(M[pivot][col])) pivot = r;
    if (cabs(M[pivot][col]) < 1e-14) return { ok: false, error: 'The residue system is singular (degenerate pole structure).' };
    if (pivot !== col) {
      [M[col], M[pivot]] = [M[pivot], M[col]];
      [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    }
    const piv = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = cdiv(M[r][col], piv);
      if (cabs(factor) === 0) continue;
      for (let c2 = col; c2 < n; c2++) M[r][c2] = csub(M[r][c2], cmul(factor, M[col][c2]));
      rhs[r] = csub(rhs[r], cmul(factor, rhs[col]));
    }
  }
  const x: C[] = Array.from({ length: n }, () => cx(0, 0));
  for (let r = n - 1; r >= 0; r--) {
    let acc = rhs[r];
    for (let c2 = r + 1; c2 < n; c2++) acc = csub(acc, cmul(M[r][c2], x[c2]));
    x[r] = cdiv(acc, M[r][r]);
  }
  return { ok: true, value: x };
}

/* ------------------------------------------------------------------ */
/* Partial fractions                                                    */
/* ------------------------------------------------------------------ */

/** Group numerically close roots into poles with multiplicities. */
export function groupPoles(r: C[], tol = 1e-6): PoleInfo[] {
  const groups: PoleInfo[] = [];
  for (const root of r) {
    const scale = Math.max(1, cabs(root));
    const found = groups.find((g) => cabs(csub(g.pole, root)) < tol * scale);
    if (found) found.multiplicity++;
    else groups.push({ pole: root, multiplicity: 1 });
  }
  return groups.sort((a, b) => a.pole.re - b.pole.re || a.pole.im - b.pole.im);
}

export function partialFractions(num: number[], den: number[]): Checked<PartialFraction> {
  if (den.length < 2) return { ok: false, error: 'The denominator must have degree ≥ 1.' };
  if (den[0] === 0) return { ok: false, error: 'The denominator’s leading coefficient must be non-zero.' };

  // Polynomial long division for improper fractions
  let n = [...num];
  const d = [...den];
  const direct: number[] = [];
  let improper = false;
  if (n.length >= d.length) {
    improper = true;
    const nCopy = [...n];
    const qLen = nCopy.length - d.length + 1;
    for (let i = 0; i < qLen; i++) {
      const factor = nCopy[i] / d[0];
      direct.push(factor);
      if (factor !== 0) for (let j = 0; j < d.length; j++) nCopy[i + j] -= factor * d[j];
    }
    n = nCopy.slice(qLen);
  }
  // Strip negligible leading coefficients in the remainder
  while (n.length > 1 && Math.abs(n[0]) < 1e-14) n.shift();
  if (n.length === 0) n = [0];

  const degA = d.length - 1;
  if (degA > 40) return { ok: false, error: 'Denominator degree is limited to 40.' };

  const poleRoots = roots(d);
  const poles = groupPoles(poleRoots);

  // Special case: denominator is a constant multiple
  if (poles.length === 0) {
    return {
      ok: true,
      value: { direct, terms: [], poles: [], verificationError: 0, improper },
    };
  }

  // Unknowns indexed by (pole, 1..m)
  const unknowns: { pole: C; power: number }[] = [];
  for (const g of poles) for (let k = 1; k <= g.multiplicity; k++) unknowns.push({ pole: g.pole, power: k });

  // Basis polynomial for each unknown: (s-p)^(m-k) · Π_{j≠i}(s-p_j)^{m_j}
  const basis: C[][] = unknowns.map((u) => {
    const own = poles.findIndex((g) => cabs(csub(g.pole, u.pole)) < 1e-12);
    let poly: C[] = [cx(1, 0)];
    const repeats = poles[own].multiplicity - u.power;
    for (let r = 0; r < repeats; r++) poly = cpolyMul(poly, [cx(1, 0), cx(-u.pole.re, -u.pole.im)]);
    for (let j = 0; j < poles.length; j++) {
      if (j === own) continue;
      for (let r = 0; r < poles[j].multiplicity; r++) {
        poly = cpolyMul(poly, [cx(1, 0), cx(-poles[j].pole.re, -poles[j].pole.im)]);
      }
    }
    return poly;
  });

  // Coefficient identity B(s) = Σ x_j · basis_j(s). Row r corresponds to s^r.
  const A: C[][] = Array.from({ length: degA }, () => Array.from({ length: unknowns.length }, () => cx(0, 0)));
  for (let u = 0; u < unknowns.length; u++) {
    const poly = basis[u]; // highest power first
    for (let i = 0; i < poly.length; i++) {
      const power = poly.length - 1 - i;
      if (power >= degA) continue;
      A[power][u] = cadd(A[power][u], poly[i]);
    }
  }
  const bvec: C[] = Array.from({ length: degA }, () => cx(0, 0));
  for (let i = 0; i < n.length; i++) {
    const power = n.length - 1 - i;
    if (power >= degA) continue;
    bvec[power] = cx(bvec[power].re + n[i], bvec[power].im);
  }

  const solved = solveComplex(A, bvec);
  if (!solved.ok) return { ok: false, error: solved.error };

  const terms: PfTerm[] = unknowns.map((u, i) => ({ residue: solved.value[i], pole: u.pole, power: u.power }));

  // Verification against the original rational function at points away from poles.
  let err = 0;
  for (const test of [cx(0.37, 0.11), cx(-2.13, 0.42), cx(5.5, -1.7)]) {
    const original = cdiv(cpolyEval(num.map((v) => cx(v, 0)), test), cpolyEval(den.map((v) => cx(v, 0)), test));
    const approx = cadd(cpolyEval(direct.map((v) => cx(v, 0)), test), reconstructionAt(terms, test));
    err = Math.max(err, cabs(csub(original, approx)));
  }
  if (err > 1e-6 * Math.max(1, ...terms.map((t) => cabs(t.residue)))) {
    return { ok: false, error: `Partial-fraction expansion failed verification (error ${err.toExponential(2)}).` };
  }
  return { ok: true, value: { direct, terms, poles, verificationError: err, improper } };
}

export function reconstructionAt(terms: PfTerm[], s: C): C {
  let acc = cx(0, 0);
  for (const t of terms) {
    const base = csub(s, t.pole);
    let denom: C = cx(1, 0);
    for (let k = 0; k < t.power; k++) denom = cmul(denom, base);
    acc = cadd(acc, cdiv(t.residue, denom));
  }
  return acc;
}

/* ------------------------------------------------------------------ */
/* Time-domain responses                                               */
/* ------------------------------------------------------------------ */

/** ℒ⁻¹ of the partial fractions, evaluated at time t ≥ 0 (returns the real part). */
export function laplaceInverseAt(terms: PfTerm[], t: number): number {
  let acc = cx(0, 0);
  for (const term of terms) {
    const k = term.power;
    let coeff = term.residue;
    // t^{k-1}/(k-1)!
    let fact = 1;
    for (let i = 2; i <= k - 1; i++) fact *= i;
    const tk = t === 0 && k > 1 ? 0 : Math.pow(t, k - 1) / fact;
    coeff = cscale(coeff, tk);
    acc = cadd(acc, cmul(coeff, cexp(cscale(term.pole, t))));
  }
  return acc.re;
}

/** Sampled inverse Laplace transform of strictly-proper partial fractions. */
export function laplaceInverseSamples(terms: PfTerm[], t: number[]): number[] {
  return t.map((ti) => (ti < 0 ? 0 : laplaceInverseAt(terms, ti)));
}

/** Heaviside coverage: impulse response h(t) plus direct (impulse) part at t = 0. */
export function laplaceImpulseResponse(pf: PartialFraction, t: number[]): number[] {
  return t.map((ti) => {
    if (ti < 0) return 0;
    let v = laplaceInverseAt(pf.terms, ti);
    if (ti === 0 && pf.direct.length > 0) v += pf.direct[pf.direct.length - 1]; // δ(t) coefficient
    return v;
  });
}

/** Binomial coefficient C(n, k) for integers, 0 when out of range. */
export function binom(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Terms of the causal inverse Z-transform from a partial fraction of
 * H(z) = Σ r/(z−p)^k, using  𝒵⁻¹{ z^{-1} z/(z−p)^k } = C(n−1,k−1)p^{n−k}u[n−1].
 */
export function zInverseAt(terms: PfTerm[], n: number): number {
  let acc = 0;
  for (const term of terms) {
    if (n < 1) continue;
    const choose = binom(n - 1, term.power - 1);
    if (choose === 0) continue;
    const mag = Math.pow(cabs(term.pole), n - term.power);
    const ang = Math.atan2(term.pole.im, term.pole.re) * (n - term.power);
    const contrib = cmul(cscale(term.residue, choose), { re: mag * Math.cos(ang), im: mag * Math.sin(ang) });
    acc += contrib.re;
  }
  return acc;
}

/**
 * Convert filter coefficients in z^{-1} (b, a) to polynomials in z
 * (highest power first): a polynomial c[0]z^d + … + c[d] divided by z^d gives
 * Σ c[i] z^{-i}, so both representations share the same coefficient order once
 * they are expressed to the same degree.
 */
export function zInvToZ(b: number[], a: number[]): { num: number[]; den: number[] } {
  const P = Math.max(b.length, a.length);
  return {
    num: [...new Array(P - b.length).fill(0), ...b],
    den: [...new Array(P - a.length).fill(0), ...a],
  };
}

/** Inverse of `zInvToZ`: identical coefficient order, front-padded to equal length. */
export function zToZinv(num: number[], den: number[]): { b: number[]; a: number[] } {
  const { num: b, den: a } = zInvToZ(num, den);
  return { b, a };
}

/** Format a complex pole/zero for display, e.g. "−0.5 ± 0.866j". */
export function formatPole(p: C, digits = 4): string {
  const r = Number(p.re.toFixed(digits));
  const i = Number(Math.abs(p.im).toFixed(digits));
  if (i < 10 ** -digits) return `${r}`;
  return `${r} ± ${i}j`;
}
