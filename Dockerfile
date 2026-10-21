# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# SignalMaster Pro — single-origin image.
#
# Stage 1 builds the Vite SPA, stage 2 runs the FastAPI/SymPy engine and serves
# that build from the same origin, so the browser talks to /api with no CORS
# and no second host to configure.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS web
WORKDIR /app/frontend

# Install from the lockfile only, so the dependency layer is cached until the
# lockfile itself changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
# `npm run build` also runs `tsc --noEmit`, so a type error fails the image
# instead of shipping a broken bundle.
RUN npm run build


FROM python:3.12-slim AS api

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=web /app/frontend/dist /app/frontend/dist

# The service spawns a child process per symbolic computation; running as a
# non-root user keeps that contained.
RUN useradd --create-home --uid 10001 app \
    && chown -R app:app /app
USER app

ENV SMP_FRONTEND_DIST=/app/frontend/dist \
    SMP_ENABLE_DOCS=false

EXPOSE 8000

# One worker: the rate limiter is per process (see docs/deployment.md).
# ${PORT} is injected by the platform (Render sets it).
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
