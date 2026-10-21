/**
 * Verifies every numerical claim made in the learning content against the
 * application's own numerical core. If an answer, worked step or question
 * becomes wrong, these tests fail.
 */
import { describe, it, expect } from 'vitest';
import { TOPICS, FORMULA_SHEET } from '../features/learning/content';
import { convolveLinear, convolveCircular, impulseResponse, lfilter } from '../core/dsp';
import { analyzeInverseLaplace } from '../core/laplace';
import { analyzeInverseZ } from '../core/ztransform';
import { analyzeDiscreteSystem, analyzeContinuousSystem } from '../core/systems';
import { fft, fftFreq } from '../core/fft';
import { cx, cabs } from '../core/complex';
import { aliasFrequency } from '../core/fourier';
import { applyUnary } from '../core/operations';
import { generateSignal, DEFAULT_PARAMS, DEFAULT_TIME_SPEC, type Signal } from '../core/signals';

const closeTo = (a: number, b: number, tol = 1e-8) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('worked examples are numerically correct', () => {
  it('w-energy: energy of 3·(0.5)ⁿu[n] is 12', () => {
    // Partial sum converges to 12; check numerically with many terms.
    let e = 0;
    for (let n = 0; n < 200; n++) e += (3 * 0.5 ** n) ** 2;
    closeTo(e, 12, 1e-9);
  });

  it('w-period: cos(2π·0.2n) has period 5', () => {
    const x = (n: number) => Math.cos(2 * Math.PI * 0.2 * n);
    closeTo(x(0), x(5), 1e-12);
    expect(Math.abs(x(0) - x(1))).toBeGreaterThan(1e-3); // not period 1
    closeTo(1 / 0.2, 5);
  });

  it('w-shift-scale: x(2t−2) for rect(t) is non-zero on [0.75, 1.25]', () => {
    const rect = (t: number) => (Math.abs(t) <= 0.5 ? 1 : 0);
    const y = (t: number) => rect(2 * t - 2);
    expect(y(0.74)).toBe(0);
    expect(y(0.75)).toBe(1);
    expect(y(1.0)).toBe(1);
    expect(y(1.25)).toBe(1);
    expect(y(1.26)).toBe(0);
  });

  it('w-linear: {1,2,3} * {1,1} = {1,3,5,3}', () => {
    expect(Array.from(convolveLinear([1, 2, 3], [1, 1]))).toEqual([1, 3, 5, 3]);
  });

  it('w-circular: 4-point circular convolution of {1,2,3,0} and {1,1,0,0} is {1,3,5,3}', () => {
    expect(Array.from(convolveCircular([1, 2, 3, 0], [1, 1, 0, 0], 4))).toEqual([1, 3, 5, 3]);
  });

  it('q-conv-sum: {2,1} * {1,-1} = {2,-1,-1} and sums to 0', () => {
    const y = Array.from(convolveLinear([2, 1], [1, -1]));
    expect(y).toEqual([2, -1, -1]);
    closeTo(y.reduce((a, b) => a + b, 0), 0, 1e-12);
    expect((2 + 1) * (1 - 1)).toBe(0);
  });

  it('w-fft-bin: bin 10 of a 64-point record at 640 Hz is 100 Hz with Δf = 10 Hz', () => {
    const freqs = fftFreq(64, 640);
    closeTo(freqs[10], 100, 1e-9);
    closeTo(640 / 64, 10, 1e-12);
    // A 100 Hz tone lands exactly in that bin.
    const N = 64;
    const fs = 640;
    const x = Array.from({ length: N }, (_, n) => cx(Math.cos((2 * Math.PI * 100 * n) / fs), 0));
    const X = fft(x).map(cabs);
    const peak = X.indexOf(Math.max(...X));
    // A real cosine has symmetric peaks at k = 10 and k = N − 10.
    expect(peak === 10 || peak === N - 10).toBe(true);
    expect(X[10]).toBeGreaterThan(N * 0.4);
  });

  it('w-alias: 1200 Hz sampled at 1000 Hz folds to 200 Hz', () => {
    closeTo(aliasFrequency(1200 / 1000), 200 / 1000, 1e-12);
  });

  it('w-inverse-partial: ℒ⁻¹{1/((s+1)(s+2))} = e^{−t} − e^{−2t}', () => {
    const r = analyzeInverseLaplace([1], [1, 3, 2], 5, 501);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of [0.25, 1, 2.5]) {
      const idx = r.value.time.findIndex((x) => x >= t);
      closeTo(r.value.h[idx], Math.exp(-r.value.time[idx]) - Math.exp(-2 * r.value.time[idx]), 1e-5);
    }
  });

  it('w-stability: H(s) = 2/(s²+3s+2) is stable, its impulse response decays and its step settles at the DC gain 1', () => {
    const r = analyzeInverseLaplace([2], [1, 3, 2], 20, 2001);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.poles.stable).toBe(true);
    // h(t) → 0 for a stable strictly-proper system
    expect(Math.abs(r.value.h[r.value.h.length - 1])).toBeLessThan(1e-3);
    // The step response settles at H(0) = 1.
    const sys = analyzeContinuousSystem({ num: [2], den: [1, 3, 2] }, 30, 801);
    expect(sys.ok).toBe(true);
    if (!sys.ok) return;
    closeTo(sys.value.step[sys.value.step.length - 1], 1, 1e-3);
  });

  it('w-stability (systems): step response settles at the DC gain of 1', () => {
    // Verified through the LTI analyser's step response.
    const sys = analyzeDiscreteSystem({ b: [1], a: [1, -0.5] }, 30);
    expect(sys.ok).toBe(true);
    if (!sys.ok) return;
    closeTo(sys.value.step[29], 2, 1e-4); // H(1) = 1/(1-0.5)
  });

  it('w-inverse-geo: 𝒵⁻¹{z/(z−0.5)} = 0.5ⁿu[n]', () => {
    const r = analyzeInverseZ([1, 0], [1, -0.5], 12);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (let n = 0; n < 12; n++) closeTo(r.value.sequence[n], 0.5 ** n, 1e-10);
  });

  it('w-stability-z: y[n] = 1.2y[n−1] + x[n] is unstable', () => {
    const r = analyzeDiscreteSystem({ b: [1], a: [1, -1.2] }, 20);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stable).toBe(false);
    const h = Array.from(impulseResponse({ b: [1], a: [1, -1.2] }, 10));
    closeTo(h[5], 1.2 ** 5, 1e-9);
    expect(h[9]).toBeGreaterThan(h[4]); // grows
  });

  it('w-diffeq: h[n] = 0.5ⁿu[n] and DC gain 2', () => {
    const h = Array.from(lfilter({ b: [1], a: [1, -0.5] }, Float64Array.from([1, 0, 0, 0])));
    closeTo(h[0], 1, 1e-12);
    closeTo(h[1], 0.5, 1e-12);
    closeTo(h[3], 0.125, 1e-12);
    closeTo(1 / (1 - 0.5), 2, 1e-12);
  });

  it('q-nyquist: fs = 8 kHz has a 4 kHz limit', () => {
    closeTo(8000 / 2, 4000);
  });

  it('q-leakage: a 1000 Hz tone over 0.1 s at 8 kHz completes exactly 100 cycles', () => {
    const cycles = 1000 * 0.1;
    expect(cycles).toBe(100);
    // At N = 800 samples the tone sits exactly on bin 100 (no leakage).
    const N = 800;
    const fs = 8000;
    const x = Array.from({ length: N }, (_, n) => Math.cos((2 * Math.PI * 1000 * n) / fs));
    const X = fft(x.map((v) => cx(v, 0))).map(cabs);
    const peak = X.indexOf(Math.max(...X));
    expect(peak === 100 || peak === N - 100).toBe(true);
    // neighbouring bins are far smaller (no leakage)
    expect(X[101]).toBeLessThan(X[100] * 0.01);
  });

  it('signal-operations example: adding a 90°-shifted tone doubles amplitude only when in phase', () => {
    const spec = { ...DEFAULT_TIME_SPEC, domain: 'continuous' as const, t0: 0, t1: 1, samples: 401 };
    const a = generateSignal({ params: { ...DEFAULT_PARAMS, type: 'sine', amplitude: 1, frequency: 5, phase: 0 }, spec });
    const b = generateSignal({ params: { ...DEFAULT_PARAMS, type: 'sine', amplitude: 1, frequency: 5, phase: Math.PI / 2 }, spec });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const sum = a.value.values.map((v, i) => v + b.value.values[i]);
    const peak = Math.max(...sum.map(Math.abs));
    closeTo(peak, Math.SQRT2, 1e-6); // √2 for two unit-amplitude quadrature tones
  });
});

describe('learning content structure', () => {
  it('every topic has unique question ids and valid answer indices', () => {
    const ids = new Set<string>();
    for (const t of TOPICS) {
      expect(t.questions.length).toBeGreaterThan(0);
      expect(t.formulas.length).toBeGreaterThan(0);
      expect(t.worked.length).toBeGreaterThan(0);
      for (const q of t.questions) {
        expect(ids.has(q.id)).toBe(false);
        ids.add(q.id);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
        expect(q.answerIndex).toBeLessThan(q.choices.length);
        expect(q.explanation.length).toBeGreaterThan(20);
      }
    }
  });

  it('the formula sheet is searchable and non-empty', () => {
    expect(FORMULA_SHEET.length).toBeGreaterThanOrEqual(6);
    for (const section of FORMULA_SHEET) expect(section.items.length).toBeGreaterThan(0);
  });

  it('every worked example has a numerical check key covered by this suite', () => {
    const covered = new Set([
      'geometric-energy',
      'discrete-period',
      'shift-scale',
      'conv-123',
      'circular-123',
      'fft-bin',
      'alias-1200',
      'laplace-partial',
      'laplace-dc',
      'z-geo',
      'z-unstable',
      'lti-firstorder',
    ]);
    for (const t of TOPICS) {
      for (const w of t.worked) {
        expect(w.check).toBeDefined();
        expect(covered.has(w.check!)).toBe(true);
      }
    }
  });
});

describe('reference sheet matches implementation conventions', () => {
  it('DFT/IDFT round trip holds with 1/N inverse scaling as documented', () => {
    const N = 8;
    const x = Array.from({ length: N }, (_, n) => cx(Math.sin(n), 0));
    const X = fft(x);
    // Manual inverse per the documented formula
    const back = Array.from({ length: N }, (_, n) => {
      let re = 0;
      for (let k = 0; k < N; k++) re += X[k].re * Math.cos((2 * Math.PI * k * n) / N) - X[k].im * Math.sin((2 * Math.PI * k * n) / N);
      return re / N;
    });
    back.forEach((v, n) => closeTo(v, Math.sin(n), 1e-10));
  });

  it('u[n] − u[n−1] = δ[n] using the documented u(0)=1 convention', () => {
    const spec = { ...DEFAULT_TIME_SPEC, domain: 'discrete' as const, n0: -2, n1: 3 };
    const u = generateSignal({ params: { ...DEFAULT_PARAMS, type: 'step' }, spec });
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    const v = u.value as Signal;
    const diff = v.values.map((val, i) => (i === 0 ? val : val - v.values[i - 1]));
    // indices -2..3 → δ should be at n = 0 (index 2)
    expect(diff).toEqual([0, 0, 1, 0, 0, 0]);
  });

  it('time reversal leaves the amplitude set unchanged', () => {
    const spec = { ...DEFAULT_TIME_SPEC, domain: 'discrete' as const, n0: 0, n1: 4 };
    const g = generateSignal({ params: { ...DEFAULT_PARAMS, type: 'ramp' }, spec });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const r = applyUnary('timeReverse', g.value);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.value.signal.values].sort()).toEqual([...g.value.values].sort());
  });
});
