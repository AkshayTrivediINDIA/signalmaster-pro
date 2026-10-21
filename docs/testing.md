# Testing

Everything below was executed in this development environment. Results are reported exactly as they came out,
including the parts that are *not* covered.

## 1. Suites and how to run them

| Suite | Command | Location | Count |
| --- | --- | --- | --- |
| Numerical core + learning content + component tests | `cd frontend && npm test` | `frontend/src/tests/*.test.{ts,tsx}` | **104** |
| Type check | `cd frontend && npm run typecheck` | whole frontend | 0 errors |
| Lint | `cd frontend && npm run lint` | whole frontend | 0 errors, 0 warnings |
| Production build | `cd frontend && npm run build` | — | succeeds |
| Backend API + security | `cd backend && python -m pytest -q` | `backend/app/tests/test_api.py` | **36** |
| End-to-end (Chromium desktop + Pixel 7) | `cd frontend && npx playwright test` | `frontend/e2e/critical-flows.spec.ts` | **38** (19 journeys × 2 projects) |

Run everything: `./scripts/check.sh` (typecheck, lint, unit, build) plus `pytest` for the backend.

### Note on installing browsers for Playwright
`npx playwright install chromium` needs write access to the Playwright browser cache (~150 MB download). In a
sandbox that already ships Chromium, point the config at it instead:

```bash
PW_CHROMIUM=/path/to/chrome npx playwright test
```

`playwright.config.ts` reads `PW_CHROMIUM` and falls back to Playwright's own download.

## 2. Results (last full run)

```
npx tsc --noEmit                       → clean
npm run lint                           → 0 errors, 0 warnings
npm test                               → Test Files 4 passed | Tests 104 passed
npm run build                          → built in ~9 s, plotly/katex/react chunks emitted
python -m pytest -q      (backend/)    → 36 passed
npx playwright test --reporter=list    → 38 passed (chromium + mobile)
```

## 3. What the unit tests actually assert

**`math-core.test.ts` (61 tests)** — analytical references, not snapshots:

- Linear convolution `{1,2,3} * {1,1} = {1,3,5,3}`; origins preserved; `same`/`valid` modes; circular
  convolution with wrap-around and `N < N+M−1` aliasing; numerical CT convolution of two unit pulses gives a
  triangle of the right height/width within `O(Δt)`.
- FFT vs direct DFT agreement for lengths 8, 64, 128 and a prime length (Bluestein); `ifft(fft(x)) ≈ x`;
  Parseval's identity; 64-point DFT at 640 Hz puts a 100 Hz tone in bin 10.
- Sampling: 1200 Hz at 1000 Hz sample rate → alias at 200 Hz; Nyquist and resolution reporting.
- Polynomial roots and residual verification; partial fractions of `1/((s+1)(s+2))` → `e^{−t} − e^{−2t}`;
  repeated poles; improper fractions.
- Z-transform recursion: `y[n] = 0.5y[n−1] + x[n]` → DC gain 2; `y[n] = 1.2y[n−1] + x[n]` flagged unstable;
  rational→sequence matching a closed form.
- LTI: step response settling, impulse response length, stability/causality verdicts on known systems.
- Expression parser: precedence, unary minus, function table, unknown identifiers, division by zero, and
  rejection of code-injection attempts.
- Validation: each validator's boundary conditions and message content.

**`learning-content.test.ts` (23 tests)** — every MCQ has one correct option, an explanation, and a unique id;
every worked example's stated answer matches the value the same core functions produce (so the teaching content
cannot drift from the engine).

**`components.test.tsx` (20 tests)** — primitives render labels/hints/errors with the right ARIA wiring;
`ToastProvider` announces; `DataTable` supports empty state and sorting-accessible headers; `Equation` renders
KaTeX and degrades gracefully; `ExportMenu` triggers CSV/JSON downloads; `SaveExperimentButton` validates an
empty name and persists a valid one; `CommandMenu` filters and navigates; `SettingsProvider` persists theme;
`Calculator` evaluates a preset, reports a division-by-zero error, and prompts for unresolved variables.

The component suite found a real defect: `Modal`'s focus-management effect re-ran on every render and stole
focus mid-typing (only the first character was captured). Fixed by keeping the close callback in a ref and
depending on `open` only.

## 4. What the E2E tests cover

19 journeys, each run on desktop (1280×800) and Pixel 7 (412×915):

dashboard loads, palette opens with `Ctrl+K`, theme toggle persists, sidebar collapses, signal generator
produces a plot and CSV, invalid input shows a field error, operations align domains, linear convolution step
table, circular convolution warning, FFT spectrum, DTFT sweep, CTFT approximation note, Laplace pair →
poles/zeros, Z inverse recursion, LTI stability verdict, calculator presets and errors, learning MCQs update
progress, help panel opens per route, saved experiment appears on the dashboard.

## 5. Backend tests (`pytest`, 36)

- Health, forward Laplace for `1`, `exp(-2t)`, `sin(3t)`, `exp(-2t)cos(3t)`, `t^2`, inverse Laplace of
  `1/(s+2)` and `1/((s+1)(s+2))`, forward Z of `1`, `a^n` (expected error for unknown `a`), inverse Z.
- Explicit failure paths: unknown symbols, unsupported inverse, malformed expression → `error` field, never a
  fabricated result.
- Security: `__import__`, `eval`, `open`, `lambda`, attribute access, list literals, chained calls,
  `t; import os`, over-length expressions (400 chars) → `400`.
- Limits: oversized body → `413`; rate limit → `429`; compute timeout enforced (~0.8 s test budget);
  CORS allow-list behaviour; security headers present and the CSP is scoped to `/api` responses.

## 6. Known gaps — not tested, or tested weakly

- **No cross-browser E2E.** Chromium only; Firefox/WebKit not exercised (Plotly rendering differences untested).
- **No visual regression tests.** Layout is checked only for "element visible and clickable"; the design system
  (`docs/design-system.md`) is verified by reading it against screenshots in `docs/images/`, not by pixel diffs.
- **No coverage threshold.** `npm run test:coverage` exists and runs, but no gate is enforced.
- **Accessibility** is verified by ARIA assertions and manual keyboard walks, **not** by an automated audit
  (axe/pa11y) or a screen-reader session. WCAG 2.2 AA conformance is a design target, not a certified claim.
- **Continuous-time numerical methods** are validated against analytical results for a few canonical signals,
  not across a broad benchmark set.
- **Backend concurrency** (multiple simultaneous long requests) is not load-tested; the rate limiter is
  single-process.
- **Import of malformed/oversized experiment files** has unit-level validation but no fuzz testing.
- **Printing** is verified visually only; no test asserts the printable layout.
- **Time zones/locales**: dates are ISO strings; locale-dependent formatting is untested.

## 7. Continuous integration

`.github/workflows/ci.yml` runs on push/PR:

1. `frontend`: `npm ci` → `typecheck` → `lint` → `test` → `build` (Node 20).
2. `backend`: `pip install -r requirements-dev.txt` → `pytest` (Python 3.11).
3. `e2e`: `npx playwright install --with-deps chromium` → `npx playwright test`, uploading the report as an
   artifact on failure.

CI was **not** executed here (no GitHub runner available in the sandbox); the workflow file is written to match
the commands that were verified locally. Treat the first CI run as unverified.
