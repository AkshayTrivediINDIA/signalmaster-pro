# Contributing to SignalMaster Pro

Thanks for helping. This project cares more about *correctness* and *honesty* than about feature count.

## Ground rules

1. **No fake functionality.** A control that does nothing, a chart with invented data, or a hard-coded
   "success" is a bug. If something is not implemented, it must say so.
2. **No silent wrong answers.** If a computation cannot be done exactly, it must either be labelled as an
   approximation (with its parameter) or refused with an explanation. Never return a plausible-looking number.
3. **Every numeric claim needs a test** with an analytical reference value, not a snapshot of current output.
4. **No `eval`, `new Function`, or `Function()`** on user input, anywhere, ever.
5. **Accessibility is not optional**: labelled inputs, keyboard reachability, visible focus, and a text
   alternative for every chart.

## Getting set up

```bash
git clone <your-fork-url> signalmaster-pro
cd signalmaster-pro/frontend && npm ci
cd ../backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
```

Run the app (`npm run dev`), the API (`uvicorn app.main:app --reload --port 8000`), and the checks:

```bash
cd frontend
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test                # add PW_CHROMIUM=<path> if browsers are preinstalled
cd ../backend && python -m pytest -q
```

## Adding a module

1. **Core first.** Create `frontend/src/core/<module>.ts`. Export a pure `compute(params)` that returns
   `{ …results, diagnostics: string[], assumptions: string[] }` or throws an `Error` with a user-facing message.
   No React imports, no DOM access.
2. **Validation.** Add field validators in the feature or reuse `core/validation.ts`. Messages must name the
   field and the constraint ("Sample rate must be ≥ 1 Hz").
3. **Tests.** Add analytical cases to `frontend/src/tests/math-core.test.ts` (or a new `*.test.ts`).
4. **Route + registry.** Add an entry to `src/app/registry.ts` (id, path, title, icon, description, help text).
   Navigation, the command palette and the help panel read from it.
5. **UI.** Create `src/features/<module>/<Name>Lab.tsx` using existing primitives (`Card`, `NumberField`,
   `DataTable`, `SignalPlot`, `ExportMenu`, `SaveExperimentButton`). Show diagnostics and assumptions under the
   result.
6. **E2E.** Add a journey to `frontend/e2e/critical-flows.spec.ts` that a user would actually perform.

## Style

- TypeScript strict; prefer explicit types at module boundaries; avoid `any`.
- Components in PascalCase files, hooks in `useX.ts`, pure logic in `core`.
- Tailwind utility classes with the design tokens in `src/styles`; no inline hex colours.
- Comments explain *why* (conventions, tolerances, caveats), not *what*.
- Format with `npm run format`; lint with `npm run lint` (CI treats warnings as failures).

## Scientific changes

Any change to a definition, convention, tolerance or approximation must update
`docs/scientific-conventions.md` in the same commit. If a result changes, say so in the PR description with the
old and new values and the reference you checked against.

## Commits and PRs

- Conventional-ish messages: `feat(convolution): circular origin`, `fix(fft): Bluestein scaling`, `docs: …`.
- One concern per PR. Include: what changed, why, how it was verified (commands and their output), and what is
  still not covered.
- Do not claim a test passed if you did not run it, and do not paste results from a different commit.

## Reporting bugs

Include module, exact inputs, expected vs actual output, browser/OS, and whether the backend was running. For a
disputed number, add the analytical derivation — that is the fastest path to a fix.

## Code of conduct

Be civil and assume good faith. Harassment, dismissal of beginners' questions, or deliberate pseudoscience in
contributions will be removed.

## Licensing of contributions

By submitting a pull request you agree your contribution is licensed under the MIT License (see `LICENSE`).
