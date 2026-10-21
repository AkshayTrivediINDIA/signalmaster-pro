/**
 * Convolution lab core.
 *
 * Linear convolution (finite sequences with an index origin):
 *   (x * h)[n] = Σ_k x[k]·h[n − k]
 * For x supported on [Nx0, Nx0+N−1] and h on [Nh0, Nh0+M−1] the result is
 * supported on [Nx0+Nh0, Nx0+Nh0+N+M−2]  (length N+M−1).
 *
 * Circular convolution modulo N:
 *   y[n] = Σ_{k=0}^{N−1} x[((k))_N] · h[((n − k))_N]
 * Circular convolution is periodic, so a single "index origin" is a display
 * choice; the lab reports it explicitly (default 0).
 *
 * Continuous-time convolution is *approximated* by a Riemann sum
 *   y(t) ≈ Δτ · Σ_k x(kΔτ)·h(t − kΔτ)
 * which converges to the integral as Δτ → 0. The approximation error is
 * O(Δτ) for piecewise-smooth signals; the lab reports Δτ and the sample count.
 */
import { convolveLinear, convolveCircular, MAX_CONV_OUTPUT } from './dsp';
import { Signal } from './signals';
import { LIMITS, Checked } from './validation';

export interface SequenceInput {
  values: number[];
  /** Index of the first sample (n₀). */
  origin: number;
}

export interface ConvStepTerm {
  k: number;
  xValue: number;
  hIndex: number;
  hValue: number;
  product: number;
}

export interface ConvStep {
  n: number;
  terms: ConvStepTerm[];
  sum: number;
}

export interface LinearConvResult {
  values: number[];
  /** Index n of values[0]. */
  origin: number;
  steps: ConvStep[];
  /** Convolution of the full sequences, index-aligned. */
  axis: number[];
}

export interface LinearConvOptions {
  /** Number of output samples for which a step-by-step breakdown is produced. */
  stepCount?: number;
  /** 'full' | 'same' (centred on x's support) | 'valid' */
  mode?: 'full' | 'same' | 'valid';
}

export function linearConvolution(x: SequenceInput, h: SequenceInput, options: LinearConvOptions = {}): Checked<LinearConvResult> {
  if (x.values.length === 0 || h.values.length === 0) {
    return { ok: false, error: 'Both sequences need at least one sample.' };
  }
  if (x.values.length > LIMITS.SEQ_LENGTH || h.values.length > LIMITS.SEQ_LENGTH) {
    return { ok: false, error: `Sequences are limited to ${LIMITS.SEQ_LENGTH} samples each.` };
  }
  let y: Float64Array;
  try {
    y = convolveLinear(x.values, h.values);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Convolution failed.' };
  }
  const origin = x.origin + h.origin;
  const fullAxis = Array.from(y, (_, i) => origin + i);

  let values = Array.from(y);
  let outOrigin = origin;

  if (options.mode === 'same') {
    // Keep the same number of samples as x, aligned with x's index range.
    const startIdx = x.origin - origin;
    values = values.slice(startIdx, startIdx + x.values.length);
    outOrigin = x.origin;
  } else if (options.mode === 'valid') {
    const n = Math.max(x.values.length, h.values.length) - Math.min(x.values.length, h.values.length) + 1;
    if (n <= 0) return { ok: false, error: '“valid” convolution requires the shorter sequence to be no longer than the other.' };
    if (x.values.length >= h.values.length) {
      const startIdx = h.values.length - 1;
      values = values.slice(startIdx, startIdx + n);
      outOrigin = origin + startIdx;
    } else {
      const startIdx = x.values.length - 1;
      values = values.slice(startIdx, startIdx + n);
      outOrigin = origin + startIdx;
    }
  }

  const steps = buildSteps(x, h, outOrigin + values.length - 1, options.stepCount ?? 8);
  return {
    ok: true,
    value: { values, origin: outOrigin, steps, axis: fullAxis.length === values.length ? fullAxis : Array.from(values, (_, i) => outOrigin + i) },
  };
}

/** Build the tabular breakdown y[n] = Σ x[k] h[n−k] for the first `count` output indices. */
function buildSteps(x: SequenceInput, h: SequenceInput, maxN: number, count: number): ConvStep[] {
  const steps: ConvStep[] = [];
  const yLen = x.values.length + h.values.length - 1;
  const nStart = x.origin + h.origin;
  const limit = Math.min(count, yLen, maxN - nStart + 1);
  for (let idx = 0; idx < limit; idx++) {
    const n = nStart + idx;
    const terms: ConvStepTerm[] = [];
    for (let k = 0; k < x.values.length; k++) {
      const kk = x.origin + k;
      const hIdx = n - kk; // absolute index into h
      const hOffset = hIdx - h.origin;
      if (hOffset >= 0 && hOffset < h.values.length) {
        const hValue = h.values[hOffset];
        const xValue = x.values[k];
        terms.push({ k: kk, xValue, hIndex: hIdx, hValue, product: xValue * hValue });
      }
    }
    const sum = terms.reduce((acc, t) => acc + t.product, 0);
    steps.push({ n, terms, sum });
  }
  return steps;
}

export interface CircularConvResult {
  values: number[];
  origin: number;
  /** True when one of the inputs had to be zero-padded to length N. */
  padded: boolean;
  /** True when an input was truncated because it was longer than N. */
  truncated: boolean;
  steps: ConvStep[];
}

export function circularConvolution(x: SequenceInput, h: SequenceInput, N: number): Checked<CircularConvResult> {
  if (!Number.isInteger(N) || N < 1) return { ok: false, error: 'The circular convolution length N must be a positive integer.' };
  if (N > MAX_CONV_OUTPUT) return { ok: false, error: `N is limited to ${MAX_CONV_OUTPUT}.` };
  if (x.values.length === 0 || h.values.length === 0) return { ok: false, error: 'Both sequences need at least one sample.' };
  const truncated = x.values.length > N || h.values.length > N;
  const padded = x.values.length < N || h.values.length < N;
  let y: Float64Array;
  try {
    y = convolveCircular(x.values, h.values, N);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Circular convolution failed.' };
  }
  const values = Array.from(y);
  // Steps use the zero-padded, length-N sequences with origin 0.
  const xp: SequenceInput = { values: padOrTrunc(x.values, N), origin: 0 };
  const hp: SequenceInput = { values: padOrTrunc(h.values, N), origin: 0 };
  const steps: ConvStep[] = [];
  const count = Math.min(8, N);
  for (let n = 0; n < count; n++) {
    const terms: ConvStepTerm[] = [];
    for (let k = 0; k < N; k++) {
      const hIdx = ((n - k) % N + N) % N;
      terms.push({ k, xValue: xp.values[k], hIndex: hIdx, hValue: hp.values[hIdx], product: xp.values[k] * hp.values[hIdx] });
    }
    steps.push({ n, terms, sum: terms.reduce((a, t) => a + t.product, 0) });
  }
  return { ok: true, value: { values, origin: 0, padded, truncated, steps } };
}

function padOrTrunc(v: number[], N: number): number[] {
  const out = new Array<number>(N).fill(0);
  for (let i = 0; i < Math.min(N, v.length); i++) out[i] = v[i];
  return out;
}

export interface CTConvResult {
  axis: number[];
  values: number[];
  dt: number;
  samples: number;
}

/**
 * Numerical continuous-time convolution of two sampled signals.
 * Requires both signals to be continuous-domain renderings on uniform grids;
 * the common step is the coarser of the two, and both are resampled onto it.
 */
export function continuousConvolution(a: Signal, b: Signal): Checked<CTConvResult> {
  if (a.domain !== 'continuous' || b.domain !== 'continuous') {
    return {
      ok: false,
      error: 'Numerical continuous-time convolution needs two continuous-time signals. Use linear convolution for discrete sequences.',
    };
  }
  if (a.axis.length < 2 || b.axis.length < 2) return { ok: false, error: 'Both signals need at least two samples.' };

  const dtA = (a.axis[a.axis.length - 1] - a.axis[0]) / (a.axis.length - 1);
  const dtB = (b.axis[b.axis.length - 1] - b.axis[0]) / (b.axis.length - 1);
  const dt = Math.max(dtA, dtB);
  if (!(dt > 0) || !Number.isFinite(dt)) return { ok: false, error: 'Invalid sampling interval in the input signals.' };

  const start = Math.min(a.axis[0], b.axis[0]);
  const stop = Math.max(a.axis[a.axis.length - 1], b.axis[b.axis.length - 1]);
  const n = Math.round((stop - start) / dt) + 1;
  if (n > LIMITS.CT_POINTS) {
    return {
      ok: false,
      error: `The common grid would need ${n} samples (limit ${LIMITS.CT_POINTS}). Increase the time step by lowering the sample count.`,
    };
  }
  const grid = Array.from({ length: n }, (_, i) => start + i * dt);
  const av = resampleUniform(a, grid);
  const bv = resampleUniform(b, grid);
  if (!av || !bv) return { ok: false, error: 'Signals are not defined over the full overlapping grid.' };

  let y: Float64Array;
  try {
    y = convolveLinear(av, bv);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Convolution failed.' };
  }
  // y(t) = ∫ x(τ)h(t−τ)dτ ≈ dt · Σ_k x[k]h[n−k]
  // (the discrete sum already includes both sample sets, so exactly one Δτ).
  const values = Array.from(y, (v) => v * dt);
  const axisStart = 2 * start;
  const axis = Array.from(values, (_, i) => axisStart + i * dt);
  return { ok: true, value: { axis, values, dt, samples: n } };
}

/** Resample a continuous signal onto a uniform grid; returns null if it does not cover the grid. */
function resampleUniform(s: Signal, grid: number[]): number[] | null {
  const t0 = s.axis[0];
  const t1 = s.axis[s.axis.length - 1];
  const dt = (t1 - t0) / (s.axis.length - 1);
  const out = new Array<number>(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const t = grid[i];
    if (t < t0 - 1e-9 || t > t1 + 1e-9) {
      out[i] = 0;
      continue;
    }
    const pos = (t - t0) / dt;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, s.axis.length - 1);
    const frac = pos - i0;
    out[i] = s.values[i0] * (1 - frac) + s.values[i1] * frac;
  }
  return out;
}
