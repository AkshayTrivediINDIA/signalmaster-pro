# Symbolic engine (optional)

FastAPI service that adds **symbolic** Laplace and Z transforms on top of SignalMaster Pro's browser-side
numerics. The frontend works without it; when it is unreachable the symbolic panels say so and every numeric
module keeps running.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Status, version, SymPy version, active limits. |
| `POST` | `/api/symbolic/laplace` | `f(t)` → `F(s)` with ROC notes. |
| `POST` | `/api/symbolic/inverse-laplace` | `F(s)` → `f(t)` (causal interpretation). |
| `POST` | `/api/symbolic/z` | `x[n]` → `X(z)` with ROC notes. |
| `POST` | `/api/symbolic/inverse-z` | `X(z)` → `x[n]` (causal interpretation). |

Example:

```bash
curl -s -X POST http://127.0.0.1:8000/api/symbolic/laplace \
  -H 'Content-Type: application/json' \
  -d '{"expression": "exp(-2*t)*cos(3*t)"}'
# {"result":"(s + 2)/((s + 2)**2 + 9)", ...}
```

Interactive docs: `http://127.0.0.1:8000/api/docs` (disable with `SMP_ENABLE_DOCS=false`).

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Test

```bash
pip install -r requirements-dev.txt
python -m pytest -q        # run from this directory (the child process re-imports `app`)
```

## Safety design

- **No code execution.** Expressions are restricted to a character whitelist, then parsed with SymPy's
  `parse_expr` using local/global dictionaries that omit `__builtins__`, `open`, `eval`, `exec` and attribute
  access. Injection attempts (`__import__('os')`, `eval('1')`, `t.__class__`, `lambda`, list literals, chained
  calls) are covered by tests and return `400`.
- **Isolation.** Each computation runs in a spawned child process with a wall-clock budget
  (`SMP_COMPUTE_TIMEOUT_SECONDS`, default 6 s). Over-budget work is killed and reported as `504`.
- **Limits.** 300-character expressions, 8 KB request bodies, 30 requests/minute per client (single process,
  in-memory).
- **Headers.** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`,
  `Permissions-Policy`, plus a `default-src 'none'` CSP on `/api` responses.
- **CORS.** Allow-list only (`SMP_ALLOWED_ORIGINS`), default localhost:5173/4173.

## Honest limitations

- Only the documented expression subset is supported. Unknown symbols, delays (`e^{-sT}`), and inverse
  transforms outside the documented forms return an explicit `error` — never a fabricated result.
- Results are **causal** (right-sided); two-sided inverses are not implemented.
- The rate limiter is per process. Behind multiple workers, put the limit in the proxy.
- No authentication: intended to run on localhost or behind your own gateway.

## Layout

```
app/main.py                   app factory, middleware, optional SPA serving
app/core/config.py            SMP_* settings
app/core/security.py          whitelist, safe parse tables, limiter, run_isolated
app/services/symbolic_engine.py   SymPy transforms and ROC formatting
app/api/routes.py             endpoints
app/schemas/symbolic.py       request/response models
app/tests/test_api.py         API, safety and limit tests
```

See `../docs/security.md` and `../docs/scientific-conventions.md` for the assumptions behind each transform.
