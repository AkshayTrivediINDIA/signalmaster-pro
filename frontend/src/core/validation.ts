/**
 * Input validation shared by every module.
 *
 * All numeric entry points funnel through `checkNumber` / `parseSequence` so
 * that limits, integer checks and range checks are applied consistently and
 * error messages stay readable. Nothing here throws for user input; callers
 * receive a discriminated union and decide how to present the message.
 */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export const LIMITS = {
  /** Maximum number of plotted continuous-time samples. */
  CT_POINTS: 20_000,
  MIN_CT_POINTS: 8,
  /** Maximum number of discrete samples in a sequence. */
  SEQ_LENGTH: 4096,
  /** Maximum number of samples used by a DFT/FFT evaluation. */
  MAX_FFT: 8192,
  /** Maximum number of frequency points in a DTFT/CTFT sweep. */
  MAX_FREQ_POINTS: 4000,
  /** Maximum combined operations for direct summation estimates. */
  MAX_DIRECT_OPS: 40_000_000,
  /** Absolute magnitude guard for parameters. */
  MAX_ABS_VALUE: 1e12,
} as const;

const ok = <T>(value: T): Checked<T> => ({ ok: true, value });
const fail = <T>(error: string): Checked<T> => ({ ok: false, error });

export interface NumberOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  /** Reject zero (useful for divisors, widths, sampling rates). */
  nonZero?: boolean;
  unit?: string;
}

/** Parse and validate a single numeric field. Accepts strings from `<input>` elements. */
export function checkNumber(raw: string | number, label: string, opts: NumberOptions = {}): Checked<number> {
  const text = typeof raw === 'number' ? String(raw) : raw.trim();
  if (text === '') return fail(`${label} is required.`);
  // Reject things like "1,5" or "abc" before Number() silently returns NaN.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) {
    return fail(`${label} must be a number (got “${text}”).`);
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return fail(`${label} must be a finite number.`);
  if (opts.integer && !Number.isInteger(value)) return fail(`${label} must be an integer.`);
  if (Math.abs(value) > LIMITS.MAX_ABS_VALUE) return fail(`${label} exceeds the supported magnitude (1e12).`);
  if (opts.nonZero && value === 0) return fail(`${label} must not be zero.`);
  const unit = opts.unit ? ` ${opts.unit}` : '';
  if (opts.min !== undefined && value < opts.min) return fail(`${label} must be ≥ ${opts.min}${unit}.`);
  if (opts.max !== undefined && value > opts.max) return fail(`${label} must be ≤ ${opts.max}${unit}.`);
  return ok(value);
}

/** Validate a time/frequency range, returning a helpful message when it is inverted. */
export function checkRange(
  start: number,
  stop: number,
  labelStart: string,
  labelStop: string,
): Checked<[number, number]> {
  if (!(stop > start)) return fail(`${labelStop} must be greater than ${labelStart}.`);
  if (!Number.isFinite(stop - start)) return fail('The range is too large to represent.');
  return ok([start, stop]);
}

/**
 * Parse a comma/space separated sequence such as "1, 2, 3" or "[1 2 3]".
 * Used by the convolution lab and the difference-equation inputs.
 */
export function parseSequence(raw: string, label: string, maxLength: number = LIMITS.SEQ_LENGTH): Checked<number[]> {
  const cleaned = raw.replace(/[[\]]/g, ' ').trim();
  if (cleaned === '') return fail(`${label} is required, e.g. 1, 2, 3.`);
  const parts = cleaned.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return fail(`${label} must contain at least one number.`);
  if (parts.length > maxLength) return fail(`${label} is limited to ${maxLength} values (got ${parts.length}).`);
  const values: number[] = [];
  for (const p of parts) {
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(p)) {
      return fail(`${label}: “${p}” is not a number.`);
    }
    const v = Number(p);
    if (!Number.isFinite(v)) return fail(`${label}: “${p}” is not finite.`);
    if (Math.abs(v) > LIMITS.MAX_ABS_VALUE) return fail(`${label}: “${p}” exceeds the supported magnitude.`);
    values.push(v);
  }
  return ok(values);
}

/** Ensure an array has a non-zero leading coefficient (transfer-function denominators). */
export function checkLeadingCoefficient(a: number[], label: string): Checked<number[]> {
  if (a.length === 0) return fail(`${label} must contain at least one coefficient.`);
  if (a[0] === 0) return fail(`${label}[0] must be non-zero (it multiplies the highest power).`);
  return ok(a);
}

/** Numeric comparison tolerance helpers. */
export const approxEqual = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/** Format a number for display with sensible significant digits and no −0. */
export function fmt(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 1e-4) return v.toExponential(digits - 1).replace('e', 'e');
  const r = Number(v.toFixed(digits));
  return String(Object.is(r, -0) ? 0 : r);
}
