# SignalMaster Pro — Final Report

Date: 2026-10-21 · Status: **complete and verified in this environment**

This report states what was built, what was actually executed, what is known to be limited, and what remains.
Every number below came from a command run in this workspace; no result is copied from a plan or an earlier
draft. Where something is not covered, it says so.

---

## 1. What was delivered

A working web application (React + TypeScript + Vite frontend, optional FastAPI + SymPy backend) covering all
nine requested modules, with real computation behind every visible control, plus documentation, tooling and CI.

| Area | Delivered |
| --- | --- |
| Application shell | Collapsible sidebar grouped by workspace/transforms/learning, top bar with global search, command palette (`Ctrl/⌘+K`), contextual help (`Ctrl/⌘+/`), settings dialog, engine-status indicator, light/dark themes persisted per browser, route-level error boundary, responsive down to 390 px. |
| A. Signal generator | 9 signal families + user expressions, CT and DT, sample grid control, formulas, statistics, stem vs line rendering, CSV/JSON/PNG export. |
| B. Signal operations | Add, subtract, multiply, compare, scale, shift, reverse, time-scale — with explicit domain union, interpolation and out-of-support policy. |
| C. Convolution lab | Linear (full/same/valid, index origins), circular mod N (with an aliasing warning when N is too small), numerical CT convolution, term-by-term step tables, CSV export. |
| D. Fourier lab | DFT (direct), FFT (radix-2 + Bluestein), DTFT sweep, numerical CTFT, magnitude (linear/dB) and phase, bin tables, resolution/Nyquist/alias/reconstruction diagnostics. |
| E. Laplace lab | 12 documented pairs, rational inverse with verified partial fractions, pole/zero table, ROC, stability notes, optional SymPy forward/inverse. |
| F. Z-transform lab | 10 documented pairs, exact inverse by recursion, cross-checked closed forms, z-plane pole/zero map, ROC/stability notes. |
| G. LTI analyzer | Difference equations and rational H(s): impulse/step response, frequency response, pole–zero maps, BIBO stability and causality with the model assumptions printed next to the verdict. |
| H. Calculator | Safe tokenizer/parser/evaluator (no `eval`), documented function table, SP presets, units, exact-vs-approximate labels, step-by-step output. |
| I. Learning | 7 topics, worked examples whose answers are produced by the same core functions, self-marking MCQs with explanations, local progress, searchable formula reference. |
| Visual design | Instrument-panel visual language: neutral canvas, one steel-blue accent, hairline borders instead of shadows, 13.5 px base type with tabular numerals, self-hosted Inter + JetBrains Mono, dense data tables, left-accent selection rows, compact 28–30 px controls, matching light/dark token sets, muted 7-hue chart palette. Documented in `docs/design-system.md`. |
| Cross-cutting | CSV/JSON/PNG/print exports, saved experiments (rename/duplicate/load/delete/import/export), real dashboard statistics from stored data, ARIA labels and text alternatives for every chart. |
| Backend | FastAPI + SymPy symbolic engine: 5 endpoints, character whitelist, safe `parse_expr` tables, spawn-process timeout, body-size cap, rate limiter, security headers, CORS allow-list, optional SPA serving. |
| Docs | README, CONTRIBUTING, LICENSE (MIT), `.gitignore`, `docs/architecture.md`, `docs/scientific-conventions.md`, `docs/security.md`, `docs/testing.md`, `docs/deployment.md`, `docs/troubleshooting.md`, backend README, real screenshots. |
| Tooling | ESLint + Prettier, Vitest + RTL, Pytest, Playwright (desktop + mobile projects), `scripts/check.sh`, `scripts/dev.sh`, GitHub Actions CI (frontend / backend / E2E jobs). |

---

## 2. Test and build results (actually executed)

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | **clean**, 0 errors |
| Lint | `npm run lint` | **0 errors, 0 warnings** |
| Unit + component tests | `npx vitest run` | **104 passed** (61 math core, 20 components, 23 learning content) |
| Production build | `npm run build` | **succeeds** — `index` 81 kB, `react` 164 kB, `katex` 258 kB, `plotly` 1,097 kB (gzip 377 kB), lazy feature chunks |
| Backend tests | `python3 -m pytest -q` in `backend/` | **36 passed** |
| E2E | `PW_CHROMIUM=… npx playwright test --reporter=list` | **38 passed** (19 journeys × chromium desktop + Pixel 7) |

The E2E dashboard assertion was updated with the redesign: it now checks the `Dashboard` heading and that all
nine modules are listed and reachable from the module index, instead of the removed welcome banner.

All of the above were re-run after the last code change (the Modal focus fix, the KaTeX `trust: false` change and
the CSP-scoped security headers), so the numbers match the current tree.

### Defects found and fixed during testing (not planned — discovered)

1. **Modal stole keyboard focus on every render.** The focus-management effect re-ran whenever a parent
   re-rendered, so typing into the "Save experiment" field captured only the first character. Found by the new
   component test, fixed by holding the close callback in a ref and depending only on `open`.
2. **Convolution legend showed every stem.** Stem traces were duplicated in the legend; split into a hidden
   stem trace plus a single marker trace.
3. **Laplace/Z labs defaulted to a pair that legitimately errors** (ideal impulse), so first paint looked
   broken; defaults changed to pairs with plottable waveforms and the impulse case now returns an explicit
   "distribution, no plottable waveform" message.
4. **Z lab rejected degree-0 denominators** (pure gain), fixed.
5. **Mobile navigation lacked an accessible name** on the `<nav>`; fixed and now covered by E2E.
6. **Vite 5 blocked the sandbox preview host** (`403 Blocked request`); fixed with `allowedHosts` and verified
   with a restart.
7. **SymPy returned an unevaluated `Piecewise`** for a z-transform of a constant, and a conditional (`True`)
   upper bound for Laplace; both were handled explicitly rather than being reported as failures.
8. **Backend tests could not pickle test-local functions** through the spawn isolation layer; helpers moved to
   module level so the isolation path is genuinely exercised.
9. **`prefer-const` lint violation and a render-time `setState`** in the numeric-field hook; both fixed.
10. **Chart series and their stems were coloured from different palette slots**, so a discrete signal's stems
    and markers came out in two different colours. Colour is now assigned per series in the Plotly wrapper
    (hidden helper traces inherit the series colour).
11. **Table headers were uppercased by CSS**, which corrupted unit labels (`t (s)` → `T (S)`); the transform was
    removed and the header weight/spacing raised instead.
12. **`summary` elements were not flex**, so the custom disclosure chevron sat next to the text instead of at the
    end of the row; fixed in the base layer.

---

## 3. Verified numerical references

Checked by tests (unit or pytest), not by eye:

- `{1,2,3} * {1,1} = {1,3,5,3}` (linear convolution).
- 64-point DFT at 640 Hz → 100 Hz tone lands in bin 10 (0.1 cycles/sample).
- 1200 Hz sampled at 1000 Hz → alias at 200 Hz.
- `FFT` vs direct `DFT` agreement < 1e-9 relative for lengths 8, 64, 128 and a prime length; `ifft(fft(x)) ≈ x`;
  Parseval holds.
- `ℒ⁻¹{1/((s+1)(s+2))} = e^{−t} − e^{−2t}`; partial-fraction expansion verified numerically against `F(s)`.
- `y[n] = 0.5y[n−1] + x[n]` → DC gain 2 (stable); `y[n] = 1.2y[n−1] + x[n]` → flagged unstable.
- Symbolic engine: `1 → 1/s` (Re(s) > 0), `exp(-2t) → 1/(s+2)`, `sin(3t) → 3/(s²+9)`,
  `exp(-2t)cos(3t) → (s+2)/((s+2)²+9)`, `ℒ⁻¹{1/(s+2)} → exp(-2t)·Heaviside(t)`, `1 → 1/(1 − z⁻¹)`.
- Injection attempts (`__import__`, `eval`, `open`, `lambda`, `t.__class__`, `[1,2,3]`, `f()()`, `t; import os`)
  all rejected with `400`; 400-char input rejected; 8 KB+ body → `413`; over-budget compute → `504`.

---

## 4. Honest limitations

Scientific / numerical
- Continuous-time convolution, CTFT and "CT" rendering are **sampled approximations** (rectangle rule, `O(Δτ)`
  error); `Δτ` is reported in the UI and in exports.
- Only **causal (right-sided)** inverse Laplace/Z transforms; no two-sided/anticausal case.
- Pole/zero analysis is limited to **rational** functions of modest degree; expressions with delays (`e^{−sT}`)
  are listed as reference pairs but excluded from pole/zero analysis with an explicit message.
- The symbolic engine supports a **documented subset**; unsupported input returns an error rather than a guess.
- No window functions are applied in the Fourier lab (leakage is reported, not compensated).

Application / operational
- **No cloud sync or accounts.** Data lives in one browser profile; export/import is the transfer path.
- No PDF export (print-to-PDF is the supported route); PNG export is for plots.
- Rate limiting is **single-process, in-memory**; multi-instance deployments need a proxy-level limiter.
- No authentication on the API — intended for localhost or behind your own gateway.

Testing
- E2E is **Chromium-only**; Firefox/WebKit and real iOS Safari were not exercised.
- No visual-regression tests, no coverage gate, and **no automated accessibility audit** (axe/pa11y) or
  screen-reader session. WCAG 2.2 AA is a design target, not a certified claim.
- Backend concurrency/load and fuzz-testing of imported files were **not** performed.
- The CI workflow was written to match the locally verified commands but was **not executed** here (no GitHub
  runner in the sandbox). Treat the first CI run as unverified.
- Printing was checked visually only.

---

## 5. Remaining work

Optional, in rough priority order:

1. Run the GitHub Actions workflow once on a real runner (validates `npm ci` and browser install paths).
2. Add Firefox + WebKit projects to Playwright and an axe-core accessibility check per route.
3. Add window functions (Hann/Hamming/Blackman) with coherent-gain reporting, and a periodogram view.
4. Two-sided / anticausal inverse transforms with explicit ROC selection.
5. Move the rate limiter to a shared store for multi-worker deployment.
6. Coverage thresholds and mutation testing for `src/core`.
7. Optional: PDF report export (plot + table + assumptions) generated client-side.

None of these block the delivered scope; each is a genuine improvement rather than a missing control.

---

## 6. How to run it

```bash
cd frontend && npm ci && npm run dev           # http://localhost:5173
cd backend  && pip install -r requirements.txt && uvicorn app.main:app --port 8000   # optional
./scripts/check.sh                             # typecheck + lint + tests + build (+ pytest)
```

See `README.md` for the full feature list and `docs/` for conventions, security, testing and deployment.
