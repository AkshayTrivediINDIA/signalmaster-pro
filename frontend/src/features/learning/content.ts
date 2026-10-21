/**
 * Original educational content.
 *
 * Every worked example that makes a numerical claim is re-derived with the
 * application's own numerical core in `src/tests/learning-content.test.ts`, so a
 * typo in an answer or a stale formula fails the test suite.
 *
 * These questions are illustrative practice material written for this
 * application. They are not official examination questions and are not
 * affiliated with any board or university.
 */

export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface WorkedExample {
  id: string;
  prompt: string;
  steps: string[];
  answer: string;
  answerLatex?: string;
  check?: string;
}

export interface Question {
  id: string;
  difficulty: Level;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

export interface Topic {
  id: string;
  title: string;
  level: Level;
  summary: string;
  sections: { heading: string; body: string; latex?: string }[];
  formulas: { latex: string; note: string }[];
  worked: WorkedExample[];
  questions: Question[];
  related?: { moduleId: string; label: string };
}

export const TOPICS: Topic[] = [
  {
    id: 'signals-basics',
    title: 'Signals: classification and elementary functions',
    level: 'beginner',
    summary: 'Continuous versus discrete time, energy versus power signals, and the elementary functions everything else is built from.',
    related: { moduleId: 'signals', label: 'Open the Signal Generator' },
    sections: [
      {
        heading: 'Continuous and discrete time',
        body:
          'A continuous-time signal x(t) is defined for every real t; a discrete-time signal x[n] is defined only at integer indices. A discrete signal is not a "sampled continuous signal" by definition — that is one way to produce one. Keeping the two domains distinct prevents most of the confusion around frequency scaling, differentiation, and shifts.',
      },
      {
        heading: 'Elementary signals',
        body:
          'The unit impulse, unit step and ramp are the building blocks of signal algebra. The step is the running sum (integral) of the impulse; the ramp is the running sum of the step. In discrete time the relations are exact: u[n] − u[n−1] = δ[n].',
        latex: 'u[n] - u[n-1] = \\delta[n], \\qquad r[n] = \\sum_{k=-\\infty}^{n} u[k]',
      },
      {
        heading: 'Energy and power',
        body:
          'A finite-energy signal has E = ∫|x(t)|²dt < ∞; a finite-power signal has a finite average power over an infinite interval. Periodic signals such as sinusoids have infinite energy but finite power, so energy and power classifications are mutually exclusive (apart from the zero signal).',
        latex: 'E = \\int_{-\\infty}^{\\infty}|x(t)|^2dt, \\qquad P = \\lim_{T\\to\\infty}\\frac{1}{T}\\int_{-T/2}^{T/2}|x(t)|^2dt',
      },
    ],
    formulas: [
      { latex: '\\delta(t) = 0 \\;(t\\neq 0),\\; \\int\\delta(t)dt = 1', note: 'The impulse is defined by its area, not a value at a point.' },
      { latex: 'x(t)\\,\\delta(t-t_0) = x(t_0)\\,\\delta(t-t_0)', note: 'Sifting property.' },
      { latex: 'E_\\infty = \\sum_{n=-\\infty}^{\\infty}|x[n]|^2', note: 'Discrete-time energy.' },
      { latex: 'P_\\infty = \\lim_{N\\to\\infty}\\frac{1}{2N+1}\\sum_{n=-N}^{N}|x[n]|^2', note: 'Discrete-time power.' },
    ],
    worked: [
      {
        id: 'w-energy',
        prompt: 'Find the energy of x[n] = 3·(0.5)ⁿu[n].',
        steps: [
          'Energy for a real sequence: E = Σ |x[n]|² over n ≥ 0.',
          'x[n]² = 9·(0.25)ⁿ.',
          'Geometric series with ratio 0.25: Σ (0.25)ⁿ = 1/(1 − 0.25) = 4/3.',
          'E = 9 × 4/3 = 12.',
        ],
        answer: 'E = 12 (finite energy, so this is an energy signal).',
        answerLatex: 'E = \\sum_{n=0}^{\\infty} 9(0.25)^n = \\frac{9}{1-0.25} = 12',
        check: 'geometric-energy',
      },
      {
        id: 'w-period',
        prompt: 'Is x[n] = cos(2π·0.2·n) periodic, and what is its period?',
        steps: [
          'A discrete sinusoid cos(2πf n) is periodic only when f is rational.',
          'f = 0.2 = 1/5, so the period in samples is the denominator: N = 5.',
          'Check: x[n+5] = cos(2π(0.2)(n+5)) = cos(2π·0.2n + 2π) = x[n].',
        ],
        answer: 'Periodic with period N = 5 samples.',
        answerLatex: 'N = \\frac{1}{f} = \\frac{1}{0.2} = 5',
        check: 'discrete-period',
      },
    ],
    questions: [
      {
        id: 'q-u0',
        difficulty: 'beginner',
        prompt: 'With the right-continuous convention u(0) = 1, what is u[n] − u[n−1] at n = 0?',
        choices: ['−1', '0', '1', '2'],
        answerIndex: 2,
        explanation: 'u[0] = 1 and u[−1] = 0, so the difference is 1 — exactly δ[0]. For every other n both terms are equal and the difference is 0.',
      },
      {
        id: 'q-energy-power',
        difficulty: 'beginner',
        prompt: 'A periodic sine wave observed for all time has…',
        choices: ['finite energy and finite power', 'infinite energy and finite power', 'finite energy and infinite power', 'infinite energy and infinite power'],
        answerIndex: 1,
        explanation: 'Over an infinite interval the integral of sin² diverges (infinite energy), but the time-averaged value is 1/2 (finite power).',
      },
      {
        id: 'q-dt-vs-ct',
        difficulty: 'intermediate',
        prompt: 'Which operation is undefined for a discrete-time sequence as implemented here?',
        choices: ['Time shift by an integer', 'Time reversal x[−n]', 'Time scaling x(2n) treated as a continuous-style compression', 'Amplitude scaling by 2'],
        answerIndex: 2,
        explanation: 'Non-integer resampling (decimation/interpolation) is a design decision that changes the sample rate. This tool refuses to apply it implicitly rather than silently producing a different signal.',
      },
    ],
  },
  {
    id: 'signal-operations',
    title: 'Operations on the independent variable',
    level: 'beginner',
    summary: 'Shifting, scaling, reversal and how the order of operations changes the result.',
    related: { moduleId: 'operations', label: 'Open Signal Operations' },
    sections: [
      {
        heading: 'Shift, scale, reverse',
        body:
          'x(t − t₀) with t₀ > 0 moves the waveform to the right (a delay). x(at) compresses time when a > 1 and stretches it when 0 < a < 1. x(−t) mirrors the waveform about t = 0. These operations act on the time axis; amplitude scaling acts on the values.',
        latex: 'y(t) = x\\!\\left(\\frac{t - t_0}{a}\\right)',
      },
      {
        heading: 'Order matters',
        body:
          'Combining shift and scale is the classic trap: x(2t − 3) is not x(2(t − 3)). Factor the coefficient out first: x(2t − 3) = x(2(t − 1.5)), a compression by 2 combined with a delay of 1.5 — not 3. Always rewrite the argument in the form a(t − t₀) before interpreting it.',
      },
    ],
    formulas: [
      { latex: 'x(t-t_0): \\text{ delay by } t_0', note: 'Positive t₀ delays (moves right).' },
      { latex: 'x(at): \\text{ compress by } a \\;(a>1)', note: 'Time scaling, not amplitude scaling.' },
      { latex: 'x(-t): \\text{ time reversal}', note: 'Reflection about the vertical axis.' },
    ],
    worked: [
      {
        id: 'w-shift-scale',
        prompt: 'Given x(t) = rect(t) (1 for |t| ≤ 0.5), sketch y(t) = x(2t − 2).',
        steps: [
          'Rewrite the argument: 2t − 2 = 2(t − 1).',
          'So y(t) = x(2(t − 1)): compress the pulse by a factor of 2, then delay by 1.',
          'The original pulse is non-zero for |t| ≤ 0.5, i.e. width 1.',
          'After compression the width is 1/2; after the delay it is centred at t = 1.',
        ],
        answer: 'A rectangular pulse of width 0.5 centred at t = 1: y(t) = 1 for 0.75 ≤ t ≤ 1.25, and 0 elsewhere.',
        answerLatex: 'y(t) = 1 \\;\\text{for}\\; 0.75 \\le t \\le 1.25',
        check: 'shift-scale',
      },
    ],
    questions: [
      {
        id: 'q-order',
        difficulty: 'intermediate',
        prompt: 'x(3t + 6) is equivalent to which of the following?',
        choices: ['x(3(t + 6))', 'x(3(t + 2))', 'x(3(t − 2))', 'x(t + 2)'],
        answerIndex: 1,
        explanation: 'Factor out the 3: 3t + 6 = 3(t + 2). That is a compression by 3 plus an advance (left shift) of 2 — not a shift of 6.',
      },
      {
        id: 'q-reverse-shift',
        difficulty: 'intermediate',
        prompt: 'Starting from x(t), which pair of operations produces x(−t + 2)?',
        choices: ['Delay by 2, then reverse', 'Reverse, then advance by 2', 'Reverse, then delay by 2', 'Compress by 2, then reverse'],
        answerIndex: 2,
        explanation:
          'Reverse first: v(t) = x(−t). Then delay by 2: y(t) = v(t − 2) = x(−(t − 2)) = x(−t + 2). Reversing after a delay gives x(−(t + 2)) = x(−t − 2) instead, which is why the order matters.',
      },
    ],
  },
  {
    id: 'convolution',
    title: 'Convolution of discrete sequences',
    level: 'intermediate',
    summary: 'The convolution sum, its flip-and-slide interpretation, index alignment and output length.',
    related: { moduleId: 'convolution', label: 'Open the Convolution Lab' },
    sections: [
      {
        heading: 'Definition',
        body:
          'Convolution combines two sequences into a third. Operationally, one sequence is reversed and shifted, then the overlapping products are summed. It is commutative and associative, and it is the operation that maps an input to an output for any LTI system whose impulse response is h.',
        latex: 'y[n] = (x * h)[n] = \\sum_{k=-\\infty}^{\\infty} x[k]\\,h[n-k]',
      },
      {
        heading: 'Length and index origins',
        body:
          'If x has N samples starting at index n₀ₓ and h has M samples starting at n₀ₕ, then y has N + M − 1 samples starting at n₀ₓ + n₀ₕ. Ignoring the origins is the most common source of off-by-k errors when comparing with a hand calculation.',
      },
      {
        heading: 'Circular convolution',
        body:
          'Circular convolution wraps modulo N and is what multiplication of two DFTs produces. It equals the linear convolution exactly when N is at least N + M − 1 — which is why zero-padding is standard practice before multiplying spectra.',
        latex: 'y[n] = \\sum_{k=0}^{N-1} x[k]\\,h[(n-k) \\bmod N]',
      },
    ],
    formulas: [
      { latex: 'x[n]*\\delta[n-k] = x[n-k]', note: 'Convolution with a shifted impulse copies the signal.' },
      { latex: 'L_y = N + M - 1', note: 'Full linear-convolution length.' },
      { latex: '\\sum_n y[n] = \\left(\\sum_n x[n]\\right)\\left(\\sum_n h[n]\\right)', note: 'Quick arithmetic check on any convolution result.' },
    ],
    worked: [
      {
        id: 'w-linear',
        prompt: 'Convolve x[n] = {1, 2, 3} with h[n] = {1, 1}, both starting at n = 0.',
        steps: [
          'Output length: N + M − 1 = 3 + 2 − 1 = 4.',
          'y[0] = x[0]h[0] = 1·1 = 1.',
          'y[1] = x[0]h[1] + x[1]h[0] = 1·1 + 2·1 = 3.',
          'y[2] = x[1]h[1] + x[2]h[0] = 2·1 + 3·1 = 5.',
          'y[3] = x[2]h[1] = 3·1 = 3.',
        ],
        answer: 'y[n] = {1, 3, 5, 3}.',
        answerLatex: 'y[n] = \\{1, 3, 5, 3\\}',
        check: 'conv-123',
      },
      {
        id: 'w-circular',
        prompt: 'Compute the 4-point circular convolution of x[n] = {1, 2, 3, 0} with h[n] = {1, 1, 0, 0}.',
        steps: [
          'Linear convolution would be {1, 3, 5, 3, 0, 0, 0} (length 3 + 4 − 1 = 6).',
          'With N = 4 the terms at n ≥ 4 wrap: y[4] adds to y[0], y[5] to y[1], and so on.',
          'The linear result has no energy beyond index 3, so nothing wraps.',
        ],
        answer: 'y[n] = {1, 3, 5, 3} — identical to the linear result because the linear length (4) equals N.',
        answerLatex: 'y[n] = \\{1, 3, 5, 3\\}',
        check: 'circular-123',
      },
    ],
    questions: [
      {
        id: 'q-conv-length',
        difficulty: 'beginner',
        prompt: 'x[n] has 5 samples and h[n] has 4. How many samples does the full linear convolution have?',
        choices: ['4', '5', '8', '9'],
        answerIndex: 2,
        explanation: 'N + M − 1 = 5 + 4 − 1 = 8.',
      },
      {
        id: 'q-conv-sum',
        difficulty: 'intermediate',
        prompt: 'If x = {2, 1} and h = {1, −1}, what is Σ y[n]?',
        choices: ['−1', '0', '3', '4'],
        answerIndex: 1,
        explanation:
          'Term by term: y[0] = 2·1 = 2, y[1] = 2·(−1) + 1·1 = −1, y[2] = 1·(−1) = −1, so y = {2, −1, −1} and Σy = 0. The identity Σy = (Σx)(Σh) = 3 × 0 = 0 gives the same answer far faster.',
      },
      {
        id: 'q-circular-why',
        difficulty: 'advanced',
        prompt: 'Why is zero padding used before multiplying two DFTs?',
        choices: ['To increase amplitude', 'To make circular convolution equal linear convolution', 'To reduce the sampling rate', 'To remove the phase spectrum'],
        answerIndex: 1,
        explanation: 'Multiplying DFTs corresponds to circular convolution of length N. Padding to at least N + M − 1 makes the wrap-around terms zero, so the result equals the linear convolution.',
      },
    ],
  },
  {
    id: 'fourier',
    title: 'Fourier analysis and sampling',
    level: 'intermediate',
    summary: 'DFT conventions, bin frequencies, aliasing, leakage and the resolution trade-off.',
    related: { moduleId: 'fourier', label: 'Open the Fourier Lab' },
    sections: [
      {
        heading: 'From DTFT to DFT',
        body:
          'The DTFT is a continuous function of ω = 2πf that repeats every 2π. Sampling that function at N equally spaced points of the unit circle gives the DFT. Bin k corresponds to f = k/N cycles/sample, or f = k·fs/N Hz when the sampling rate is known.',
        latex: 'X[k] = \\sum_{n=0}^{N-1} x[n]e^{-j2\\pi kn/N}, \\qquad f_k = \\frac{k f_s}{N}',
      },
      {
        heading: 'Aliasing',
        body:
          'A discrete sequence cannot represent frequencies above fs/2. Content above the Nyquist frequency folds back to |f − fs|, disguising itself as a lower frequency. The only cure is a higher sampling rate or an analogue anti-alias filter placed before the sampler.',
      },
      {
        heading: 'Leakage and resolution',
        body:
          'The DFT assumes the N-sample record repeats forever. If a sinusoid does not complete an integer number of cycles in the record, the discontinuity at the wrap point spreads energy across neighbouring bins — spectral leakage. The main-lobe width is set by the observation time T = N/fs: Δf = 1/T. Windowing trades leakage against resolution.',
      },
    ],
    formulas: [
      { latex: 'f_{\\mathrm{Nyquist}} = f_s/2', note: 'Maximum representable frequency.' },
      { latex: '\\Delta f = f_s/N = 1/T', note: 'Bin spacing; fixed by observation time.' },
      { latex: 'X[k] = X^{*}[N-k] \\;\\text{(real } x\\text{)}', note: 'Conjugate symmetry; only half the bins are independent.' },
    ],
    worked: [
      {
        id: 'w-fft-bin',
        prompt: 'A 64-sample record is sampled at 640 Hz. A pure tone appears in bin k = 10. What is its frequency and the bin spacing?',
        steps: [
          'Bin spacing Δf = fs/N = 640/64 = 10 Hz.',
          'Frequency of bin k: f = k·Δf = 10 × 10 = 100 Hz.',
          'Nyquist is fs/2 = 320 Hz, so 100 Hz is unambiguous.',
        ],
        answer: 'f = 100 Hz, Δf = 10 Hz.',
        answerLatex: 'f = \\frac{k f_s}{N} = \\frac{10 \\cdot 640}{64} = 100\\,\\text{Hz}',
        check: 'fft-bin',
      },
      {
        id: 'w-alias',
        prompt: 'A 1200 Hz tone is sampled at 1000 Hz. At what frequency does it appear in the discrete spectrum?',
        steps: [
          'Nyquist is 500 Hz; 1200 Hz exceeds it.',
          'Fold using f_alias = |f − fs| = |1200 − 1000| = 200 Hz.',
          '200 Hz < 500 Hz, so it is a valid alias image.',
        ],
        answer: 'It appears at 200 Hz — indistinguishable from a genuine 200 Hz tone.',
        answerLatex: 'f_{\\mathrm{alias}} = |1200 - 1000| = 200\\,\\text{Hz}',
        check: 'alias-1200',
      },
    ],
    questions: [
      {
        id: 'q-resolution',
        difficulty: 'beginner',
        prompt: 'To double the frequency resolution of a DFT at a fixed sampling rate you must…',
        choices: ['Halve the sampling rate', 'Double the number of samples (longer record)', 'Use a rectangular window', 'Discard the phase'],
        answerIndex: 1,
        explanation: 'Δf = fs/N, so doubling N halves Δf. Resolution comes from observation time, not from zero padding (zero padding only interpolates the same information).',
      },
      {
        id: 'q-nyquist',
        difficulty: 'beginner',
        prompt: 'The maximum frequency that can be represented at fs = 8 kHz is…',
        choices: ['4 kHz', '8 kHz', '16 kHz', 'It depends on the window'],
        answerIndex: 0,
        explanation: 'The Nyquist limit is fs/2 = 4 kHz.',
      },
      {
        id: 'q-leakage',
        difficulty: 'advanced',
        prompt: 'A 1000 Hz tone is sampled at 8 kHz for exactly 0.1 s. Which statement is most accurate?',
        choices: [
          'The spectrum shows a single non-zero bin regardless of the DFT size',
          'Leakage is zero because the tone completes an integer number of cycles (100 cycles)',
          'The tone is aliased because 1000 Hz exceeds Nyquist',
          'The DFT cannot represent this signal at all',
        ],
        answerIndex: 1,
        explanation: 'Over 0.1 s a 1000 Hz tone completes exactly 100 cycles, so the record is periodic and the DFT bins line up with the tone — no leakage. Zero padding would change the bin spacing but not this property of the record.',
      },
    ],
  },
  {
    id: 'laplace',
    title: 'The Laplace transform and the s-plane',
    level: 'intermediate',
    summary: 'Transform pairs, region of convergence, pole locations and stability.',
    related: { moduleId: 'laplace', label: 'Open the Laplace Lab' },
    sections: [
      {
        heading: 'Definition and ROC',
        body:
          'The one-sided Laplace transform integrates the signal against e^{−st} for complex s = σ + jω. Because the integral converges only in part of the s-plane, a transform is incomplete without its region of convergence (ROC). Two different signals can share the same algebraic expression with different ROCs.',
        latex: 'F(s) = \\int_{0^{-}}^{\\infty} f(t)e^{-st}dt',
      },
      {
        heading: 'Poles, zeros and response shape',
        body:
          'For a rational F(s) = B(s)/A(s), the roots of A are poles and the roots of B are zeros. A simple pole at s = p contributes a term proportional to e^{pt}. Real negative poles give decaying exponentials; complex conjugate pairs give damped sinusoids; purely imaginary poles give sustained oscillation; right-half-plane poles grow without bound.',
      },
      {
        heading: 'Stability',
        body:
          'A causal continuous-time LTI system is BIBO stable if and only if every pole lies strictly in the open left half-plane. Poles on the imaginary axis are marginally stable: the impulse response is bounded but not absolutely integrable.',
      },
    ],
    formulas: [
      { latex: '\\mathcal{L}\\{e^{-at}u(t)\\} = \\frac{1}{s+a}', note: 'ROC: Re(s) > −a.' },
      { latex: '\\mathcal{L}\\{\\sin(\\omega t)u(t)\\} = \\frac{\\omega}{s^2+\\omega^2}', note: 'Poles at s = ±jω.' },
      { latex: '\\mathcal{L}\\{t\\,u(t)\\} = \\frac{1}{s^2}', note: 'Repeated pole at the origin.' },
      { latex: '\\mathcal{L}\\{f\\ast g\\} = F(s)G(s)', note: 'Convolution becomes multiplication.' },
    ],
    worked: [
      {
        id: 'w-inverse-partial',
        prompt: 'Find f(t) for F(s) = 1/((s+1)(s+2)), causal.',
        steps: [
          'Partial fractions: 1/((s+1)(s+2)) = 1/(s+1) − 1/(s+2).',
          'Verify at s = 0: 1/2 = 1 − 1/2 ✓.',
          'Invert each term: 1/(s+1) → e^{−t}u(t), 1/(s+2) → e^{−2t}u(t).',
        ],
        answer: 'f(t) = (e^{−t} − e^{−2t})u(t).',
        answerLatex: 'f(t) = \\left(e^{-t} - e^{-2t}\\right)u(t)',
        check: 'laplace-partial',
      },
      {
        id: 'w-stability',
        prompt: 'Is H(s) = 2/(s² + 3s + 2) BIBO stable, and what is its DC gain?',
        steps: [
          'Denominator s² + 3s + 2 = (s+1)(s+2), poles at −1 and −2.',
          'Both poles are in the open left half-plane → stable.',
          'DC gain = H(0) = 2/(0 + 0 + 2) = 1.',
        ],
        answer: 'Stable, with a steady-state (DC) gain of 1 — a unit step input settles at 1.',
        answerLatex: 'H(0) = \\frac{2}{2} = 1',
        check: 'laplace-dc',
      },
    ],
    questions: [
      {
        id: 'q-roc',
        difficulty: 'intermediate',
        prompt: 'For a causal signal whose poles are at s = −1 and s = 3, the ROC is…',
        choices: ['Re(s) > −1', 'Re(s) < 3', 'Re(s) > 3', '−1 < Re(s) < 3'],
        answerIndex: 2,
        explanation:
          'A right-sided (causal) signal needs an ROC to the right of every pole, so Re(s) > 3. That region does not include the jω axis, so the causal system is not BIBO stable — a positive real pole grows in time.',
      },
      {
        id: 'q-pole-meaning',
        difficulty: 'beginner',
        prompt: 'A pole at s = −4 corresponds in the time domain to…',
        choices: ['A growing exponential e^{4t}', 'A decaying exponential e^{−4t}', 'A constant', 'A sinusoid at 4 rad/s'],
        answerIndex: 1,
        explanation: 'The pole location p produces e^{pt}; with p = −4 the response decays with time constant τ = 1/4 s.',
      },
      {
        id: 'q-improper',
        difficulty: 'advanced',
        prompt: 'What does an improper rational F(s) (numerator degree > denominator degree) imply for the time-domain result?',
        choices: ['Nothing — the transform does not exist', 'Only decaying exponential terms', 'A polynomial part that corresponds to impulses and derivatives of impulses', 'A purely sinusoidal result'],
        answerIndex: 2,
        explanation: 'Polynomial long division produces a direct term; in the time domain this is a weighted sum of δ(t) and its derivatives. Only the strictly proper remainder contributes exponential terms.',
      },
    ],
  },
  {
    id: 'ztransform',
    title: 'The z-transform and the unit circle',
    level: 'intermediate',
    summary: 'Bilateral versus unilateral transforms, ROC conventions and stability on the unit circle.',
    related: { moduleId: 'ztransform', label: 'Open the Z-Transform Lab' },
    sections: [
      {
        heading: 'Definition',
        body:
          'The bilateral z-transform sums the sequence against z^{−n} over all n. Restricting to causal sequences gives the unilateral transform, which is what most textbooks tabulate. With z = e^{jω} the transform reduces to the DTFT, which is why the unit circle is the boundary between stable and unstable causal systems.',
        latex: 'X(z) = \\sum_{n=-\\infty}^{\\infty} x[n]z^{-n}',
      },
      {
        heading: 'Stability',
        body:
          'A causal rational system is BIBO stable if and only if every pole lies strictly inside the unit circle. The impulse response is then absolutely summable. Poles exactly on the circle give bounded but non-decaying responses (marginally stable); poles outside the circle grow.',
      },
      {
        heading: 'Inversion',
        body:
          'For rational transforms, partial fractions plus table lookup give a closed form: z/(z − p) inverts to pⁿu[n], and a repeated pole contributes a binomial-weighted term. Alternatively, the inverse can be computed exactly by recursing the difference equation — the method this application uses, and which it cross-checks against any closed form it displays.',
      },
    ],
    formulas: [
      { latex: 'a^n u[n] \\;\\longleftrightarrow\\; \\frac{z}{z-a},\\; |z|>|a|', note: 'Geometric sequence.' },
      { latex: 'u[n] \\;\\longleftrightarrow\\; \\frac{z}{z-1},\\; |z|>1', note: 'Pole on the unit circle: marginal.' },
      { latex: '\\delta[n-k] \\;\\longleftrightarrow\\; z^{-k}', note: 'Delay becomes multiplication by z^{-k}.' },
      { latex: 'H(z) = \\frac{B(z)}{A(z)},\\; \\text{stable} \\iff |p_i| < 1', note: 'For the causal ROC.' },
    ],
    worked: [
      {
        id: 'w-inverse-geo',
        prompt: 'Find the causal x[n] for X(z) = z/(z − 0.5).',
        steps: [
          'Write as 1/(1 − 0.5z⁻¹): X(z) = 1 + 0.5z⁻¹ + 0.25z⁻² + …',
          'Each term z^{−n} inverts to δ[n−n₀], so the coefficients are the sequence values.',
          'The coefficients follow 0.5ⁿ.',
        ],
        answer: 'x[n] = 0.5ⁿu[n].',
        answerLatex: 'x[n] = (0.5)^n u[n]',
        check: 'z-geo',
      },
      {
        id: 'w-stability-z',
        prompt: 'Is y[n] = 1.2y[n−1] + x[n] stable?',
        steps: [
          'H(z) = 1/(1 − 1.2z⁻¹), so the pole is at z = 1.2.',
          '|1.2| > 1, so the pole is outside the unit circle.',
          'The impulse response grows as 1.2ⁿ.',
        ],
        answer: 'Not BIBO stable — the output diverges for a bounded input.',
        answerLatex: '|p| = 1.2 > 1 \\Rightarrow \\text{unstable}',
        check: 'z-unstable',
      },
    ],
    questions: [
      {
        id: 'q-unit-circle',
        difficulty: 'beginner',
        prompt: 'A causal discrete system has all poles strictly inside the unit circle. It is…',
        choices: ['Unstable', 'Marginally stable', 'BIBO stable', 'Non-causal'],
        answerIndex: 2,
        explanation: 'Poles inside the unit circle make the impulse response absolutely summable, which is exactly the BIBO stability condition for the causal ROC.',
      },
      {
        id: 'q-bilateral',
        difficulty: 'advanced',
        prompt: 'Why must a z-transform always be quoted with its ROC?',
        choices: [
          'Because the ROC determines the sampling rate',
          'Because two different sequences can share the same algebraic X(z) but have different ROCs',
          'Because the ROC fixes the phase',
          'Because the ROC is only needed for unstable systems',
        ],
        answerIndex: 1,
        explanation: 'x[n] = aⁿu[n] and x[n] = −aⁿu[−n−1] both give z/(z−a) but with |z| > |a| and |z| < |a| respectively. Without the ROC the inverse is ambiguous.',
      },
    ],
  },
  {
    id: 'lti',
    title: 'LTI systems: properties and stability',
    level: 'intermediate',
    summary: 'Linearity, time invariance, memory, causality, invertibility and BIBO stability for difference equations and transfer functions.',
    related: { moduleId: 'systems', label: 'Open the LTI System Analyzer' },
    sections: [
      {
        heading: 'The LTI model',
        body:
          'A system is linear if superposition holds and time-invariant if a delay of the input produces the same delay of the output. For LTI systems the output is the convolution of the input with the impulse response. That single fact underpins the entire transform approach: convolution becomes multiplication in the frequency domain.',
        latex: 'y(t) = (x * h)(t), \\qquad Y(s) = X(s)H(s)',
      },
      {
        heading: 'Causality and memory',
        body:
          'A system is causal when the output depends only on present and past inputs — equivalently h(t) = 0 for t < 0. A memoryless system depends only on the present input (for example a pure gain). The difference-equation and rational-transfer-function models in this application are causal by construction.',
      },
      {
        heading: 'BIBO stability',
        body:
          'A system is bounded-input bounded-output stable if every bounded input produces a bounded output. For LTI systems this is equivalent to absolute summability (or integrability) of the impulse response, and therefore to a pole condition: inside the unit circle for discrete time, in the open left half-plane for continuous time.',
        latex: '\\sum_{n}|h[n]| < \\infty \\;\\Longleftrightarrow\\; \\text{BIBO stable}',
      },
    ],
    formulas: [
      { latex: 'y[n] = \\sum_k h[k]x[n-k]', note: 'Convolution form of an LTI difference equation.' },
      { latex: 'H(e^{j\\omega}) = \\sum_n h[n]e^{-j\\omega n}', note: 'Frequency response = DTFT of h[n].' },
      { latex: '\\text{DC gain} = H(1)\\;(\\text{DT}),\\; H(0)\\;(\\text{CT})', note: 'Steady-state response to a unit step.' },
    ],
    worked: [
      {
        id: 'w-diffeq',
        prompt: 'For y[n] = 0.5y[n−1] + x[n], find h[n] and decide stability.',
        steps: [
          'With x = δ and zero initial state: h[0] = 1, h[1] = 0.5, h[2] = 0.25, …',
          'So h[n] = 0.5ⁿu[n].',
          'Σ|h[n]| = 1/(1 − 0.5) = 2 < ∞ → BIBO stable.',
          'Equivalently, the pole z = 0.5 lies inside the unit circle.',
        ],
        answer: 'h[n] = 0.5ⁿu[n]; stable with DC gain H(1) = 1/(1 − 0.5) = 2.',
        answerLatex: 'H(1) = \\frac{1}{1-0.5} = 2',
        check: 'lti-firstorder',
      },
    ],
    questions: [
      {
        id: 'q-causal',
        difficulty: 'beginner',
        prompt: 'Which condition makes an LTI system causal?',
        choices: ['h(t) = 0 for t < 0', 'h(t) is even', 'The input is causal', 'The system is stable'],
        answerIndex: 0,
        explanation: 'Causality is a property of the system, not the input: the impulse response must vanish for negative time.',
      },
      {
        id: 'q-marginal',
        difficulty: 'advanced',
        prompt: 'A causal system has a simple pole exactly on the unit circle and no other poles outside it. This system is…',
        choices: ['BIBO stable', 'Marginally stable (bounded but not absolutely summable)', 'Unstable with exponential growth', 'Not LTI'],
        answerIndex: 1,
        explanation: 'A pole on the circle gives a bounded, non-decaying impulse response (e.g. u[n]), so the output stays bounded for bounded inputs but Σ|h[n]| diverges. That is marginal stability, not BIBO stability.',
      },
    ],
  },
];

export const findTopic = (id: string) => TOPICS.find((t) => t.id === id);

export const FORMULA_SHEET: { category: string; items: { latex: string; note: string }[] }[] = [
  {
    category: 'Elementary signals',
    items: [
      { latex: '\\delta(t) = 0\\,(t \\neq 0),\\; \\int_{-\\infty}^{\\infty}\\delta(t)dt = 1', note: 'Unit impulse (distribution).' },
      { latex: 'u(t) = 1\\,(t \\ge 0),\\; 0\\,(t<0)', note: 'Unit step, right-continuous.' },
      { latex: 'r(t) = t\\,u(t)', note: 'Unit ramp.' },
      { latex: '\\operatorname{rect}(t) = 1\\,(|t| \\le 1/2)', note: 'Unit rectangular pulse.' },
      { latex: '\\operatorname{sinc}(x) = \\frac{\\sin(\\pi x)}{\\pi x},\\; \\operatorname{sinc}(0)=1', note: 'Normalised sinc.' },
    ],
  },
  {
    category: 'Operations',
    items: [
      { latex: 'y(t) = x(t - t_0)', note: 'Delay by t₀ (>0 moves right).' },
      { latex: 'y(t) = x(at)', note: 'Compress by a > 1, stretch by 0 < a < 1.' },
      { latex: 'x(2t - 3) = x(2(t - 1.5))', note: 'Always factor before interpreting.' },
      { latex: 'y(t) = k\\,x(t)', note: 'Amplitude scaling only.' },
    ],
  },
  {
    category: 'Convolution',
    items: [
      { latex: '(x*h)[n] = \\sum_{k}x[k]h[n-k]', note: 'Discrete linear convolution.' },
      { latex: 'y[n] = \\sum_{k=0}^{N-1}x[k]h[(n-k)\\bmod N]', note: 'Circular convolution of length N.' },
      { latex: '(x*h)(t) = \\int x(\\tau)h(t-\\tau)d\\tau', note: 'Continuous convolution.' },
      { latex: 'L_y = N + M - 1', note: 'Output length for finite sequences.' },
      { latex: 'X(e^{j\\omega})H(e^{j\\omega}) \\;\\longleftrightarrow\\; x[n]*h[n]', note: 'Convolution theorem.' },
    ],
  },
  {
    category: 'Fourier',
    items: [
      { latex: 'X(k) = \\int_{-\\infty}^{\\infty}x(t)e^{-j2\\pi kt}dt', note: 'CTFT (frequency form).' },
      { latex: 'X[k] = \\sum_{n=0}^{N-1}x[n]e^{-j2\\pi kn/N}', note: 'DFT.' },
      { latex: 'x[n] = \\frac{1}{N}\\sum_{k=0}^{N-1}X[k]e^{j2\\pi kn/N}', note: 'IDFT (1/N scaling).' },
      { latex: 'f_k = k\\frac{f_s}{N},\\; \\Delta f = \\frac{f_s}{N}', note: 'Bin frequency and resolution.' },
      { latex: 'f_{\\mathrm{alias}} = |f - f_s|\\;\\text{for}\\; f_s/2 < f < f_s', note: 'Aliasing (first fold).' },
    ],
  },
  {
    category: 'Laplace',
    items: [
      { latex: 'F(s) = \\int_{0^{-}}^{\\infty}f(t)e^{-st}dt', note: 'One-sided (unilateral) transform.' },
      { latex: '\\mathcal{L}\\{u(t)\\} = 1/s,\\; \\mathrm{Re}(s)>0', note: 'Step.' },
      { latex: '\\mathcal{L}\\{e^{-at}u(t)\\} = \\frac{1}{s+a}', note: 'ROC Re(s) > −a.' },
      { latex: '\\mathcal{L}\\{\\cos(\\omega t)u(t)\\} = \\frac{s}{s^2+\\omega^2}', note: 'Cosine.' },
      { latex: '\\mathcal{L}\\{f\\ast g\\} = F(s)G(s)', note: 'Convolution theorem.' },
    ],
  },
  {
    category: 'Z-transform',
    items: [
      { latex: 'X(z) = \\sum_{n=-\\infty}^{\\infty}x[n]z^{-n}', note: 'Bilateral transform.' },
      { latex: 'a^nu[n] \\leftrightarrow \\frac{z}{z-a},\\; |z|>|a|', note: 'Geometric sequence.' },
      { latex: 'n\\,u[n] \\leftrightarrow \\frac{z}{(z-1)^2},\\; |z|>1', note: 'Ramp.' },
      { latex: '\\cos(\\omega_0 n)u[n] \\leftrightarrow \\frac{z(z-\\cos\\omega_0)}{z^2-2z\\cos\\omega_0+1}', note: 'Cosine sequence.' },
    ],
  },
  {
    category: 'Systems',
    items: [
      { latex: 'H(z) = \\frac{\\sum_k b_k z^{-k}}{\\sum_k a_k z^{-k}}', note: 'Discrete transfer function.' },
      { latex: 'y[n] = \\sum_{k=0}^{P}b_kx[n-k] - \\sum_{k=1}^{Q}a_ky[n-k]', note: 'Direct-form difference equation.' },
      { latex: '\\text{BIBO stable} \\iff \\sum_n |h[n]| < \\infty', note: 'Absolute summability.' },
      { latex: '|p_i| < 1\\;(\\text{DT}),\\; \\mathrm{Re}(p_i) < 0\\;(\\text{CT})', note: 'Pole conditions for causal stability.' },
    ],
  },
];
