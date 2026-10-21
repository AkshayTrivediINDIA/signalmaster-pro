# Scientific conventions and assumptions

This document is the authority for every definition used in the app. When in doubt, the source of truth is
the comment block at the top of the corresponding `frontend/src/core/*.ts` file — those blocks are written
from the same text.

---

## 1. Notation and units

| Symbol | Meaning |
| --- | --- |
| `t` | Continuous time in **seconds**. |
| `n` | Discrete index, integer, in **samples**. |
| `fs` | Sampling frequency in **Hz**. `Ts = 1/fs`. |
| `f` | Frequency in **Hz** (continuous time) or **cycles/sample** (discrete time, `f = ω/2π`). |
| `ω` | Angular frequency in **rad/s** (continuous time) or **rad/sample** (discrete time). |
| `s = σ + jω` | Laplace variable. |
| `z` | Z-transform variable, `z = e^{sT}` for a sampled system. |

Discrete-time frequency is always shown normalised (Nyquist = 0.5 cycles/sample); Hz is used only where a
sample rate is defined. Frequency axes are labelled with the unit in use, so the two are never mixed.

## 2. Elementary signals

| Signal | Definition | Notes |
| --- | --- | --- |
| Unit impulse (CT) | `δ(t)` | Not rendered as a finite value. Plotted as a unit-area arrow. |
| Unit impulse (DT) | `δ[n] = 1` at `n = 0`, else `0` | Ideal, infinite amplitude in CT. |
| Unit step | `u(t) = 1` for `t ≥ 0`, else `0`; `u[n] = 1` for `n ≥ 0` | **`u(0) = 1`** (right-continuous). Stated in the UI because conventions differ. |
| Ramp | `t·u(t)` / `n·u[n]` | |
| Exponential | `e^{−at}u(t)` / `a^n u[n]` | Decay rate `a`. |
| Sine / cosine | `A sin(2πf t + φ)` | Phase `φ` in degrees in the form, radians internally. |
| Rectangular pulse | `1` for `t ∈ [t₀, t₀+W)`, else `0` | Half-open interval to avoid double counting. |
| Triangular pulse | Linear rise over `W/2`, fall over `W/2` | |
| `sinc` | `sin(πx)/(πx)`, `sinc(0) = 1` | **Normalised** (signal-processing) convention, not `sin x / x`. |

**Continuous signals are rendered as samples.** A "CT" signal in this app is an underlying function evaluated
on a uniform grid (`t₀ … t₁`, `N` points). Discontinuities may fall between samples; a jump in the plot is
therefore an artefact of sampling unless the signal is genuinely discontinuous. The grid is shown next to the
plot, and the CSV export contains the same samples.

**Ideal impulses are distinguished from finite pulses.** An impulse is stored as a `(position, area)` pair and
drawn as a stem; it is never rendered as a rectangle whose width depends on the grid. Numeric CT convolution
of an impulse therefore uses the stem representation, and the result table says so.

## 3. Operations on the independent variable

- **Time shift**: `x(t − t₀)` moves content to the *right* for `t₀ > 0` (delay). Discrete: `x[n − n₀]`.
- **Reversal**: `x(−t)`, `x[−n]`.
- **Time scaling**: `x(at)`. For `a > 1` the signal is compressed; samples are obtained by **linear
  interpolation** on the source grid. Values requested outside the source support are `0` (the signals are
  treated as zero outside their window, which is stated in the result notes).
- **Addition / multiplication** requires a shared index domain: the app takes the **union** of the two
  supports and zero-extends, reporting the union in the result. It never silently truncates.

## 4. Convolution

**Linear, finite sequences with origins:**
`(x * h)[n] = Σ_k x[k] h[n − k]`, with `x` on `[Nx0, Nx0+N−1]` and `h` on `[Nh0, Nh0+M−1]`. The result is
supported on `[Nx0+Nh0, Nx0+Nh0+N+M−2]`, length `N+M−1`. Methods:

| Mode | Output |
| --- | --- |
| `full` | length `N+M−1`, the true linear convolution |
| `same` | length `max(N,M)`, centred on the full result (MATLAB/NumPy convention, index offset reported) |
| `valid` | the part computed without zero padding |

**Circular modulo N:** `y[n] = Σ_{k=0}^{N−1} x[((k))_N] h[((n−k))_N]`. The result is periodic; the displayed
index origin is a *display choice* and is reported. Circular length differs from sequence length only when the
user sets it explicitly, and the app warns when `N < N+M−1` that circular ≠ linear (aliasing of the tail).

**Continuous-time convolution (numerical):** `y(t) ≈ Δτ · Σ_k x(kΔτ) h(t − kΔτ)` with `Δτ` the user's step
(reported). Error is `O(Δτ)` for piecewise-smooth signals, larger near discontinuities. This is a numerical
approximation, labelled as such in the UI and in exports.

## 5. Fourier analysis

```
DFT    X[k] = Σ_{n=0}^{N−1} x[n] e^{−j2πkn/N},     k = 0 … N−1
IDFT   x[n] = (1/N) Σ_{k=0}^{N−1} X[k] e^{+j2πkn/N}
DTFT   X(e^{jω}) = Σ_n x[n] e^{−jωn},              ω in rad/sample
CTFT   X(jω) = ∫_{−∞}^{∞} x(t) e^{−jωt} dt,        ω in rad/s
```

- Bin `k` corresponds to `f = k·fs/N`; bin 0 is DC, and bins above `N/2` are negative frequencies. The
  two-sided spectrum is shown by default; the one-sided amplitude plot doubles non-DC bins (reported in the
  legend as "one-sided amplitude").
- **FFT**: radix-2 Cooley–Tukey (bit-reversal permutation) for power-of-two lengths, **Bluestein** chirp-z for
  any other length — the result is validated against the direct DFT in the tests (max error < 1e-9 relative).
- **No window functions are applied.** The spectral window is implicit (the record length itself), so the
  displayed spectrum is the windowed spectrum. Leakage and its cause are reported in the diagnostics; the app
  is explicit that it does not compensate.
- **CTFT** is `Σ x(t_k) e^{−jω t_k} Δt` over the observation window — a truncated rectangle-rule
  approximation. Consequences the UI reports: finite resolution `≈ 1/T`, leakage from the truncation, and no
  representation of impulses.
- **Nyquist diagnostics**: the app reports the highest input frequency, the sample rate, the resulting alias
  frequency when `f > fs/2` (`f_alias = |f − round(f/fs)·fs|`), and the inverse-transform reconstruction error
  as an objective check that no bins were lost.

## 6. Laplace transform

Definition (one-sided, as used throughout):
`F(s) = ∫_{0⁻}^{∞} f(t) e^{−st} dt`, with the ROC stated for each result.

Documented pairs (12) include `δ(t) → 1` (all `s`), `u(t) → 1/s` (`Re{s} > 0`),
`e^{−at}u(t) → 1/(s+a)` (`Re{s} > −a`), `t^n e^{−at}u(t) → n!/(s+a)^{n+1}`, `sin(ωt)u(t) → ω/(s²+ω²)`,
`cos(ωt)u(t) → s/(s²+ω²)`, plus the derivative and delay relations.

**Inverse of a proper rational F(s):**
1. Polynomial division when `deg B ≥ deg A`.
2. Poles of `A` (with multiplicity) via iterative root finding on the monic form.
3. Residues solved from the **exact coefficient identity** of
   `B/A = P + Σ_i Σ_{k=1..m_i} r_ik / (s − p_i)^k`, not by curve fitting.
4. The expansion is **verified** by evaluating `B/A` and the expansion at test points; the max error is shown.
5. Term-by-term mapping `1/(s−p)^k → t^{k−1}/(k−1)! · e^{pt}u(t)` — a **causal, right-sided** result.

Because the inverse is causal, the ROC is always a right half-plane `Re{s} > σ_max`, where `σ_max` is the
rightmost real part among non-cancelled poles. The app states this and does not pretend to handle two-sided
inverses. Expressions with `e^{−sT}` (delays, rectangular pulses) are listed as pairs but excluded from
pole/zero analysis with an explicit message rather than an invented answer.

## 7. Z-transform

Definition: `X(z) = Σ_{n=−∞}^{∞} x[n] z^{−n}`, evaluated for causal sequences as
`X(z) = Σ_{n≥0} x[n] z^{−n}` (so `u[n] → 1/(1 − z^{−1})`, `|z| > 1`).

Documented pairs (10) include `δ[n] → 1`, `u[n] → 1/(1−z^{−1})`, `a^n u[n] → 1/(1 − a z^{−1})`,
`n a^n u[n] → a z^{−1}/(1 − a z^{−1})²`, `cos(ω₀n)u[n]`, `sin(ω₀n)u[n]`.

**Inverse of a rational X(z):** the app computes the exact inverse **by recursion** from the difference
equation implied by the rational form (no root finding needed for the sequence itself), then optionally
cross-checks against the closed form for simple cases. Poles/zeros are computed from the same polynomials; the
ROC is `|z| > max|p|` for the causal case, and BIBO stability requires all poles strictly inside the unit
circle. Degree-0 denominators (pure gain) are handled explicitly.

Coefficients are entered **highest power first** in `z` (or in `z^{−1}`, per the field label), consistent with
`rational.ts`.

## 8. LTI systems

- **Difference equations** `Σ a_k y[n−k] = Σ b_m x[n−m]` are simulated with a direct-form recursion from
  **zero initial conditions** (`a₀` normalised to 1). Causality is therefore built in, not inferred.
- **BIBO stability (discrete)**: all poles strictly inside the unit circle. Margin = `1 − max|p|`.
- **BIBO stability (continuous)**: all poles strictly in the left half-plane. Margin = `−max Re{p}`.
- **Causality**: stated from the simulation model (causal by construction) and, for rational H(s)/H(z),
  from the ROC being a right half-plane / exterior of a circle. If the app is given a two-sided model it says
  it cannot decide, rather than guessing.
- **Frequency response** is evaluated on the unit circle (`z = e^{jω}`) or imaginary axis (`s = jω`). It is
  only meaningful where the ROC includes that contour — for unstable systems the app still plots the response
  but labels it as an algebraic evaluation of `H` on the contour, not a steady-state response.
- **Documented limits** (also shown in the UI): the analyser treats systems as LTI, rational, single-input
  single-output; it does not handle time-varying, nonlinear, state-space or multi-rate systems, and it does not
  detect pole/zero cancellation numerically beyond a tolerance.

## 9. Numerical policy

- **Precision**: display defaults to 4 significant figures (configurable). Full precision is available in CSV
  and JSON exports; nothing is rounded in storage.
- **Tolerances**: comparisons and stability margins use `1e-9` relative tolerance (`dsp.ts`), so a pole at
  `0.9999999999` is reported with its actual magnitude rather than snapped to 1. Root verification residuals
  are reported so a bad factorisation is visible.
- **Degenerate input** (`N = 0`, `fs ≤ 0`, period ≤ 0, division by zero, non-numeric text, degree mismatch)
  produces a specific validator message naming the field; it never falls through to `NaN`, `Infinity` or an
  empty chart.
- **Divergent recursions** (unstable systems with large poles) are stopped, and the app says the recursion
  diverged instead of plotting `1e300`.
- **Complex formatting**: `a + bj`, with `j` the imaginary unit; near-zero parts are shown as `0` (tolerance
  based) and never as `-1.2e-17`.

## 10. What the app deliberately does not claim

- No exact closed-form CTFT of arbitrary expressions (numerical only).
- No two-sided or anticausal inverse transforms.
- No symbolic simplification of user-defined signals beyond the documented expression grammar.
- No probabilistic or statistical inference from the plots.
