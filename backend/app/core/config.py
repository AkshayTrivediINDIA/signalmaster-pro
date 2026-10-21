"""Application configuration.

Every setting is read from the environment with a safe local default, so the
service runs out of the box for development and can be hardened for a
deployment without code changes. No secrets are required: the service is
stateless and offers no authentication (see docs/security.md).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = "SignalMaster Pro Symbolic Engine"
    version: str = "1.0.0"

    #: Origins allowed to call the API from a browser. Keep this list tight in
    #: production; ``*`` is deliberately *not* the default.
    allowed_origins: list[str] = field(
        default_factory=lambda: _env_list(
            "SMP_ALLOWED_ORIGINS",
            ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"],
        )
    )

    #: Hard cap on the size of any request body, in bytes.
    max_body_bytes: int = int(os.getenv("SMP_MAX_BODY_BYTES", "8192"))

    #: Hard cap on expression length (characters) before parsing.
    max_expression_length: int = int(os.getenv("SMP_MAX_EXPRESSION_LENGTH", "300"))

    #: Wall-clock budget for one symbolic computation, in seconds. The work runs
    #: in a separate process that is terminated when the budget is exceeded.
    compute_timeout_seconds: float = float(os.getenv("SMP_COMPUTE_TIMEOUT_SECONDS", "6"))

    #: Simple per-client rate limit (requests per minute, single process only).
    rate_limit_per_minute: int = int(os.getenv("SMP_RATE_LIMIT_PER_MINUTE", "30"))

    #: Optional directory with the built frontend to serve from the same origin.
    frontend_dist: str = os.getenv("SMP_FRONTEND_DIST", "")

    #: Enable interactive API docs. Disable in a hardened deployment if the
    #: schema should not be public.
    enable_docs: bool = os.getenv("SMP_ENABLE_DOCS", "true").lower() in {"1", "true", "yes"}

    log_level: str = os.getenv("SMP_LOG_LEVEL", "info")


settings = Settings()
