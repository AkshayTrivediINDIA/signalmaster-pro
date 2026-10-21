import { C, cadd, cdiv, cmul, cabs, cx } from './complex';

/**
 * Polynomial helpers. **Convention: coefficients are ordered highest power
 * first**, matching `numpy.roots` and the `b`/`a` coefficient vectors of
 * `scipy.signal`. Example: 2s² + 3s − 5  →  [2, 3, -5].
 */

/** Evaluate a polynomial at a real point (Horner's scheme). */
export function polyvalReal(coeffs: number[], x: number): number {
  let acc = 0;
  for (const c of coeffs) acc = acc * x + c;
  return acc;
}

/** Evaluate a polynomial at a complex point. */
export function polyval(coeffs: number[], z: C): C {
  let acc = cx(0, 0);
  for (const c of coeffs) acc = cadd(cmul(acc, z), cx(c, 0));
  return acc;
}

/** Multiply two polynomials (convolution of coefficient vectors). */
export function polymul(a: number[], b: number[]): number[] {
  if (a.length === 0 || b.length === 0) return [];
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  }
  return out;
}

/** Add two polynomials (aligning on the lowest power = last element). */
export function polyadd(a: number[], b: number[]): number[] {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const ai = a[a.length - 1 - i] ?? 0;
    const bi = b[b.length - 1 - i] ?? 0;
    out[n - 1 - i] = ai + bi;
  }
  return trimTrailingZeros(out);
}

/** Polynomial long division: returns { q, r } with a = q*b + r. */
export function polydiv(a: number[], b: number[]): { q: number[]; r: number[] } {
  const num = trimLeadingZeros([...a]);
  const den = trimLeadingZeros([...b]);
  if (den.length === 1 && den[0] === 0) throw new Error('Polynomial division by the zero polynomial');
  if (num.length < den.length) return { q: [0], r: num };
  const q: number[] = new Array(num.length - den.length + 1).fill(0);
  const r = [...num];
  for (let i = 0; i < q.length; i++) {
    const factor = r[i] / den[0];
    q[i] = factor;
    if (factor !== 0) {
      for (let j = 0; j < den.length; j++) r[i + j] -= factor * den[j];
    }
  }
  return { q: trimTrailingZeros(q), r: trimTrailingZeros(r.slice(q.length)) };
}

/** Remove leading (highest-power) coefficients that are exactly zero. */
export function trimLeadingZeros(a: number[]): number[] {
  let i = 0;
  while (i < a.length - 1 && a[i] === 0) i++;
  return a.slice(i);
}

/** Remove trailing (constant-term) zeros, keeping at least one coefficient. */
export function trimTrailingZeros(a: number[]): number[] {
  const out = [...a];
  while (out.length > 1 && out[out.length - 1] === 0) out.pop();
  return out;
}

/**
 * Roots of a polynomial with real coefficients via the Durand–Kerner
 * (Weierstrass) iteration, followed by a few Newton polishing steps.
 *
 * Reliable for the modest degrees (≤ ~30) that arise from hand-entered
 * transfer functions. It is an iterative method, so results are checked
 * against a residual bound; a failure raises instead of returning nonsense.
 */
export function roots(coeffs: number[]): C[] {
  const c = trimLeadingZeros(coeffs).filter((v) => Number.isFinite(v));
  const degree = c.length - 1;
  if (degree < 1) return [];
  if (degree > 60) throw new Error('Polynomial degree too large to factor (limit 60).');

  const lead = c[0];
  const norm = c.map((v) => v / lead); // monic
  // z^n + a1 z^{n-1} + ... + an  ->  iterate z_i
  const radius = 1 + Math.max(...norm.slice(1).map(Math.abs));

  const z: C[] = [];
  const seed = cx(0.4, 0.9);
  let p: C = cx(1, 0);
  for (let i = 0; i < degree; i++) {
    p = cmul(p, seed);
    z.push({ re: p.re * radius, im: p.im * radius });
  }

  for (let iter = 0; iter < 2000; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < degree; i++) {
      let denom = cx(1, 0);
      for (let j = 0; j < degree; j++) {
        if (i === j) continue;
        denom = cmul(denom, { re: z[i].re - z[j].re, im: z[i].im - z[j].im });
      }
      if (cabs(denom) === 0) {
        z[i] = { re: z[i].re + 1e-6, im: z[i].im + 1e-6 };
        continue;
      }
      const pv = polyval(norm, z[i]);
      const delta = cdiv(pv, denom);
      z[i] = { re: z[i].re - delta.re, im: z[i].im - delta.im };
      maxDelta = Math.max(maxDelta, cabs(delta));
    }
    if (maxDelta < 1e-14 * Math.max(1, radius)) break;
  }

  // Snap near-real roots to the real axis (typical for conjugate pairs).
  const cleaned = z.map((r) => (Math.abs(r.im) < 1e-8 * Math.max(1, Math.abs(r.re)) ? cx(r.re, 0) : r));

  // Residual verification – never return a plausible-looking wrong answer.
  const scale = Math.max(...norm.map(Math.abs), 1e-12);
  for (const r of cleaned) {
    if (cabs(polyval(norm, r)) > 1e-4 * scale * (1 + cabs(r)) ** degree) {
      throw new Error('Polynomial root finding did not converge; try a different polynomial.');
    }
  }
  return sortRoots(cleaned);
}

/** Sort roots: real parts ascending, then imaginary parts ascending. */
export function sortRoots(r: C[]): C[] {
  return [...r].sort((a, b) => (Math.abs(a.re - b.re) > 1e-12 ? a.re - b.re : a.im - b.im));
}

/** Expand (z − r1)(z − r2)... into a monic real coefficient vector. */
export function polyFromRoots(rootsIn: Array<C | number>): number[] {
  let coeffs: C[] = [cx(1, 0)];
  for (const rRaw of rootsIn) {
    const r: C = typeof rRaw === 'number' ? cx(rRaw, 0) : rRaw;
    const next: C[] = new Array(coeffs.length + 1).fill(null).map(() => cx(0, 0));
    for (let i = 0; i < coeffs.length; i++) {
      next[i] = cadd(next[i], coeffs[i]);
      next[i + 1] = cadd(next[i + 1], cmul(coeffs[i], cx(-r.re, -r.im)));
    }
    coeffs = next;
  }
  return coeffs.map((v) => Math.abs(v.im) < 1e-10 ? v.re : v.re);
}

/** Strip round-off from coefficient vectors for display purposes. */
export function cleanCoeffs(c: number[], tol = 1e-12): number[] {
  return c.map((v) => (Math.abs(v) < tol ? 0 : v));
}
