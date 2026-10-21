# Security

## 1. Threat model

The app runs calculations on numbers typed by its own user, so the interesting risks are not "attacker gains
a shell" but:

| Risk | Where it could occur | Mitigation |
| --- | --- | --- |
| **Code execution through a math expression** | Calculator, custom signal expressions | Hand-written tokenizer/parser/evaluator over a fixed function table. No `eval`, no `new Function`, no `setTimeout(string)`. |
| **Denial of service via expensive symbolic input** | Backend | Length cap, body-size cap, spawn-process timeout, rate limit. |
| **Resource exhaustion in the browser** | FFT/convolution length, sample count, recursion length | Hard `LIMITS` in `core/validation.ts`, enforced before allocation. |
| **XSS through rendered content** | Notes, names of saved experiments, imported JSON, math rendering | React escapes all interpolated text. The single `dangerouslySetInnerHTML` in the codebase is `Equation.tsx`, which inserts **KaTeX output for author-written constant LaTeX** with `trust: false` (no `\href`/`\includegraphics` URL emission) and `maxExpand` bounded; no user-supplied string is ever passed to it. |
| **Malicious import file** | Experiment import | Structural validation + size limit; unknown/extra fields dropped; no code paths derived from imported data. |
| **Data leakage between users** | *(not applicable)* | There is no multi-user feature, no accounts and no server-side storage. Saved data never leaves the browser. |
| **Secret exposure** | Repo and bundle | No secrets exist. Only public config (`VITE_API_BASE`) is compiled into the bundle. Deployment secrets belong in the host's environment, never in `.env` files committed to git. |
| **CORS abuse of the symbolic engine** | Backend | Explicit allow-list from `SMP_ALLOWED_ORIGINS`; `*` is never the default. |

## 2. Expression evaluation

`frontend/src/core/expr.ts` implements:

1. **Tokeniser** — numbers, identifiers, operators `+ - * / ^ %`, parentheses, commas. Anything else is rejected
   with a character position.
2. **Recursive-descent parser** producing an AST; input length is capped at 2,000 characters in `expr.ts`
   (200 in the calculator field) and each parse step consumes at least one token, so nesting cannot grow faster
   than the capped input.
3. **Evaluator** over an explicit function table (`sin cos tan exp log ln sqrt abs sign floor ceil round min max
   pow atan2 heaviside sinc`), constants `pi e`, and named variables the caller supplies. Unknown identifiers
   raise a validation error naming the variable.

Property tests in `src/tests/math-core.test.ts` assert that `__proto__`, `constructor`, `this`, arrow
functions, template literals, member access (`.`), brackets, semicolons, backticks and assignments do not
produce a numeric result.

The backend applies the same idea twice: a character whitelist before parsing, then SymPy's `parse_expr` with
**local and global dictionaries that exclude** `__builtins__`, `open`, `eval`, `exec`, `import`, `lambda` and
attribute traversal. Tests assert `__import__('os')`, `eval('1')`, `open('/etc/passwd')`, `t.__class__`,
`[1,2,3]`, `f()()`, `t; import os` all return `400`, never a `200`.

## 3. Backend hardening

Applied in this order in `app/main.py`, outermost first:

1. **Body-size limit** — rejects bodies over `SMP_MAX_BODY_BYTES` (default 8192) with `413` before JSON parsing.
2. **Rate limit** — token bucket, `SMP_RATE_LIMIT_PER_MINUTE` (default 30) per client IP, `429` with
   `Retry-After`. *Single-process, in-memory* — a multi-instance deployment needs a shared limiter (Redis or a
   proxy-level limit); this is stated in the code and docs rather than pretended away.
3. **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`,
   `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, and a
   `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
   applied to `/api` responses. The SPA's CSP belongs to the static host, because its asset rules depend on the
   bundler output — see `docs/deployment.md`.
4. **CORS** — allow-list only, methods and headers restricted to what the app uses.
5. **Compute isolation** — each symbolic request runs in a **spawned child process** with a wall-clock budget
   (`SMP_COMPUTE_TIMEOUT_SECONDS`, default 6 s). Exceeding it terminates the process and returns `504`; the
   request thread stays responsive.
6. **Error hygiene** — unexpected exceptions return a generic `500` with a request id; SymPy internals and
   tracebacks are logged server-side only.
7. **Docs toggle** — `SMP_ENABLE_DOCS=false` removes `/api/docs` and `/api/openapi.json`.

Deployment checklist:

- [ ] `SMP_ALLOWED_ORIGINS` set to the real origin(s).
- [ ] TLS terminating in front (reverse proxy or platform).
- [ ] `SMP_ENABLE_DOCS=false` if the schema should not be public.
- [ ] Run as an unprivileged user; the container needs no write access except a temp dir.
- [ ] Keep dependencies current (`pip list --outdated`, `npm audit`); see `.github/workflows/ci.yml` for the
      audit step.

## 4. Frontend hardening

- Strict TypeScript (`strict: true`); no `any` in the numerical core; array reads are bounds-checked where the
  compiler cannot prove them (`noUncheckedIndexedAccess` is off, so `core` code validates lengths explicitly).
- All external links use `rel="noopener noreferrer"`.
- `localStorage` access is wrapped — a disabled/quota-exceeded store degrades to an in-memory fallback with a
  visible warning instead of a crash.
- Imported JSON is validated before use: module must exist in the registry, arrays must be numeric, lengths are
  capped. Importing a file that fails validation reports why and changes nothing.
- Plotly is configured with static HTML sanitisation for text and no external script URLs. Inline event
  attributes from user strings are not possible because nothing user-authored is inserted as HTML.
- The app makes exactly one kind of network request (`/api/symbolic/*`) and no analytics, fonts or CDNs are
  loaded at runtime — the bundle is self-contained (fonts are system stacks).

## 5. Reporting a vulnerability

Open a private security advisory on the repository (GitHub → *Security* → *Report a vulnerability*) rather than
a public issue. Include the version/commit, a minimal reproduction, and the impact you observed. Please do not
include real personal data in a report. There is no bug-bounty programme; this is a free educational project.

## 6. Accepted, documented limitations

- The rate limiter is per process and in memory.
- Numeric core changes are reviewed by reading the tests, not by formal verification; results are cross-checked
  against analytical references but not certified.
- `localStorage` data is readable by any script running on the same origin — that is inherent to browser
  storage, not a flaw to fix here.
- The symbolic engine trusts the *shape* of an allow-listed grammar; it does not attempt to defend against a
  deliberate SymPy CVE beyond dependency updates.
