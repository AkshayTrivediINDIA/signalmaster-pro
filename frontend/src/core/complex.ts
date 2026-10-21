/**
 * Minimal complex-number toolkit used by all numerical modules.
 *
 * Complex numbers are plain objects `{ re, im }`. Keeping them immutable and
 * dependency-free makes every numerical routine easy to unit test and avoids
 * pulling a large math library into the bundle for a handful of operations.
 */
export interface C {
  re: number;
  im: number;
}

export const cx = (re = 0, im = 0): C => ({ re, im });

export const cadd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
export const csub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
export const cscale = (a: C, k: number): C => ({ re: a.re * k, im: a.im * k });

export const cmul = (a: C, b: C): C => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export function cdiv(a: C, b: C): C {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new Error('Complex division by zero');
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

export const cabs = (a: C): number => Math.hypot(a.re, a.im);
export const carg = (a: C): number => Math.atan2(a.im, a.re);
export const cconj = (a: C): C => ({ re: a.re, im: -a.im });

export const cexp = (a: C): C => {
  const m = Math.exp(a.re);
  return { re: m * Math.cos(a.im), im: m * Math.sin(a.im) };
};

/** e^{iθ} without the extra multiplication – used heavily in DFT kernels. */
export const cexpI = (theta: number): C => ({ re: Math.cos(theta), im: Math.sin(theta) });

export const cfromPolar = (r: number, theta: number): C => ({ re: r * Math.cos(theta), im: r * Math.sin(theta) });

export const cisReal = (a: C): boolean => Math.abs(a.im) < 1e-12;

/** Format a complex value for display, e.g. "3.000 − 2.000j". */
export function formatComplex(a: C, digits = 4): string {
  const r = roundTo(a.re, digits);
  const i = roundTo(a.im, digits);
  if (Object.is(i, -0) || i === 0) return `${r}`;
  const sign = i < 0 ? '−' : '+';
  return `${r} ${sign} ${Math.abs(i)}j`;
}

export const roundTo = (v: number, digits = 4): number => {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};
