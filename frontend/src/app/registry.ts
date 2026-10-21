/** Single source of truth for navigation, search, help and the dashboard. */

export interface ModuleHelp {
  summary: string;
  steps: string[];
  tips?: string[];
  conventions?: string[];
}

export interface ModuleDef {
  id: string;
  path: string;
  title: string;
  short: string;
  description: string;
  icon: string;
  group: 'Workspace' | 'Transforms' | 'Learning';
  keywords: string[];
  help: ModuleHelp;
}

export const MODULES: ModuleDef[] = [
  {
    id: 'signals',
    path: '/signals',
    title: 'Signal Generator',
    short: 'Generate signals',
    description: 'Create continuous- and discrete-time signals from standard library functions or your own expression.',
    icon: 'wave',
    group: 'Workspace',
    keywords: ['generator', 'sine', 'cosine', 'step', 'impulse', 'ramp', 'exponential', 'pulse', 'triangle', 'custom', 'sampling'],
    help: {
      summary: 'Build a signal from a standard waveform or a custom expression, then inspect, summarise and export it.',
      steps: [
        'Choose the domain: continuous time (a sampled rendering of a continuous function) or discrete time (integer samples n).',
        'Pick a waveform and set amplitude, frequency (Hz for CT, cycles/sample for DT), phase and shift.',
        'Set the time or index range and the number of samples.',
        'Press Generate, then read the parameter summary, formula and export menu.',
      ],
      conventions: [
        'u(0) = 1 (right-continuous step).',
        'rect and tri are evaluated with ≤ comparisons, so a sample exactly on an edge is included.',
        'A continuous impulse δ(t) is drawn as a unit-area stem — it has no finite height.',
      ],
      tips: ['Use the custom expression mode for anything not in the library, e.g. exp(-2*t)*sin(6*pi*t).'],
    },
  },
  {
    id: 'operations',
    path: '/operations',
    title: 'Signal Operations',
    short: 'Combine signals',
    description: 'Add, subtract, multiply, scale, shift, reverse, fold and compare two signals with explicit domain rules.',
    icon: 'operations',
    group: 'Workspace',
    keywords: ['add', 'subtract', 'multiply', 'scale', 'shift', 'reverse', 'fold', 'compare', 'time scaling'],
    help: {
      summary: 'Apply an algebraic or time-domain operation and see the original and resulting signals side by side.',
      steps: [
        'Build signal 1 and signal 2 (both must be in the same domain).',
        'Choose the operation.',
        'For binary operations pick how each signal is treated outside its own support.',
        'Read the metrics table for the difference, RMS error and correlation (comparison mode).',
      ],
      conventions: [
        'Mixing continuous and discrete operands is refused — the domains are not interchangeable.',
        'Continuous operands are aligned on a shared uniform grid with linear interpolation (an approximation, reported in the notes).',
      ],
      tips: ['x(t−t₀) delays a continuous signal when t₀ > 0; x[n−k] shifts a sequence right by k samples.'],
    },
  },
  {
    id: 'convolution',
    path: '/convolution',
    title: 'Convolution Lab',
    short: 'Convolve sequences',
    description: 'Linear and circular convolution with index origins, step-by-step arithmetic and sampled continuous convolution.',
    icon: 'convolution',
    group: 'Workspace',
    keywords: ['convolution', 'linear', 'circular', 'LTI', 'sum', 'riemann', 'continuous'],
    help: {
      summary: 'Convolve two finite sequences (or two sampled continuous signals) and inspect the arithmetic term by term.',
      steps: [
        'Enter x[n] and h[n] as comma-separated values and set each index origin n₀.',
        'Choose linear or circular convolution (circular needs a length N).',
        'Press Compute to see the output, index alignment and the first output samples expanded as Σ x[k]h[n−k].',
        'Export the result as CSV for verification against your own working.',
      ],
      conventions: [
        'y[n] = Σ_k x[k]h[n−k]; the output support starts at n₀ₓ + n₀ₕ and has length N + M − 1.',
        'Circular convolution is periodic modulo N, so a single index origin is a display choice.',
        'Continuous convolution is a Riemann sum y(t) ≈ Δτ Σ x(kΔτ)h(t−kΔτ) — the step size is reported.',
      ],
      tips: ['Verify the identity {1,2,3} * {1,1} = {1,3,5,3} with the built-in example.'],
    },
  },
  {
    id: 'fourier',
    path: '/fourier',
    title: 'Fourier Transform Lab',
    short: 'Analyse spectra',
    description: 'DFT, FFT, DTFT and numerical CTFT with magnitude, phase, resolution and aliasing diagnostics.',
    icon: 'fourier',
    group: 'Transforms',
    keywords: ['fourier', 'fft', 'dft', 'dtft', 'ctft', 'spectrum', 'magnitude', 'phase', 'aliasing', 'leakage'],
    help: {
      summary: 'Study the frequency content of a signal and understand the practical limits of sampled analysis.',
      steps: [
        'Build or paste a signal in the time domain.',
        'Choose DFT/FFT (discrete), DTFT sweep or CTFT integration.',
        'Adjust the frequency range and points-per-decade if needed.',
        'Inspect the magnitude (linear or dB) and phase plots, then export the bin table.',
      ],
      conventions: [
        'DFT: X[k] = Σ x[n]e^{−j2πkn/N} with inverse scaled by 1/N.',
        'Bin k corresponds to f = k·fs/N; the one-sided spectrum doubles bins 1…N/2−1.',
        'CTFT is computed as a truncated rectangle-rule integral over the observation window.',
      ],
      tips: ['A signal that is not periodic within the record leaks energy across bins — this is not an error.'],
    },
  },
  {
    id: 'laplace',
    path: '/laplace',
    title: 'Laplace Transform Lab',
    short: 's-domain analysis',
    description: 'Standard transform pairs, rational inverse transforms, poles, zeros and region-of-convergence guidance.',
    icon: 'laplace',
    group: 'Transforms',
    keywords: ['laplace', 's-domain', 'pole', 'zero', 'ROC', 'inverse', 'transfer function'],
    help: {
      summary: 'Look up exact transform pairs or invert a rational F(s) with a verified partial-fraction expansion.',
      steps: [
        'In the table tab, choose a standard pair and adjust its parameters.',
        'In the rational tab, enter numerator and denominator coefficients in s (highest power first).',
        'Press Analyse to see the inverse transform, its numeric time plot, poles, zeros and stability.',
      ],
      conventions: [
        'The default interpretation is causal/right-sided (the ROC lies to the right of all poles).',
        'Coefficients are entered highest-power first: s² + 3s + 2 → 1, 3, 2.',
        'Non-rational transforms (containing e^{−sT}) are shown as reference formulas only.',
      ],
      tips: ['An improper fraction produces an impulse term from polynomial division; this is stated in the notes.'],
    },
  },
  {
    id: 'ztransform',
    path: '/z-transform',
    title: 'Z-Transform Lab',
    short: 'z-domain analysis',
    description: 'Standard z-pairs, rational inverse transforms by exact recursion, pole-zero plots and ROC notes.',
    icon: 'ztransform',
    group: 'Transforms',
    keywords: ['z transform', 'z-plane', 'unit circle', 'pole zero', 'ROC', 'inverse z', 'bilateral'],
    help: {
      summary: 'Analyse the bilateral z-transform of sequences and invert rational transforms causally.',
      steps: [
        'Choose a table pair, or enter numerator/denominator polynomials in z.',
        'Set the number of output samples for the inverse sequence.',
        'Press Analyse to see the recursion result, the closed form (when available) and the pole-zero map.',
      ],
      conventions: [
        'Bilateral transform X(z) = Σ x[n]z^{−n}; for causal sequences the unilateral form agrees.',
        'The inverse shown is the causal (right-sided) result.',
        'Poles are drawn in the z-plane with the unit circle as the stability boundary.',
      ],
      tips: ['The closed form is cross-checked against the recursion; if they disagree it is withheld.'],
    },
  },
  {
    id: 'systems',
    path: '/systems',
    title: 'LTI System Analyzer',
    short: 'Analyse systems',
    description: 'Impulse/step responses, frequency response, pole-zero maps and stability for supported system models.',
    icon: 'system',
    group: 'Workspace',
    keywords: ['LTI', 'impulse response', 'step response', 'stability', 'causality', 'bibo', 'difference equation', 'transfer function'],
    help: {
      summary: 'Examine a discrete difference equation or a continuous rational transfer function in time and frequency.',
      steps: [
        'Select discrete (difference equation) or continuous (transfer function) mode.',
        'Enter the b/a coefficients (discrete) or numerator/denominator (continuous).',
        'Press Analyse to view h[n]/h(t), the step response, the frequency response and the property report.',
      ],
      conventions: [
        'Discrete: Σ a_k y[n−k] = Σ b_k x[n−k] with zero initial conditions.',
        'Continuous: H(s) = B(s)/A(s), causal interpretation.',
        'Linearity and time invariance are model assumptions of the LTI class — they are not inferred from data.',
      ],
      tips: ['Stability is BIBO: poles inside the unit circle (DT) or in the open left half-plane (CT).'],
    },
  },
  {
    id: 'calculator',
    path: '/calculator',
    title: 'Engineering Calculator',
    short: 'Evaluate expressions',
    description: 'Safe expression evaluation with signal-processing presets, units and step-by-step numeric output.',
    icon: 'calculator',
    group: 'Workspace',
    keywords: ['calculator', 'expression', 'db', 'rms', 'power', 'decibel', 'snr', 'sinc'],
    help: {
      summary: 'Evaluate a mathematical expression using the documented function set — no arbitrary code execution.',
      steps: [
        'Type an expression, or load a preset from the panel.',
        'Assign numeric values to any variables the expression needs.',
        'Press Evaluate; results show the value, the parsed form and any domain errors.',
      ],
      conventions: [
        'Angles are in radians; use deg()/rad() to convert.',
        'log is base 10, ln is natural, log2 is base 2.',
        'sinc(x) = sin(πx)/(πx); u(x) is the Heaviside step with u(0)=1.',
      ],
      tips: ['The calculator reports exact rational results when both operands are integers and the result is rational.'],
    },
  },
  {
    id: 'learning',
    path: '/learning',
    title: 'Learning & Practice',
    short: 'Study and practise',
    description: 'Topic tutorials, formula reference, worked examples and self-marking practice questions.',
    icon: 'learning',
    group: 'Learning',
    keywords: ['tutorial', 'learn', 'quiz', 'practice', 'formula', 'revision', 'progress'],
    help: {
      summary: 'Original study material with worked solutions and practice questions, organised by difficulty.',
      steps: [
        'Pick a topic from the list.',
        'Read the tutorial and check the formula reference.',
        'Work through the worked examples, then try the practice questions.',
        'Your answers are stored locally so you can track progress on this device.',
      ],
      conventions: [
        'All worked solutions in this app were recomputed and verified numerically.',
        'Questions are illustrative practice material, not official examination questions.',
      ],
    },
  },
];

export const getModule = (id: string): ModuleDef | undefined => MODULES.find((m) => m.id === id);

export const dashboardQuickStart: { title: string; description: string; path: string; icon: string }[] = [
  { title: 'Generate a 5 Hz sine', description: 'Continuous time, 2 s window, 800 samples.', path: '/signals', icon: 'wave' },
  { title: 'Verify a convolution by hand', description: 'x = {1,2,3}, h = {1,1} → y = {1,3,5,3}.', path: '/convolution', icon: 'convolution' },
  { title: 'Measure a tone with the FFT', description: 'Discrete cosine, 64 samples, tone at bin 8.', path: '/fourier', icon: 'fourier' },
  { title: 'Check stability of 1/(z − 0.9)', description: 'Pole inside the unit circle → stable.', path: '/systems', icon: 'system' },
];
