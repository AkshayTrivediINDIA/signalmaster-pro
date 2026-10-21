import { C, cx, cexpI, cdiv, cadd, cmul, cabs } from './complex';
import { fft, ifft } from './fft';
import { polyval, roots } from './poly';

/** Maximum output length accepted by the convolution lab (memory guard). */
export const MAX_CONV_OUTPUT = 200_000;

/**
 * Linear (acyclic) convolution of two finite sequences, full result.
 *   y[n] = Σ_k x[k] h[n−k],  n = 0 … (N+M−2)
 * Index origins are handled by the caller (see features/convolution).
 */
export function convolveLinear(x: ArrayLike<number>, h: ArrayLike<number>): Float64Array {
  const N = x.length;
  const M = h.length;
  if (N === 0 || M === 0) return new Float64Array(0);
  if (N + M - 1 > MAX_CONV_OUTPUT) {
    throw new Error(`Convolution output would have ${N + M - 1} samples, above the ${MAX_CONV_OUTPUT} sample limit.`);
  }
  const y = new Float64Array(N + M - 1);
  for (let i = 0; i < N; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    for (let j = 0; j < M; j++) y[i + j] += xi * h[j];
  }
  return y;
}

/**
 * Circular convolution modulo N.
 *   y[n] = Σ_{k=0}^{N−1} x_N[k] · h_N[(n−k) mod N]
 * Sequences shorter than N are zero-padded, longer ones are truncated
 * (truncation is reported to the caller so it can warn the user).
 */
export function convolveCircular(x: ArrayLike<number>, h: ArrayLike<number>, N?: number): Float64Array {
  const len = N ?? Math.max(x.length, h.length);
  if (len <= 0) return new Float64Array(0);
  if (len > MAX_CONV_OUTPUT) throw new Error(`Circular convolution length ${len} exceeds the ${MAX_CONV_OUTPUT} sample limit.`);
  const xp = new Float64Array(len);
  const hp = new Float64Array(len);
  for (let i = 0; i < Math.min(len, x.length); i++) xp[i] = x[i];
  for (let i = 0; i < Math.min(len, h.length); i++) hp[i] = h[i];

  if (len > 256) {
    const X = fft(Array.from(xp, (v) => cx(v, 0)));
    const H = fft(Array.from(hp, (v) => cx(v, 0)));
    const Y = X.map((v, i) => cmul(v, H[i]));
    const y = ifft(Y);
    return Float64Array.from(y.map((v) => v.re));
  }
  const y = new Float64Array(len);
  for (let n = 0; n < len; n++) {
    let acc = 0;
    for (let k = 0; k < len; k++) {
      acc += xp[k] * hp[(n - k + len * 2) % len];
    }
    y[n] = acc;
  }
  return y;
}

export interface FilterCoeffs {
  /** Feed-forward coefficients b[0..P] of  Σ b_k x[n−k]. */
  b: number[];
  /** Feedback coefficients a[0..Q] of  Σ a_k y[n−k]  (a[0] ≠ 0). */
  a: number[];
}

/**
 * Direct-form II transposed IIR difference equation, zero initial state.
 *   Σ_{k} a_k y[n−k] = Σ_{k} b_k x[n−k]
 * Returns exactly `input.length + tail` output samples.
 */
export function lfilter(f: FilterCoeffs, input: ArrayLike<number>, tail = 0): Float64Array {
  const { b, a } = f;
  if (a.length === 0 || a[0] === 0) throw new Error('a[0] (the y[n] coefficient) must be non-zero.');
  const numCoeffs = Math.max(a.length, b.length);
  const order = numCoeffs - 1; // number of delay elements
  const aN = Array.from({ length: numCoeffs }, (_, i) => (a[i] ?? 0) / a[0]);
  const bN = Array.from({ length: numCoeffs }, (_, i) => (b[i] ?? 0) / a[0]);
  const total = input.length + tail;
  const y = new Float64Array(total);
  if (order === 0) {
    for (let n = 0; n < total; n++) y[n] = bN[0] * (n < input.length ? input[n] : 0);
    return y;
  }
  const z = new Float64Array(order); // transposed direct-form II states
  for (let n = 0; n < total; n++) {
    const xn = n < input.length ? input[n] : 0;
    const yn = bN[0] * xn + z[0];
    y[n] = yn;
    for (let i = 0; i < order - 1; i++) {
      z[i] = bN[i + 1] * xn + z[i + 1] - aN[i + 1] * yn;
    }
    z[order - 1] = bN[order] * xn - aN[order] * yn;
  }
  return y;
}

/** Discrete impulse response h[n], n = 0 … n-1. */
export const impulseResponse = (f: FilterCoeffs, n: number): Float64Array => {
  const x = new Float64Array(n);
  if (n > 0) x[0] = 1;
  return lfilter(f, x);
};

/** Discrete unit-step response, n = 0 … n-1. */
export const stepResponse = (f: FilterCoeffs, n: number): Float64Array => {
  const x = new Float64Array(n).fill(1);
  return lfilter(f, x);
};

/**
 * Frequency response of a rational discrete-time system at ω (rad/sample):
 *   H(e^{jω}) = B(e^{jω}) / A(e^{jω}),  with B(z) = Σ b_k z^{−k}.
 */
export function freqzAt(f: FilterCoeffs, w: number): C {
  const z = cexpI(-w);
  return cdiv(evalZPoly(f.b, z), evalZPoly(f.a, z));
}

/** Evaluate Σ c_k z^{−k} using Horner's scheme in 1/z. */
export function evalZPoly(c: number[], zinv: C): C {
  let acc = cx(0, 0);
  for (const k of c) acc = cadd(cmul(acc, zinv), cx(k, 0));
  return acc;
}

/** Frequency response over an ω grid. */
export function freqz(f: FilterCoeffs, w: number[]): C[] {
  return w.map((wi) => freqzAt(f, wi));
}

/** Continuous-time frequency response H(jω) of B(s)/A(s). */
export function freqs(coeffB: number[], coeffA: number[], omega: number): C {
  return cdiv(polyval(coeffB, cx(0, omega)), polyval(coeffA, cx(0, omega)));
}

/** Poles of a rational discrete system in z (roots of Σ a_k z^{P−k}). */
export const discretePoles = (a: number[]) => roots(a);
/** Zeros of a rational discrete system in z. */
export const discreteZeros = (b: number[]) => roots(b);

/** |z| for every root. */
export const magnitudes = (r: C[]): number[] => r.map(cabs);

/**
 * BIBO stability of a **causal** rational LTI system: every pole strictly
 * inside the unit circle.
 */
export function isBiboStableDiscrete(a: number[]): { stable: boolean; margin: number } {
  const p = discretePoles(a);
  if (p.length === 0) return { stable: true, margin: Infinity };
  const maxMag = Math.max(...p.map(cabs));
  return { stable: maxMag < 1, margin: 1 - maxMag };
}

/** BIBO stability of a **causal** continuous-time rational system: all poles in the open LHP. */
export function isBiboStableContinuous(a: number[]): { stable: boolean; margin: number } {
  const p = roots(a);
  if (p.length === 0) return { stable: true, margin: Infinity };
  const maxRe = Math.max(...p.map((r) => r.re));
  return { stable: maxRe < 0, margin: -maxRe };
}

/** Trailing-sample energy used to sanity-check decay in time-domain responses. */
export function tailEnergy(y: ArrayLike<number>, fraction = 0.1): number {
  const n = y.length;
  const start = Math.floor(n * (1 - fraction));
  let e = 0;
  for (let i = start; i < n; i++) e += y[i] * y[i];
  return Math.sqrt(e / Math.max(1, n - start));
}
