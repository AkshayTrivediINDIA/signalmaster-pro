"""FastAPI application for the optional SignalMaster Pro symbolic engine.

The frontend is fully functional without this service: every numerical module
runs in the browser. This backend adds SymPy-backed *symbolic* transforms only.

Run locally:
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .core.config import settings
from .core.security import TokenBucketLimiter

logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("signalmaster")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description=(
            "Symbolic (SymPy) transforms used by SignalMaster Pro. Inputs are validated against a strict grammar and executed in an "
            "isolated process with a hard time budget. Errors are reported explicitly; unsupported expressions never return a "
            "fabricated result."
        ),
        docs_url="/api/docs" if settings.enable_docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.enable_docs else None,
    )

    app.state.limiter = TokenBucketLimiter(settings.rate_limit_per_minute, 60.0)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        max_age=600,
    )

    @app.middleware("http")
    async def limit_body_size(request: Request, call_next):  # type: ignore[no-untyped-def]
        """Reject oversized bodies before they reach a parser."""
        declared = request.headers.get("content-length")
        if declared is not None:
            try:
                if int(declared) > settings.max_body_bytes:
                    return JSONResponse(status_code=413, content={"detail": "Request body too large."})
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header."})
        return await call_next(request)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
        # A strict CSP only on API responses. The served SPA is set up by the
        # static host (see docs/deployment.md); applying this CSP to index.html
        # would also have to account for the bundler's own asset rules.
        if request.url.path.startswith("/api"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
            )
        return response

    app.include_router(router, prefix="/api")

    # Optional: serve the built frontend from the same origin.
    dist = Path(settings.frontend_dist) if settings.frontend_dist else Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist.is_dir():
        assets = dist / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str) -> FileResponse:
            """Single-page-app fallback: serve real files, else index.html."""
            candidate = (dist / full_path).resolve()
            if full_path and candidate.is_file() and str(candidate).startswith(str(dist.resolve())):
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

        logger.info("Serving built frontend from %s", dist)
    else:
        logger.info("No frontend build found at %s — API-only mode.", dist)

    if not os.getenv("SMP_ALLOWED_ORIGINS"):
        logger.info("CORS origins (default): %s", ", ".join(settings.allowed_origins))

    return app


app = create_app()
