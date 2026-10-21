# Troubleshooting

Symptoms → causes → fixes. If a symptom is not listed, check the browser console first: the app surfaces its
own errors as inline messages, so anything in the console is usually a build/serve problem rather than maths.

## The page is blank or shows a 404 after deployment

**Cause:** client-side routing without an SPA fallback, or the app was built for a sub-path.
**Fix:** add the rewrite described in `docs/deployment.md` §A. For a sub-path deployment set `base: '/repo-name/'`
in `vite.config.ts` and rebuild.

## Vite dev server returns `403 Blocked request` for the preview host

**Cause:** Vite 5 refuses unknown `Host` headers.
**Fix:** `server.allowedHosts` in `vite.config.ts` already lists the preview hosts used during development. Add
your own hostname there, or run behind a proxy that sets `Host` correctly. Restart the dev server after the edit.

## "Symbolic engine offline" in the sidebar

**Cause:** the FastAPI service is not reachable.
**Fix:** start it (`cd backend && uvicorn app.main:app --port 8000`) and, in dev, keep the Vite proxy on `/api`
(`vite.config.ts`). Check `curl http://127.0.0.1:8000/api/health`. **This is not an app failure** — all numeric
modules work without it; only the symbolic panels are unavailable, and they say so.

## Symbolic request returns `504`

The computation exceeded `SMP_COMPUTE_TIMEOUT_SECONDS` (default 6 s). Simplify the expression or raise the
budget. A timeout is reported as a timeout, never as a result.

## Symbolic request returns `429`

Rate limit hit (`SMP_RATE_LIMIT_PER_MINUTE`, default 30 per minute per client). Wait for the `Retry-After`
period, or raise the limit for local use.

## `413 Request body too large`

Body exceeded `SMP_MAX_BODY_BYTES` (8 KB). This is a guard, not a bug — expressions are capped at 300 characters.

## "… is not a number" / field errors that will not clear

The field validators require plain numeric text (e.g. `1e-3`, `-2.5`); units are separate inputs. Custom signal
expressions accept `t`, `n`, `pi`, `e` and the documented function list — see the help panel (`Ctrl/⌘+/`) on the
module. Typing `sin(2*pi*5*t)` is valid; `np.sin(...)`, `Math.sin(...)` or implicit multiplication like `2t` are
not.

## Custom expression says a variable needs a value

The expression uses an identifier that is not a known variable for that module (e.g. `x` in the signal
generator, where only `t`/`n` exist). The message names the variable; either remove it or use the variables the
module defines.

## Plotly chart is empty or the console reports `ResizeObserver loop`

- Empty chart: the compute returned no points — usually a zero-length grid or a signal that is identically zero
  on the chosen window. Check the diagnostics under the plot.
- `ResizeObserver` warnings come from the chart resizing inside a flex layout; they are harmless. If the chart
  does not repaint after a sidebar toggle, resize the window once — the wrapper listens for container size
  changes.

## PNG export downloads a blank file

Plotly needs a painted canvas. Wait for the plot to finish rendering, and avoid exporting while the tab is in
the background (browsers throttle canvas work there).

## Print preview is missing the sidebar/plots

Print styles intentionally hide navigation and dark backgrounds; charts are included, tables are expanded.
Use "Print → Save as PDF" for a portable copy. No PDF is generated server-side.

## Saved experiments disappeared

They live in `localStorage` for the current origin and browser profile. Private/incognito windows, clearing site
data, switching from `http://localhost` to `http://127.0.0.1`, or a different port all count as a different
origin. Use **Export JSON** before clearing data, and **Import** to restore.

## `localStorage` writes fail silently

Storage can be disabled or full. The app reports a failed save rather than pretending it worked. Free space or
use export instead.

## Dashboard numbers look like zeros

That is correct behaviour for an empty workspace: counts come from real stored data. There is no seeded demo
data by design.

## `npm install` / build problems

| Message | Fix |
| --- | --- |
| `EBADENGINE` | Node is older than 18.18. Upgrade Node (`nvm install 20`). |
| `Cannot find module 'vite'` | Run `npm ci` in `frontend/`, not at the repo root. |
| `TS2307 Cannot find module './x'` | Import path is relative to `src/`; check case — Linux is case-sensitive. |
| `npm run build` passes but `npm run dev` fails | A dev-only dependency is missing; `rm -rf node_modules && npm ci`. |
| `vite: not found` after `npm ci` | Run from `frontend/`; `npm ci` installs into that directory only. |

## Playwright: `Executable doesn't exist` or `EACCES … __dirlock`

**Cause:** browser download blocked or browser cache read-only.
**Fix:** reuse an existing Chromium: `PW_CHROMIUM=/path/to/chrome npx playwright test`. Otherwise run
`npx playwright install --with-deps chromium` with write access to `~/.cache/ms-playwright`.

## Playwright: mobile tests click the wrong element

At the mobile breakpoint the sidebar is off-canvas but still in the DOM (needed for the slide-in animation).
Scope locators to `main` or `nav` — the bundled E2E tests do exactly this.

## Backend: `ModuleNotFoundError: app`

`pytest` must run from `backend/`, because the child process re-imports the `app` package. Run
`cd backend && python -m pytest -q`.

## Backend: CORS error in the browser console

The frontend origin is not in `SMP_ALLOWED_ORIGINS`. Set it explicitly (comma-separated) and restart. Wildcards
are deliberately not the default.

## Backend: a symbolic transform returns "unsupported"

Only the documented expression subset is supported. Unsupported inputs (unknown symbols, delays, non-rational
structures, inverse transforms outside the documented forms) return an explicit error instead of a guess. Use the
numeric lab for those cases.

## Numbers look "too round"

Display precision is a setting (Settings → precision); CSV/JSON exports always contain full precision.
Comparisons use a `1e-9` relative tolerance, so a value printed as `1` may be `1.0000000000000002` internally.

## Strange continuous-time plots near discontinuities

Continuous-time signals are sampled: a jump may land between grid points, and numerical CT convolution/CTFT are
rectangle-rule approximations with `O(Δτ)` error. Increase the sample count or reduce the step to see convergence.
Ideal impulses are drawn as stems, never as boxes whose width depends on the grid.

## Still stuck

Open an issue with: the module, the exact inputs, the expected and actual result, browser/OS, and whether the
backend was running. Never include personal data in a report.
