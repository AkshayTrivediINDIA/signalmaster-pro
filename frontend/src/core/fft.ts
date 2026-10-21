import { C, cx, cadd, cmul, cconj, cexpI, cscale, cabs } from './complex';

/**
 * Fourier machinery.
 *
 * Conventions (documented once, used everywhere):
 *   Forward DFT:  X[k] = Σ_{n=0}^{N-1} x[n] e^{-j2πkn/N}
 *   Inverse DFT:  x[n] = (1/N) Σ_{k=0}^{N-1} X[k] e^{+j2πkn/N}
 * Bin k corresponds to frequency  f_k = k·fs/N   (Hz)
 * and to normalised angular frequency  ω_k = 2πk/N rad/sample.
 */

export const TWO_PI = 2 * Math.PI;

/** Direct (O(N²)) DFT – the reference implementation used to validate the FFT. */
export function dftNaive(x: C[]): C[] {
  const N = x.length;
  const out: C[] = new Array(N);
  for (let k = 0; k < N; k++) {
    let acc = cx(0, 0);
    for (let n = 0; n < N; n++) {
      const theta = (-TWO_PI * k * n) / N;
      acc = cadd(acc, cmul(x[n], cexpI(theta)));
    }
    out[k] = acc;
  }
  return out;
}

/** Direct inverse DFT. */
export function idftNaive(X: C[]): C[] {
  const N = X.length;
  const out: C[] = new Array(N);
  for (let n = 0; n < N; n++) {
    let acc = cx(0, 0);
    for (let k = 0; k < N; k++) {
      acc = cadd(acc, cmul(X[k], cexpI((TWO_PI * k * n) / N)));
    }
    out[n] = cscale(acc, 1 / N);
  }
  return out;
}

const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

/** In-place iterative radix-2 Cooley–Tukey FFT. Length must be a power of two. */
export function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (!isPow2(n)) throw new Error('fftRadix2 requires a power-of-two length');

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-TWO_PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Forward FFT of arbitrary length (radix-2 when possible, Bluestein otherwise). */
export function fft(x: C[]): C[] {
  const n = x.length;
  if (n === 0) return [];
  if (isPow2(n)) {
    const re = Float64Array.from(x.map((v) => v.re));
    const im = Float64Array.from(x.map((v) => v.im));
    fftRadix2(re, im);
    return Array.from({ length: n }, (_, i) => cx(re[i], im[i]));
  }
  return bluestein(x, false);
}

/** Inverse FFT: conj → fft → conj → /N (valid for every length). */
export function ifft(X: C[]): C[] {
  const n = X.length;
  if (n === 0) return [];
  const conj = X.map(cconj);
  const Y = fft(conj);
  return Y.map((v) => cscale(cconj(v), 1 / n));
}

/** Bluestein (chirp-z) FFT used for non-power-of-two lengths. */
function bluestein(x: C[], inverse: boolean): C[] {
  const n = x.length;
  let m = 1;
  while (m < 2 * n - 1) m <<= 1;
  const sign = inverse ? 1 : -1;
  const chirp: C[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const kk = (k * k) % (2 * n);
    chirp[k] = cexpI((sign * Math.PI * kk) / n);
  }
  const aRe = new Float64Array(m);
  const aIm = new Float64Array(m);
  const bRe = new Float64Array(m);
  const bIm = new Float64Array(m);
  for (let k = 0; k < n; k++) {
    const t = cmul(x[k], chirp[k]);
    aRe[k] = t.re;
    aIm[k] = t.im;
    bRe[k] = chirp[k].re;
    bIm[k] = -chirp[k].im;
    if (k > 0) {
      bRe[m - k] = chirp[k].re;
      bIm[m - k] = -chirp[k].im;
    }
  }
  // Convolve a and b via FFT
  fftRadix2(bRe, bIm);
  fftRadix2(aRe, aIm);
  for (let i = 0; i < m; i++) {
    const re = aRe[i] * bRe[i] - aIm[i] * bIm[i];
    const im = aRe[i] * bIm[i] + aIm[i] * bRe[i];
    aRe[i] = re;
    aIm[i] = im;
  }
  // (both components are computed before writing, so the product is exact)
  // Inverse FFT
  for (let i = 0; i < m; i++) aIm[i] = -aIm[i];
  fftRadix2(aRe, aIm);
  for (let i = 0; i < m; i++) {
    aRe[i] = aRe[i] / m;
    aIm[i] = -aIm[i] / m;
  }

  const out: C[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const t = cx(aRe[k], aIm[k]);
    out[k] = inverse ? cscale(cmul(t, chirp[k]), 1 / n) : cmul(t, chirp[k]);
  }
  return out;
}

/**
 * FFT bin frequencies.
 * @param centered when true the axis runs from −fs/2 to fs/2 (fftshift order).
 */
export function fftFreq(n: number, fs = 1, centered = false): number[] {
  const out: number[] = [];
  const step = fs / n;
  if (centered) {
    const half = Math.floor(n / 2);
    for (let i = 0; i < n; i++) out.push((i - half) * step);
  } else {
    for (let i = 0; i < n; i++) out.push(i * step);
  }
  return out;
}

/** Rotate an array so that the zero-frequency bin is centred. */
export function fftshift<T>(a: T[]): T[] {
  const half = Math.floor(a.length / 2);
  return [...a.slice(a.length - half), ...a.slice(0, a.length - half)];
}

export function ifftshift<T>(a: T[]): T[] {
  const half = Math.ceil(a.length / 2);
  return [...a.slice(half), ...a.slice(0, half)];
}

/** One-sided amplitude spectrum of a real signal (bins 0..N/2). */
export function oneSidedAmplitude(X: C[], n: number): number[] {
  const half = Math.floor(n / 2);
  const out: number[] = [];
  for (let k = 0; k <= half; k++) {
    let a = cabs(X[k]) / n;
    if (k !== 0 && k !== n / 2) a *= 2;
    out.push(a);
  }
  return out;
}

export const magnitude = (X: C[]): number[] => X.map(cabs);

/** Phase in radians, wrapped to (−π, π], with exact zeros for negligible bins. */
export function phaseRad(X: C[], tol = 1e-12): number[] {
  return X.map((v) => (cabs(v) < tol ? 0 : Math.atan2(v.im, v.re)));
}

export const toDb = (mag: number, floor = 1e-10): number => 20 * Math.log10(Math.max(mag, floor));
