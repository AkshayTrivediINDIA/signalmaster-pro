import { describe, it, expect } from 'vitest';
import { fft, ifft, dftNaive, fftFreq } from '../core/fft';
import { cx, cabs } from '../core/complex';
import { convolveLinear, convolveCircular, lfilter, impulseResponse } from '../core/dsp';
import { roots, polyvalReal, polyFromRoots, polymul } from '../core/poly';
import { partialFractions, laplaceInverseAt, reconstructionAt } from '../core/rational';
import { evalExpression, ExprError } from '../core/expr';
import { generateSignal, DEFAULT_PARAMS, DEFAULT_TIME_SPEC, signalStats } from '../core/signals';
import { applyBinary, applyUnary } from '../core/operations';
import { linearConvolution, circularConvolution, continuousConvolution } from '../core/convolution';
import { analyzeDiscreteDft, analyzeContinuousSpectrum, analyzeDtft, analyzeCtft } from '../core/fourier';
import { checkNumber, parseSequence } from '../core/validation';
import { analyzeInverseLaplace } from '../core/laplace';
import { analyzeInverseZ, poleZeroDiscrete } from '../core/ztransform';
import { analyzeDiscreteSystem, analyzeContinuousSystem } from '../core/systems';

const closeTo = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('FFT / DFT', () => {
  it('matches the direct DFT on a random signal (power-of-two length)', () => {
    const x = [1, -2, 3.5, 0, 0.25, -4, 7, 2].map((v) => cx(v, 0));
    const a = fft(x);
    const b = dftNaive(x);
    a.forEach((v, i) => {
      closeTo(v.re, b[i].re, 1e-10);
      closeTo(v.im, b[i].im, 1e-10);
    });
  });

  it('matches the direct DFT for non-power-of-two lengths (Bluestein)', () => {
    for (const n of [3, 5, 6, 7, 9, 12, 17, 30]) {
      const x = Array.from({ length: n }, (_, i) => cx(Math.sin(i * 0.7) + 0.1 * i, 0.3 * Math.cos(i)));
      const a = fft(x);
      const b = dftNaive(x);
      a.forEach((v, i) => {
        closeTo(v.re, b[i].re, 1e-9);
        closeTo(v.im, b[i].im, 1e-9);
      });
    }
  });

  it('round-trips through ifft', () => {
    const vals = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    const x = vals.map((v) => cx(v, 0));
    const y = ifft(fft(x));
    y.forEach((v, i) => closeTo(v.re, vals[i], 1e-10));
  });

  it('concentrates a pure tone in the expected bin', () => {
    const N = 64;
    const k0 = 7;
    const x = Array.from({ length: N }, (_, n) => cx(Math.cos((2 * Math.PI * k0 * n) / N), 0));
    const X = fft(x);
    const mags = X.map(cabs);
    let best = 0;
    mags.forEach((m, i) => {
      if (m > mags[best]) best = i;
    });
    expect(best === k0 || best === N - k0).toBe(true);
    closeTo(mags[k0], N / 2, 1e-8);
  });

  it('assigns bin frequencies correctly', () => {
    const f = fftFreq(8, 100);
    closeTo(f[0], 0);
    closeTo(f[4], 50);
    closeTo(f[7], 87.5);
  });
});

describe('Convolution', () => {
  it('computes the reference textbook result {1,2,3} * {1,1} = {1,3,5,3}', () => {
    expect(Array.from(convolveLinear([1, 2, 3], [1, 1]))).toEqual([1, 3, 5, 3]);
  });

  it('handles delta sequences and length arithmetic', () => {
    const y = Array.from(convolveLinear([0, 1, 0, 0], [2, -1]));
    expect(y).toEqual([0, 2, -1, 0, 0]);
    expect(y.length).toBe(4 + 2 - 1);
  });

  it('matches circular and linear convolution for zero-padded lengths', () => {
    const x = [1, 2, 3];
    const h = [1, 0, -1];
    const circ = Array.from(convolveCircular(x, h, 5));
    const lin = Array.from(convolveLinear(x, h));
    for (let i = 0; i < 5; i++) closeTo(circ[i], lin[i] ?? 0, 1e-10);
  });

  it('wraps correctly for N = length', () => {
    const x = [1, 1, 0, 0];
    const h = [0, 1, 0, 0];
    expect(Array.from(convolveCircular(x, h, 4))).toEqual([0, 1, 1, 0]);
  });
});

describe('difference equations', () => {
  it('impulse response of y[n] - 0.5y[n-1] = x[n] is 0.5^n u[n]', () => {
    const h = impulseResponse({ b: [1], a: [1, -0.5] }, 8);
    for (let n = 0; n < 8; n++) closeTo(h[n], 0.5 ** n, 1e-12);
  });

  it('a moving average filter has the expected impulse response', () => {
    const h = impulseResponse({ b: [0.5, 0.5], a: [1] }, 4);
    expect(Array.from(h)).toEqual([0.5, 0.5, 0, 0]);
  });

  it('lfilter produces the analytic step response of a first-order system', () => {
    // y[n] = 0.8 y[n-1] + x[n], step response = (1 - 0.8^{n+1})/0.2
    const y = lfilter({ b: [1], a: [1, -0.8] }, new Float64Array(6).fill(1));
    for (let n = 0; n < 6; n++) closeTo(y[n], (1 - 0.8 ** (n + 1)) / 0.2, 1e-10);
  });
});

describe('polynomial roots', () => {
  it('finds roots of s² + 3s + 2 = (s+1)(s+2)', () => {
    const r = roots([1, 3, 2]);
    const re = r.map((v) => Number(v.re.toFixed(8))).sort((a, b) => a - b);
    expect(re).toEqual([-2, -1]);
  });

  it('finds a conjugate pair for s² + 2s + 5', () => {
    const r = roots([1, 2, 5]);
    const ims = r.map((v) => Math.abs(Number(v.im.toFixed(6)))).sort((a, b) => a - b);
    closeTo(ims[0], 2, 1e-6);
    closeTo(ims[1], 2, 1e-6);
  });

  it('reconstructs coefficients from roots', () => {
    const coeffs = polyFromRoots([-1, -2, -3]);
    [1, 6, 11, 6].forEach((c, i) => closeTo(Math.round(coeffs[i]), c, 1e-8));
  });

  it('evaluates polynomials by Horner', () => {
    closeTo(polyvalReal([2, 3, -5], 2), 9);
    expect(polymul([1, 2], [1, -3])).toEqual([1, -1, -6]);
  });
});

describe('partial fractions', () => {
  it('expands 1/((s+1)(s+2)) = 1/(s+1) - 1/(s+2)', () => {
    const pf = partialFractions([1], [1, 3, 2]);
    expect(pf.ok).toBe(true);
    if (!pf.ok) return;
    const residues = pf.value.terms.map((t) => Number(t.residue.re.toFixed(9))).sort((a, b) => a - b);
    expect(residues).toEqual([-1, 1]);
    expect(pf.value.verificationError).toBeLessThan(1e-9);
  });

  it('handles repeated poles 1/(s+1)²', () => {
    const pf = partialFractions([1], [1, 2, 1]);
    expect(pf.ok).toBe(true);
    if (!pf.ok) return;
    const r2 = pf.value.terms.find((t) => t.power === 2);
    expect(r2).toBeDefined();
    closeTo(r2!.residue.re, 1, 1e-9);
  });

  it('recovers the original function at a test point', () => {
    const pf = partialFractions([2, 1], [1, 2, 5]);
    expect(pf.ok).toBe(true);
    if (!pf.ok) return;
    const s = { re: 0.3, im: 0.2 };
    const num = { re: 2 * s.re + 1, im: 2 * s.im };
    const den = { re: s.re * s.re - s.im * s.im + 2 * s.re + 5, im: 2 * s.re * s.im + 2 * s.im };
    const denMag = den.re * den.re + den.im * den.im;
    const original = { re: (num.re * den.re + num.im * den.im) / denMag, im: (num.im * den.re - num.re * den.im) / denMag };
    const approx = reconstructionAt(pf.value.terms, s);
    closeTo(approx.re, original.re, 1e-8);
  });

  it('evaluates the causal time response of 1/(s+2) as e^{-2t}', () => {
    const pf = partialFractions([1], [1, 2]);
    expect(pf.ok).toBe(true);
    if (!pf.ok) return;
    closeTo(laplaceInverseAt(pf.value.terms, 0.5), Math.exp(-1), 1e-9);
  });
});

describe('expression parser (security + correctness)', () => {
  it('evaluates arithmetic with correct precedence', () => {
    expect(evalExpression('2 + 3 * 4')).toBe(14);
    expect(evalExpression('(2 + 3) * 4')).toBe(20);
    expect(evalExpression('2^3^2')).toBe(512); // right associative
    expect(evalExpression('-2^2')).toBe(-4);
  });

  it('supports functions and constants', () => {
    closeTo(evalExpression('sin(pi/2)'), 1, 1e-12);
    closeTo(evalExpression('sinc(0)'), 1, 1e-12);
    expect(evalExpression('max(1, 5, 3)')).toBe(5);
    expect(evalExpression('3!')).toBe(6);
  });

  it('uses variables from the supplied scope only', () => {
    closeTo(evalExpression('2*pi*t', { t: 0.25 }), Math.PI / 2, 1e-12);
  });

  it('rejects unknown variables and functions', () => {
    expect(() => evalExpression('window.alert(1)')).toThrow();
    expect(() => evalExpression('foo(2)')).toThrow(ExprError);
    expect(() => evalExpression('2 +')).toThrow();
  });

  it('never executes code', () => {
    // A malicious-looking expression must be a parse error, not code execution.
    expect(() => evalExpression('constructor.constructor("return 1")()')).toThrow();
    expect(() => evalExpression('this')).toThrow(ExprError);
  });

  it('reports domain errors instead of returning NaN silently', () => {
    expect(() => evalExpression('1/0')).toThrow(/Division by zero/);
    expect(() => evalExpression('sqrt(-1)')).toThrow(/negative/);
    expect(() => evalExpression('ln(-1)')).toThrow(/positive/);
  });

  it('parses a complex nested expression', () => {
    const v = evalExpression('5*t^2 + exp(-t)*cos(2*pi*t)', { t: 0.1 });
    closeTo(v, 5 * 0.01 + Math.exp(-0.1) * Math.cos(0.2 * Math.PI), 1e-12);
  });
});

describe('signal generation', () => {
  const spec = { ...DEFAULT_TIME_SPEC, domain: 'continuous' as const, t0: 0, t1: 1, samples: 101 };

  it('generates a sine with the correct values and statistics', () => {
    const r = generateSignal({ params: { ...DEFAULT_PARAMS, type: 'sine', amplitude: 2, frequency: 1 }, spec });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.value;
    closeTo(s.values[0], 2 * Math.sin(0));
    closeTo(s.values[26], 2 * Math.sin(2 * Math.PI * 0.26), 1e-12);
    const st = signalStats(s);
    closeTo(st.peak, 2, 0.02);
  });

  it('generates a discrete unit step with u(0) = 1', () => {
    const r = generateSignal({
      params: { ...DEFAULT_PARAMS, type: 'step', amplitude: 3 },
      spec: { ...DEFAULT_TIME_SPEC, domain: 'discrete', n0: -2, n1: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.values).toEqual([0, 0, 3, 3, 3]);
  });

  it('generates a discrete impulse at the specified index', () => {
    const r = generateSignal({
      params: { ...DEFAULT_PARAMS, type: 'impulse', shift: 2 },
      spec: { ...DEFAULT_TIME_SPEC, domain: 'discrete', n0: 0, n1: 4 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.values).toEqual([0, 0, 1, 0, 0]);
  });

  it('evaluates a custom expression signal', () => {
    const r = generateSignal({
      params: { ...DEFAULT_PARAMS, type: 'custom', expr: 'exp(-t)' },
      spec: { ...DEFAULT_TIME_SPEC, domain: 'continuous', t0: 0, t1: 2, samples: 9 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    closeTo(r.value.values[0], 1, 1e-12);
    closeTo(r.value.values[8], Math.exp(-2), 1e-12);
  });

  it('rejects a custom expression using a forbidden variable', () => {
    const r = generateSignal({
      params: { ...DEFAULT_PARAMS, type: 'custom', expr: 't + n' },
      spec: { ...DEFAULT_TIME_SPEC, domain: 'continuous' },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects invalid time ranges and sample counts', () => {
    expect(generateSignal({ params: DEFAULT_PARAMS, spec: { ...spec, t0: 2, t1: 1 } }).ok).toBe(false);
    expect(generateSignal({ params: DEFAULT_PARAMS, spec: { ...spec, samples: 1 } }).ok).toBe(false);
    expect(generateSignal({ params: DEFAULT_PARAMS, spec: { ...spec, samples: 1e9 } }).ok).toBe(false);
  });
});

describe('signal operations', () => {
  const mkDiscrete = (values: number[], origin: number) => ({
    domain: 'discrete' as const,
    axis: values.map((_, i) => origin + i),
    values,
    params: DEFAULT_PARAMS,
    formula: '',
    notes: [],
  });

  it('adds aligned discrete sequences on the union of indices', () => {
    const a = mkDiscrete([1, 2, 3], 0);
    const b = mkDiscrete([10, 20], 2);
    const r = applyBinary('add', a, b);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.signal.axis).toEqual([0, 1, 2, 3]);
    expect(r.value.signal.values).toEqual([1, 2, 13, 20]);
  });

  it('refuses to mix continuous and discrete operands', () => {
    const ct = generateSignal({ params: DEFAULT_PARAMS, spec: DEFAULT_TIME_SPEC });
    expect(ct.ok).toBe(true);
    if (!ct.ok) return;
    const r = applyBinary('add', ct.value, mkDiscrete([1], 0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/same domain/i);
  });

  it('shifts a discrete sequence by whole samples', () => {
    const r = applyUnary('timeShift', mkDiscrete([1, 2, 3], 0), { shift: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.signal.axis).toEqual([2, 3, 4]);
    expect(r.value.signal.values).toEqual([1, 2, 3]);
  });

  it('rejects a non-integer discrete shift and discrete time scaling', () => {
    expect(applyUnary('timeShift', mkDiscrete([1, 2], 0), { shift: 1.5 }).ok).toBe(false);
    expect(applyUnary('timeScale', mkDiscrete([1, 2], 0), { scale: 2 }).ok).toBe(false);
  });

  it('reverses a discrete sequence', () => {
    const r = applyUnary('timeReverse', mkDiscrete([1, 2, 3], 0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.signal.axis).toEqual([-2, -1, 0]);
    expect(r.value.signal.values).toEqual([3, 2, 1]);
  });

  it('computes comparison metrics', () => {
    const r = applyBinary('compare', mkDiscrete([1, 2, 3], 0), mkDiscrete([1, 2, 4], 0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    closeTo(r.value.metrics!.maxAbsDifference, 1);
    closeTo(r.value.metrics!.rmsDifference, Math.sqrt(1 / 3));
  });
});

describe('convolution lab', () => {
  it('returns origin = n₀x + n₀h and the right length', () => {
    const r = linearConvolution({ values: [1, 2, 3], origin: 0 }, { values: [1, 1], origin: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.values).toEqual([1, 3, 5, 3]);
    expect(r.value.origin).toBe(0);
  });

  it('honours index origins', () => {
    const r = linearConvolution({ values: [1, 2], origin: 1 }, { values: [1], origin: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.origin).toBe(4);
    expect(r.value.values).toEqual([1, 2]);
  });

  it('produces a step-by-step table whose sums match the output', () => {
    const r = linearConvolution({ values: [1, 2, 3], origin: 0 }, { values: [1, 1], origin: 0 }, { stepCount: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r.value.steps.forEach((step, i) => {
      closeTo(step.sum, r.value.values[i], 1e-12);
      expect(step.terms.length).toBeGreaterThan(0);
    });
  });

  it('supports circular convolution with padding and flags it', () => {
    const r = circularConvolution({ values: [1, 2, 3], origin: 0 }, { values: [1, 1], origin: 0 }, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.padded).toBe(true);
    expect(r.value.values.length).toBe(4);
  });

  it('numerically approximates continuous convolution (rect * rect = triangle)', () => {
    const N = 2001;
    const dt = 0.002;
    const t = Array.from({ length: N }, (_, i) => -1 + i * dt);
    const rect = { domain: 'continuous' as const, axis: t, values: t.map((x) => (Math.abs(x) <= 0.5 ? 1 : 0)), params: DEFAULT_PARAMS, formula: '', notes: [] };
    const r = continuousConvolution(rect, rect);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { axis, values } = r.value;
    const at = (x: number) => {
      let best = 0;
      let bestD = Infinity;
      axis.forEach((a, i) => {
        const d = Math.abs(a - x);
        if (d < bestD) {
          bestD = d;
          best = values[i];
        }
      });
      return best;
    };
    closeTo(at(0), 1, 0.01); // triangle peak = height × width = 1
    closeTo(at(0.75), 0.25, 0.02);
    closeTo(at(1.5), 0, 0.02);
  });

  it('rejects empty or oversized inputs', () => {
    expect(linearConvolution({ values: [], origin: 0 }, { values: [1], origin: 0 }).ok).toBe(false);
    expect(linearConvolution({ values: new Array(1).fill(0), origin: 0 }, { values: new Array(300000).fill(0), origin: 0 }).ok).toBe(false);
    expect(circularConvolution({ values: [1], origin: 0 }, { values: [1], origin: 0 }, 0).ok).toBe(false);
  });
});

describe('Fourier lab', () => {
  const mkDiscrete = (values: number[]) => ({
    domain: 'discrete' as const,
    axis: values.map((_, i) => i),
    values,
    params: DEFAULT_PARAMS,
    formula: '',
    notes: [],
  });

  it('finds the tone bin and reports a clean round trip', () => {
    const N = 64;
    const x = Array.from({ length: N }, (_, n) => Math.cos((2 * Math.PI * 8 * n) / N));
    const r = analyzeDiscreteDft(mkDiscrete(x));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.points.length).toBe(N / 2 + 1);
    expect(r.value.reconstructionError).toBeLessThan(1e-10);
    const peak = r.value.points.reduce((best, p) => (p.magnitude > best.magnitude ? p : best), r.value.points[0]);
    closeTo(peak.freq, 8 / N, 1e-12);
    closeTo(peak.magnitude, N / 2, 1e-8);
  });

  it('maps continuous sample rates to Hz correctly', () => {
    const fs = 500;
    const N = 500;
    const t = Array.from({ length: N }, (_, i) => i / fs);
    const sig = { domain: 'continuous' as const, axis: t, values: t.map((x) => Math.cos(2 * Math.PI * 50 * x)), params: DEFAULT_PARAMS, formula: '', notes: [] };
    const r = analyzeContinuousSpectrum(sig);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    closeTo(r.value.fs, 500, 1e-9);
    closeTo(r.value.resolution, 1, 1e-9);
    const peak = r.value.points.reduce((best, p) => (p.magnitude > best.magnitude ? p : best), r.value.points[0]);
    closeTo(peak.freq, 50, 1);
  });

  it('DTFT of a unit impulse is flat with unit magnitude', () => {
    const r = analyzeDtft(mkDiscrete([1, 0, 0, 0]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const p of r.value.points) closeTo(p.magnitude, 1, 1e-10);
  });

  it('CTFT of e^{-t}u(t) peaks at DC with magnitude 1', () => {
    const t = Array.from({ length: 4001 }, (_, i) => -0.5 + i * 0.0025);
    const sig = { domain: 'continuous' as const, axis: t, values: t.map((x) => (x >= 0 ? Math.exp(-x) : 0)), params: DEFAULT_PARAMS, formula: '', notes: [] };
    const r = analyzeCtft(sig, { points: 801 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dc = r.value.points.reduce((best, p) => (Math.abs(p.freq) < Math.abs(best.freq) ? p : best), r.value.points[0]);
    closeTo(dc.magnitude, 1, 0.02);
  });
});

describe('Laplace lab', () => {
  it('inverts 1/(s+2) to e^{-2t}', () => {
    const r = analyzeInverseLaplace([1], [1, 2], 5, 101);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.poles.stable).toBe(true);
    const i = r.value.time.findIndex((t) => t >= 1);
    closeTo(r.value.h[i], Math.exp(-2 * r.value.time[i]), 1e-6);
  });

  it('classifies an unstable transfer function', () => {
    const r = analyzeInverseLaplace([1], [1, -2], 5, 101);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.poles.stable).toBe(false);
  });

  it('inverts a repeated-pole function 1/(s+1)²', () => {
    const r = analyzeInverseLaplace([1], [1, 2, 1], 5, 101);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const i = r.value.time.findIndex((t) => t >= 2);
    closeTo(r.value.h[i], r.value.time[i] * Math.exp(-r.value.time[i]), 1e-5);
  });
});

describe('Z-transform lab', () => {
  it('inverts z/(z-0.5) to 0.5^n u[n]', () => {
    const r = analyzeInverseZ([1, 0], [1, -0.5], 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (let n = 0; n < 10; n++) closeTo(r.value.sequence[n], 0.5 ** n, 1e-10);
    expect(r.value.report.stable).toBe(true);
    expect(r.value.crossCheckError).toBeLessThan(1e-8);
  });

  it('flags an unstable pole outside the unit circle', () => {
    const r = poleZeroDiscrete([1, 0], [1, -1.5]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stable).toBe(false);
  });
});

describe('LTI system analyser', () => {
  it('classifies a stable first-order discrete system', () => {
    const r = analyzeDiscreteSystem({ b: [1], a: [1, -0.9] }, 40);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stable).toBe(true);
    expect(r.value.properties.find((p) => p.label === 'Causality')!.verdict).toBe('yes');
    closeTo(r.value.step[39], 10, 0.2); // DC gain 1/(1-0.9), 0.9^40 residual ≈ 0.15
  });

  it('classifies an unstable discrete system', () => {
    const r = analyzeDiscreteSystem({ b: [1], a: [1, -1.2] }, 40);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stable).toBe(false);
  });

  it('classifies a stable continuous system and checks DC gain', () => {
    const r = analyzeContinuousSystem({ num: [2], den: [1, 3, 2] }, 10, 801);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stable).toBe(true);
    closeTo(r.value.step[r.value.step.length - 1], 1, 1e-3); // DC gain = 2/2
  });

  it('classifies a continuous system with a right-half-plane pole as unstable', () => {
    const r = analyzeContinuousSystem({ num: [1], den: [1, -1] }, 3, 401);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stable).toBe(false);
  });

  it('rejects a zero leading denominator coefficient', () => {
    expect(analyzeContinuousSystem({ num: [1], den: [0, 1] }).ok).toBe(false);
    expect(analyzeDiscreteSystem({ b: [1], a: [0, 1] }).ok).toBe(false);
  });
});

describe('validation', () => {
  it('accepts valid numbers and rejects malformed input', () => {
    expect(checkNumber('3.5', 'Gain').ok).toBe(true);
    expect(checkNumber('', 'Gain').ok).toBe(false);
    expect(checkNumber('abc', 'Gain').ok).toBe(false);
    expect(checkNumber('1,5', 'Gain').ok).toBe(false);
    expect(checkNumber('0', 'Frequency', { nonZero: true }).ok).toBe(false);
    expect(checkNumber('2.5', 'Count', { integer: true }).ok).toBe(false);
    expect(checkNumber('11', 'Amplitude', { max: 10 }).ok).toBe(false);
  });

  it('parses sequences with several separators', () => {
    const r = parseSequence('[1, 2, 3]', 'x');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual([1, 2, 3]);
    expect(parseSequence('1, 2, abc', 'x').ok).toBe(false);
    expect(parseSequence('', 'x').ok).toBe(false);
  });
});
