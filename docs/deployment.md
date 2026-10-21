# Deployment

Two supported shapes. Both are free of paid services; whether your host charges you is outside this project's
control, and no "free forever" promise is made.

## A. Static frontend only (recommended default)

```bash
cd frontend
npm ci
npm run build          # → frontend/dist
```

Upload `frontend/dist`. Requirements:

- **SPA fallback**: unknown paths must return `index.html`.
  - Netlify: create `public/_redirects` with `/*  /index.html  200`
  - Vercel: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
  - nginx: `location / { try_files $uri $uri/ /index.html; }`
  - Apache: `FallbackResource /index.html`
  - GitHub Pages: copy `dist/index.html` to `dist/404.html`
- **HTTPS** so `localStorage` and clipboard APIs behave normally.
- **Security headers** (host-level, since the app is static): at minimum
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a CSP such as
  `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'`.
  Plotly sets inline styles, so `style-src` needs `'unsafe-inline'`; the app loads no external assets, so
  `script-src 'self'` is sufficient.
- No server-side environment variables are needed. If the symbolic engine lives elsewhere, build with
  `VITE_API_BASE=https://api.example.com`.

Symbolic panels will show "offline" in this configuration. That is a supported state: every numeric module
works, and the symbolic card explains what is missing.

### Cache headers
`dist/assets/*` is content-hashed → `Cache-Control: public, max-age=31536000, immutable`.
`index.html` → `Cache-Control: no-cache`.

## B. Single origin with the symbolic engine

```bash
cd frontend && npm run build
cd ../backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
SMP_ALLOWED_ORIGINS=https://your-domain.example \
SMP_ENABLE_DOCS=false \
SMP_FRONTEND_DIST=../frontend/dist \
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

`app/main.py` mounts the built SPA at `/` when the directory exists, so one origin serves both. If you deploy
frontend and backend separately, set `VITE_API_BASE` on the frontend and `SMP_ALLOWED_ORIGINS` on the backend.

### Container sketch

```dockerfile
FROM node:20-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /app/frontend/dist /app/frontend/dist
RUN useradd -m app && chown -R app /app
USER app
ENV SMP_FRONTEND_DIST=/app/frontend/dist SMP_ENABLE_DOCS=false
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Notes for operators:

- **Render.** `render.yaml` at the repository root describes exactly this shape as a Docker web service; see
  “Option C” in the README. Nothing else needs configuring on the host.
- **One worker.** The rate limiter is in-memory per process; more workers mean per-worker budgets. For real
  capacity, put the limit in the proxy and scale horizontally.
- **Timeouts.** Proxy read timeout should exceed `SMP_COMPUTE_TIMEOUT_SECONDS` (6 s) plus overhead — set 15 s.
- **Memory.** A SymPy child process needs ~150–250 MB; budget 512 MB per container.
- **Logs.** Structured, no expression text at `info` level — user expressions are treated as private data.
- **Health check.** `GET /api/health` returns `{"status":"ok"}` plus the active limits and the SymPy
  version. It is cheap to call (no computation), but the process does import SymPy at start-up.

## B2. Single-file build (no host at all)

```bash
cd frontend && npm run build:standalone   # → frontend/dist-standalone/index.html (~3.4 MB)
```

One HTML file with scripts, styles, fonts (data URIs) and Plotly inlined; it switches to hash routing so it can
be opened from `file://` or any blob URL. Ship it on a USB stick, attach it to an email, or drop it on a static
host as a single page. Browser storage still works from `file://` in most browsers, but some (and sandboxed
iframes) block it — the app then says storage is unavailable and disables saving instead of failing. The
symbolic engine cannot be reached, so those panels show offline.

## C. GitHub Pages

Because routing is client-side, either use hash routing or the `404.html` copy trick above. Plotly and KaTeX
are bundled (no CDN), so no extra configuration is needed. If the site is served from a sub-path, set
`base: '/repo-name/'` in `vite.config.ts` and rebuild.

## D. Updating a deployment

1. `npm ci && npm test && npm run build` (or rely on CI).
2. Deploy the new `dist`; content hashes make this atomic enough for a static host.
3. For the backend, restart the service; no database migrations exist because there is no database.

## E. Rollback

Static hosting: re-deploy the previous `dist` (keep the last artifact). Backend: deploy the previous commit;
the API is stateless, so nothing to restore.

## F. What not to do

- Do not commit `.env` files with deployment values.
- Do not set `SMP_ALLOWED_ORIGINS=*` — CSRF-style abuse of the compute endpoint becomes possible.
- Do not run the API as root, and do not expose `/api/docs` publicly if you consider the schema sensitive.
- Do not promise users cloud sync or cross-device storage; it is not implemented.
