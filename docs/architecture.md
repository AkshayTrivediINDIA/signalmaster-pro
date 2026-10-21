# Architecture

## 1. Goals that shaped the design

1. **Every number is traceable.** Numerical work lives in pure modules with no UI imports and no hidden
   state, so a value on screen can always be reproduced by a unit test.
2. **Assume the engine is optional.** The symbolic service adds value but must never be required for the app
   to work. Everything except symbolic forward/inverse transforms is computed in the browser.
3. **Nothing is persisted server-side.** No accounts, no database, no telemetry. Saved experiments are JSON
   in `localStorage`, transferable through export/import.
4. **Untrusted input never becomes code.** The calculator uses a hand-written tokenizer/parser; the backend
   whitelists characters and parses with SymPy's restricted `parse_expr` tables.

## 2. System context

```
┌──────────────────────────── Browser (frontend/dist) ────────────────────────────┐
│  React shell ── Layout / CommandMenu / HelpPanel / SettingsDialog / ErrorBoundary│
│      │                                                                          │
│      ├── features/*  (one module per route, owns its form state)                │
│      │        │                                                                 │
│      │        ├── core/*      pure numerics: signals, convolution, fft,         │
│      │        │               fourier, rational roots, laplace, z, systems      │
│      │        ├── components/* ui primitives, Plotly wrapper, DataTable         │
│      │        └── services/*  storage (localStorage), export (csv/json/png), api│
│      └── settings + saved experiments (localStorage, versioned key)             │
└──────────────────────────────────┬──────────────────────────────────────────────┘
                                   │ optional  POST /api/symbolic/{laplace,z}
                                   │ (Vite dev proxy → 127.0.0.1:8000)
┌──────────────────────────────────┴──────────────────────────────────────────────┐
│ FastAPI service (backend/)                                                      │
│  middleware: body-size cap → rate limit → security headers → CORS               │
│  routes → symbolic_engine → spawn child process (timeout, memory guard)         │
│                              └── SymPy parse_expr with safe tables              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

The frontend is a **static SPA**: no server rendering, no API dependency for page load. The API call is the
only network request the app can make, and it is made lazily when a symbolic panel is opened.

## 3. Frontend layers

### 3.1 `src/core` — numerical core (3,666 lines, no React)

| File | Responsibility |
| --- | --- |
| `complex.ts` | Complex arithmetic, polar conversion, formatting. |
| `fft.ts` | Radix-2 Cooley–Tukey with bit-reversal, Bluestein for non-power-of-two lengths, `fft`/`ifft`, direct DFT cross-check helpers. |
| `dsp.ts` | Windows, next powers of two, dB conversion, sequence statistics, tolerance helpers. |
| `poly.ts` | Polynomial multiply/divide, evaluation, root polish, `polyFromRoots`. |
| `rational.ts` | Rational transfer-function analysis: highest-power-first coefficient lists, root finding + residual verification, partial-fraction expansion, DC/gain, pole classification. |
| `signals.ts` | Elementary CT/DT signal definitions, sample grids, expression sampling via `expr.ts`, numeric differentiation helpers. |
| `operations.ts` | Domain alignment for add/subtract/multiply, amplitude/time transforms, interpolation policy, meta about what was done. |
| `convolution.ts` | Linear (full/same/valid) and circular convolution with index origins, numerical CT convolution, step-by-step term tables. |
| `fourier.ts` | DFT, FFT, DTFT sweep, numerical CTFT, bin/frequency mapping, diagnostics (resolution, Nyquist, aliasing, reconstruction error). |
| `laplace.ts` | 12 documented pairs, inverse of a proper rational F(s), poles/zeros, ROC text, optional symbolic hand-off. |
| `ztransform.ts` | 10 documented pairs, exact recursion for rational X(z), z-plane poles/zeros, ROC, causality/stability notes. |
| `systems.ts` | Difference equations (`lfilter`-style recursion), impulse/step response, frequency response, BIBO stability, causality, documented applicability limits. |
| `expr.ts` | Tokenizer + recursive-descent parser for user expressions → AST → evaluator over a fixed function table. **No `eval`, no `new Function`.** |
| `validation.ts` | Field-level validators returning structured errors with actionable messages. |

Design rules for this layer:

- Inputs are plain data (numbers, arrays, coefficient lists); outputs are plain objects including the
  **diagnostics** that the UI needs to be honest (grid step, sample rate, tolerance used, assumption text).
- Errors are thrown as `Error` with user-facing messages and caught at the feature boundary — never printed
  as `NaN` in a table.
- Anything approximate is labelled approximate at the source, not in the view.

### 3.2 `src/app` — shell

| File | Responsibility |
| --- | --- |
| `App.tsx` | Providers, router, route table generated from `registry.ts`, lazy-loaded feature routes, error boundary. |
| `registry.ts` | Single source of truth for navigation, routes, icons, help content and settings metadata. |
| `Layout.tsx` | Sidebar (collapsible, off-canvas on mobile), top bar, engine status, theme toggle, breadcrumbs. |
| `AppContext.tsx` | `SettingsProvider` (theme, precision, grid defaults, plot preferences) persisted to `localStorage`. |
| `CommandMenu.tsx` | `Ctrl/⌘+K` palette over routes and actions; `Ctrl/⌘+/` help; keyboard-only reachable. |
| `HelpPanel.tsx` | Contextual help drawn from the registry — the same text the module uses. |
| `SettingsDialog.tsx` | Modal settings form with validation and reset. |
| `ErrorBoundary.tsx` | Route-level boundary that shows a recoverable error card instead of a blank page. |

### 3.2b Visual layer

`src/styles/index.css` holds the design tokens (per-theme RGB triplets) and the component vocabulary
(`card`, `btn*`, `input`, `table`, `note*`, `nav-link`, `seg`, `eyebrow`). `tailwind.config.js` maps tokens to
utilities; there is no second styling system and no CSS-in-JS. Two variable fonts (Inter, JetBrains Mono) are
self-hosted from `src/assets/fonts` and declared with `@font-face` in the same stylesheet, so typography is
identical offline and no request leaves the origin. Rules and rationale: `docs/design-system.md`.

### 3.3 `src/components`

- `ui/` — `Button`, `Field` (`NumberField`, `SelectField`, `SegmentedControl`, `TextAreaField`), `Card`,
  `Modal`, `Tabs`, `Tooltip`, `Badge`, `Stat`, `DataTable`, `Equation` (KaTeX), feedback (`Alert`,
  `NoteList`, `EmptyState`, `ToastProvider`).
- `plot/` — a single Plotly wrapper: theme tokens → layout template, responsive resize, `aria-label` +
  text description for screen readers, and one PNG export path.
- `common/` — `ExportMenu` (CSV/JSON/PNG/print), `SaveExperimentButton`, `FormulaBlock`, `SectionHeader`.

### 3.4 `src/features` — one folder per module

Modules are self-contained: local state, a form, a compute step called in `useMemo` on validated input, a
plot, a results table, diagnostics, and export. `CalculatorPage.ts` exists only as a thin re-export so tests
can import the component without the route module.

### 3.5 `src/services`

- `storage.ts` — the **only** module that touches `localStorage`; versioned keys (`smp.v1.*`), schema-tolerant
  reads, quota handling, export/import.
- `export.ts` — CSV/JSON serialisation with correct escaping, PNG via the Plotly wrapper, and print.
- `api.ts` — typed client for the optional backend with an explicit offline state.

## 4. Data flow (one module, end to end)

```
form input (string) → validation.ts → typed params
      → core/*.compute(params) → result object {series, diagnostics, table, assumptions} | Error
            ├── plot wrapper (traces + text alternative)
            ├── DataTable rows
            ├── diagnostics / assumption notes
            └── export.ts (CSV / JSON / PNG / print)
```

A failing compute never blanks the page: the previous valid result stays visible with an inline error.

## 5. Backend

```
app/main.py              app factory, middleware order, optional SPA mount
app/core/config.py       dataclass Settings read from SMP_* environment variables
app/core/security.py     character whitelist, token blacklist, safe parse tables,
                         TokenBucketLimiter, run_isolated() spawn-process runner
app/schemas/symbolic.py  Pydantic request/response models with length limits
app/services/symbolic_engine.py  SymPy forward/inverse Laplace and Z transforms,
                         ROC formatting, explicit unsupported-expression errors
app/api/routes.py        /api/health, /api/symbolic/laplace, /api/symbolic/inverse-laplace,
                         /api/symbolic/z, /api/symbolic/inverse-z
```

**Why a child process:** a symbolic transform can run long or blow up memory. `run_isolated` executes the
request in a spawned process with a wall-clock budget (`SMP_COMPUTE_TIMEOUT_SECONDS`) and returns a clean
`504` instead of blocking the event loop. Spawn (not fork) keeps the handler importable and avoids sharing
interpreter state.

**Why SymPy at all:** symbolic convolution-free algebra (closed-form forward transforms, ROC reporting) is
exactly what a browser lacks. Everything numeric is duplicated in TypeScript, so the two implementations act
as cross-checks — e.g. the Z-lab recursion result and the SymPy closed form are compared in tests.

## 6. State and persistence

| State | Where | Lifetime |
| --- | --- | --- |
| Form inputs / module results | React state inside the feature | Session |
| Settings (theme, precision, defaults) | `localStorage` via `SettingsProvider` | Persistent |
| Saved experiments | `localStorage` (`smp.v1.experiments`) | Persistent |
| Practice progress | `localStorage` (`smp.v1.progress`) | Persistent |
| Dashboard counts | Derived from the two stores above — **never fabricated** | Live |

Dashboard statistics are computed from what is actually stored: saved experiments, distinct modules visited,
questions answered correctly. An empty workspace shows zeros, not sample data.

## 7. Build and bundling

`vite.config.ts` splits vendor chunks so the initial route does not pay for Plotly:

- `plotly` — the basic bundle, loaded by chart routes
- `katex` — math routes
- `react` — framework
- feature routes are lazy `import()`s from the registry

Type checking runs as part of `npm run build` (`tsc --noEmit && vite build`), so a build cannot ship type
errors. `allowedHosts` includes the sandbox preview host used during development.

## 8. Extension points

- **New module**: implement `core/<name>.ts` with a pure `compute`, add a route entry in `registry.ts`, add a
  feature folder, add unit tests. Navigation, command palette, help panel and settings pick it up from the
  registry automatically.
- **New backend transform**: add a function to `symbolic_engine.py`, a route in `routes.py`, a schema, and a
  test in `test_api.py`; the frontend degrades gracefully if the route is absent.
