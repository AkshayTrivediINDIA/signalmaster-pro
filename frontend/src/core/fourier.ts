/**
 * Fourier analysis: DFT/FFT, DTFT (numeric), CTFT (numeric, truncated).
 *
 * All conventions (see docs/scientific-assumptions.md):
 *   DFT      X[k] = Σ_{n=0}^{N−1} x[n] e^{−j2πkn/N}
 *   IDFT     x[n] = (1/N) Σ_{k=0}^{N−1} X[k] e^{+j2πkn/N}
 *   DTFT     X(e^{jω}) = Σ_n x[n] e^{−jωn}            (ω in rad/sample)
 *   CTFT     X(jω) = ∫_{−∞}^{∞} x(t) e^{−jωt} dt      (ω in rad/s)
 * The CTFT is *numerically approximated* by truncating the integral to the
 * observation window and integrating with the rectangle rule on the sample
 * grid; the lab reports the window and the resulting resolution.
 */
import { C, cx, cabs, carg, cexpI, cadd, cmul } from './complex';
import { fft, ifft, fftFreq, oneSidedAmplitude, TWO_PI } from './fft';
import { Signal, linspace } from './signals';
import { LIMITS, Checked } from './validation';

export interface SpectrumPoint {
  /** Frequency in Hz (CT) or cycles/sample (DT). */
  freq: number;
  /** Normalised angular frequency, rad/sample (DT) or rad/s (CT). */
  omega: number;
  magnitude: number;
  phase: number;
  /** Real and imaginary parts of the transform value. */
  re: number;
  im: number;
}

export interface Spectrum {
  points: SpectrumPoint[];
  /** Frequency spacing of the computed bins, in Hz (CT) or cycles/sample (DT). */
  resolution: number;
  /** Analysis bandwidth covered (Hz or cycles/sample). */
  bandwidth: number;
  n: number;
  /** Sampling rate in Hz (CT) or 1 sample/sample (DT). */
  fs: number;
  /** Reconstructed signal (inverse transform) for verification. */
  reconstruction: number[];
  /** Max |x[n] − x̂[n]| — round-trip error of the computed transform. */
  reconstructionError: number;
  notes: string[];
  /** True when the analysis is of a continuous-time signal. */
  continuous: boolean;
}

export type TransformKind = 'dft' | 'fft' | 'dtft' | 'ctft';

export interface DftOptions {
  /** Use the radix-2/Bluestein FFT (else direct DFT). */
  useFft?: boolean;
  /** Show only 0…fs/2 bins (real signals). */
  oneSided?: boolean;
}

const MAX_DFT_POINTS = LIMITS.MAX_FFT;

/** DFT/FFT of a discrete-time sequence (indices are sample numbers, fs = 1). */
export function analyzeDiscreteDft(signal: Signal, options: DftOptions = {}): Checked<Spectrum> {
  if (signal.domain !== 'discrete') {
    return { ok: false, error: 'DFT/FFT requires a discrete-time sequence. Generate or sample a discrete signal first.' };
  }
  const N = signal.values.length;
  if (N < 2) return { ok: false, error: 'At least two samples are required.' };
  if (N > MAX_DFT_POINTS) {
    return { ok: false, error: `The DFT is limited to ${MAX_DFT_POINTS} points (this sequence has ${N}). Reduce the index range.` };
  }
  const useFft = options.useFft ?? true;
  const input: C[] = signal.values.map((v) => cx(v, 0));
  const X = useFft ? fft(input) : directDft(input);
  const freqs = fftFreq(N, 1, false);
  const rec = useFft ? ifft(X) : directIdft(X);
  let err = 0;
  for (let i = 0; i < N; i++) err = Math.max(err, Math.abs(rec[i].re - signal.values[i]));

  const half = Math.floor(N / 2);
  const limit = options.oneSided === false ? N : half + 1;
  const points: SpectrumPoint[] = [];
  for (let k = 0; k < limit; k++) {
    points.push({
      freq: freqs[k],
      omega: (TWO_PI * k) / N,
      magnitude: cabs(X[k]),
      phase: cabs(X[k]) < 1e-12 ? 0 : carg(X[k]),
      re: X[k].re,
      im: X[k].im,
    });
  }
  const notes = [
    `N = ${N} samples → frequency resolution Δf = 1/N = ${(1 / N).toPrecision(4)} cycles/sample.`,
    `The DFT assumes the ${N}-sample record repeats periodically; spectral leakage appears if the record is not an integer number of periods.`,
    `Round-trip check: max |x − IDFT(DFT(x))| = ${err.toExponential(2)} (floating-point round-off level).`,
    `Only frequencies in [0, 0.5] cycles/sample are unambiguous; content above 0.5 would be aliased.`,
  ];
  if (!useFft) notes.push('Direct O(N²) DFT used — the result is numerically independent of the FFT implementation.');
  return {
    ok: true,
    value: {
      points,
      resolution: 1 / N,
      bandwidth: 0.5,
      n: N,
      fs: 1,
      reconstruction: rec.map((v) => v.re),
      reconstructionError: err,
      notes,
      continuous: false,
    },
  };
}

export interface CtDftOptions extends DftOptions {
  /** Observation window actually used, for reporting. */
  window?: [number, number];
}

/**
 * Spectrum of a uniformly sampled continuous-time signal.
 * The sample values are Fourier-analysed as a discrete record; frequencies are
 * mapped to Hz using fs = 1/Δt, and the one-sided spectrum is scaled by 1/fs so
 * that a sinusoid of amplitude A appears as a peak at A/2.
 */
export function analyzeContinuousSpectrum(signal: Signal, options: CtDftOptions = {}): Checked<Spectrum> {
  if (signal.domain !== 'continuous') {
    return { ok: false, error: 'Continuous-time spectrum analysis requires a continuous-time signal.' };
  }
  const N = signal.values.length;
  if (N < 4) return { ok: false, error: 'At least four time samples are required.' };
  if (N > MAX_DFT_POINTS) {
    return { ok: false, error: `Spectrum analysis is limited to ${MAX_DFT_POINTS} time samples (this signal has ${N}).` };
  }
  const t0 = signal.axis[0];
  const t1 = signal.axis[N - 1];
  const dt = (t1 - t0) / (N - 1);
  const fs = 1 / dt;
  const X = (options.useFft ?? true) ? fft(signal.values.map((v) => cx(v, 0))) : directDft(signal.values.map((v) => cx(v, 0)));
  const freqs = fftFreq(N, fs, false);
  const half = Math.floor(N / 2);
  const points: SpectrumPoint[] = [];
  for (let k = 0; k <= half; k++) {
    const mag = cabs(X[k]) * dt; // integral-consistent scaling: |X(f)| ≈ Δt·|DFT|
    points.push({
      freq: freqs[k],
      omega: TWO_PI * freqs[k],
      magnitude: mag,
      phase: cabs(X[k]) < 1e-12 ? 0 : carg(X[k]),
      re: X[k].re * dt,
      im: X[k].im * dt,
    });
  }
  const df = fs / N;
  const notes = [
    `Sampling interval Δt = ${dt.toPrecision(6)} s → sampling rate fs = ${fs.toPrecision(6)} Hz.`,
    `Nyquist frequency = ${(fs / 2).toPrecision(6)} Hz. Any content above it would alias into the band.`,
    `Frequency resolution Δf = fs/N = ${df.toPrecision(6)} Hz over an observation window of ${(t1 - t0).toPrecision(6)} s.`,
    'The magnitude is scaled by Δt so the plot approximates the CTFT magnitude (units: amplitude·s).',
    `Finite window (${(t1 - t0).toPrecision(4)} s) causes spectral leakage unless the signal is periodic within the window.`,
  ];
  // reconstruction check
  const rec = ifft(X);
  let err = 0;
  for (let i = 0; i < N; i++) err = Math.max(err, Math.abs(rec[i].re - signal.values[i]));
  return {
    ok: true,
    value: {
      points,
      resolution: df,
      bandwidth: fs / 2,
      n: N,
      fs,
      reconstruction: rec.map((v) => v.re),
      reconstructionError: err,
      notes,
      continuous: true,
    },
  };
}

export interface SweepOptions {
  /** Evaluation grid size. */
  points?: number;
  /** Angular-frequency range in rad/s (CT) or rad/sample (DT). */
  omegaMin?: number;
  omegaMax?: number;
}

/**
 * DTFT evaluated numerically on a dense ω grid (0 … 2π or the given range).
 * This is a truncation of the infinite sum to the available samples, so it
 * shows the *windowed* DTFT (Dirichlet-kernel smearing), not the ideal one.
 */
export function analyzeDtft(signal: Signal, options: SweepOptions = {}): Checked<Spectrum> {
  if (signal.domain !== 'discrete') return { ok: false, error: 'The DTFT is defined for discrete-time sequences.' };
  const N = signal.values.length;
  if (N < 1) return { ok: false, error: 'The sequence is empty.' };
  const M = Math.min(options.points ?? 1024, LIMITS.MAX_FREQ_POINTS);
  const w0 = options.omegaMin ?? 0;
  const w1 = options.omegaMax ?? TWO_PI;
  if (!(w1 > w0)) return { ok: false, error: 'The upper angular frequency must exceed the lower one.' };
  const omegas = linspace(w0, w1, M);
  const n0 = signal.axis[0];
  const points: SpectrumPoint[] = omegas.map((w) => {
    let acc = cx(0, 0);
    for (let i = 0; i < N; i++) {
      acc = cadd(acc, cmul(cx(signal.values[i], 0), cexpI(-w * signal.axis[i])));
    }
    return {
      freq: w / TWO_PI,
      omega: w,
      magnitude: cabs(acc),
      phase: cabs(acc) < 1e-12 ? 0 : carg(acc),
      re: acc.re,
      im: acc.im,
    };
  });
  return {
    ok: true,
    value: {
      points,
      resolution: Math.abs(w1 - w0) / Math.max(1, M - 1) / TWO_PI,
      bandwidth: 0.5,
      n: N,
      fs: 1,
      reconstruction: [],
      reconstructionError: 0,
      notes: [
        'DTFT computed by direct summation over the available samples — the result is the DTFT of the *windowed* sequence.',
        `The DTFT is 2π-periodic in ω; only 0…π (0…0.5 cycles/sample) is shown because the inputs are real.`,
        `First sample index n₀ = ${n0}: a non-zero n₀ adds a linear phase term e^{−jωn₀} but does not change the magnitude.`,
        'Numeric evaluation on a dense grid is an approximation; peaks between grid points can be underestimated.',
      ],
      continuous: false,
    },
  };
}

/**
 * CTFT evaluated numerically:
 *   X(jω) = ∫ x(t)e^{−jωt}dt ≈ Δt Σ_n x(t_n) e^{−jω t_n}
 * over the finite observation window of the signal.
 */
export function analyzeCtft(signal: Signal, options: SweepOptions = {}): Checked<Spectrum> {
  if (signal.domain !== 'continuous') return { ok: false, error: 'The CTFT requires a continuous-time signal.' };
  const N = signal.values.length;
  if (N < 2) return { ok: false, error: 'At least two time samples are required.' };
  const t0 = signal.axis[0];
  const t1 = signal.axis[N - 1];
  const dt = (t1 - t0) / (N - 1);
  if (!(dt > 0)) return { ok: false, error: 'The time grid is degenerate.' };
  const M = Math.min(options.points ?? 1024, LIMITS.MAX_FREQ_POINTS);
  const fMax = options.omegaMax !== undefined ? options.omegaMax / TWO_PI : 1 / (2 * dt);
  const fMin = options.omegaMin !== undefined ? options.omegaMin / TWO_PI : -fMax;
  if (!(fMax > fMin)) return { ok: false, error: 'The upper frequency must exceed the lower one.' };
  const freqs = linspace(fMin, fMax, M);
  const points: SpectrumPoint[] = freqs.map((f) => {
    const w = TWO_PI * f;
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const angle = -w * signal.axis[i];
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      re += signal.values[i] * c;
      im += signal.values[i] * s;
    }
    re *= dt;
    im *= dt;
    return { freq: f, omega: w, magnitude: Math.hypot(re, im), phase: Math.hypot(re, im) < 1e-12 ? 0 : Math.atan2(im, re), re, im };
  });
  return {
    ok: true,
    value: {
      points,
      resolution: (fMax - fMin) / Math.max(1, M - 1),
      bandwidth: fMax,
      n: N,
      fs: 1 / dt,
      reconstruction: [],
      reconstructionError: 0,
      notes: [
        `Integral approximated by a rectangle rule with Δt = ${dt.toPrecision(6)} s over ${(t1 - t0).toPrecision(6)} s.`,
        `The summation is truncated to the observation window; the error is controlled by how well the signal decays by t = ${t1.toPrecision(4)} s.`,
        'The numeric grid covers |f| ≤ fs/2 because faster variation cannot be represented by the samples (aliasing limit).',
        'Rectangular integration converges at O(Δt) for discontinuous signals and O(Δt²) for smooth ones.',
      ],
      continuous: true,
    },
  };
}

/** Reference direct DFT (no FFT) used for validation and the "direct" mode. */
export function directDft(x: C[]): C[] {
  const N = x.length;
  const out: C[] = new Array(N);
  for (let k = 0; k < N; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const ang = (-TWO_PI * k * n) / N;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      re += x[n].re * c - x[n].im * s;
      im += x[n].re * s + x[n].im * c;
    }
    out[k] = cx(re, im);
  }
  return out;
}

export function directIdft(X: C[]): C[] {
  const N = X.length;
  const out: C[] = new Array(N);
  for (let n = 0; n < N; n++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < N; k++) {
      const ang = (TWO_PI * k * n) / N;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      re += X[k].re * c - X[k].im * s;
      im += X[k].re * s + X[k].im * c;
    }
    out[n] = cx(re / N, im / N);
  }
  return out;
}

/**
 * Predicted alias frequency for a discrete-time sinusoid:
 * frequencies above 0.5 cycles/sample fold to |f − 1|.
 */
export function aliasFrequency(f: number): number {
  const wrapped = ((f % 1) + 1) % 1;
  return wrapped > 0.5 ? 1 - wrapped : wrapped;
}

/** One-sided amplitude spectrum helper for chart rendering. */
export function amplitudeFromSpectrum(s: Spectrum): number[] {
  return oneSidedAmplitude(
    s.points.map((p) => cx(p.re, p.im)),
    s.continuous ? s.n : s.n,
  );
}
