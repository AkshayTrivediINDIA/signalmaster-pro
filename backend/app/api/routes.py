"""HTTP routes for the symbolic engine."""
from __future__ import annotations

import logging
from typing import Any, Callable

import sympy as sp
from fastapi import APIRouter, Depends, HTTPException, Request

from ..core.config import settings
from ..core.security import UnsafeExpressionError, run_isolated, validate_expression
from ..schemas.symbolic import (
    ExpressionRequest,
    HealthResponse,
    LaplacResponse,
    SimplifyResponse,
    SymbolicResponse,
)
from ..services import symbolic_engine

logger = logging.getLogger("signalmaster.api")

router = APIRouter()


# --------------------------------------------------------------------------
# Dependencies
# --------------------------------------------------------------------------

def rate_limit(request: Request) -> None:
    """Reject clients that exceed the configured request budget."""
    limiter = request.app.state.limiter
    client = request.client.host if request.client else "unknown"
    allowed, retry_after = limiter.allow(client)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Try again in {retry_after:.0f} seconds.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )


def _run(operation: Callable[[str], dict[str, Any]], expression: str) -> tuple[dict[str, Any] | None, str | None]:
    """Validate, then execute in an isolated process with a timeout."""
    try:
        clean = validate_expression(expression, settings.max_expression_length)
    except UnsafeExpressionError as exc:
        return None, str(exc)
    try:
        payload = run_isolated(operation, clean, timeout=settings.compute_timeout_seconds)
        return payload, None
    except TimeoutError as exc:
        return None, str(exc)
    except RuntimeError as exc:
        return None, str(exc)
    except Exception as exc:  # noqa: BLE001 - converted to a user-facing message
        logger.exception("Unexpected symbolic failure")
        return None, f"The symbolic engine failed unexpectedly: {exc}"


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@router.get("/health", response_model=HealthResponse, summary="Service health and limits")
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=settings.version,
        sympy=sp.__version__,
        limits={
            "max_expression_length": settings.max_expression_length,
            "max_body_bytes": settings.max_body_bytes,
            "compute_timeout_seconds": settings.compute_timeout_seconds,
            "rate_limit_per_minute": settings.rate_limit_per_minute,
        },
    )


@router.post(
    "/symbolic/laplace/forward",
    response_model=LaplacResponse,
    dependencies=[Depends(rate_limit)],
    summary="Unilateral Laplace transform",
)
def laplace_forward(request: ExpressionRequest) -> LaplacResponse:
    payload, error = _run(symbolic_engine.laplace_forward, request.expression)
    if error or payload is None:
        return LaplacResponse(input=request.expression, error=error or "Unknown failure.")
    return LaplacResponse(**payload)


@router.post(
    "/symbolic/laplace/inverse",
    response_model=LaplacResponse,
    dependencies=[Depends(rate_limit)],
    summary="Causal inverse Laplace transform",
)
def laplace_inverse(request: ExpressionRequest) -> LaplacResponse:
    payload, error = _run(symbolic_engine.laplace_inverse, request.expression)
    if error or payload is None:
        return LaplacResponse(input=request.expression, error=error or "Unknown failure.")
    return LaplacResponse(**payload)


@router.post(
    "/symbolic/z/forward",
    response_model=SymbolicResponse,
    dependencies=[Depends(rate_limit)],
    summary="Unilateral Z transform by symbolic summation",
)
def z_forward(request: ExpressionRequest) -> SymbolicResponse:
    payload, error = _run(symbolic_engine.z_forward, request.expression)
    if error or payload is None:
        return SymbolicResponse(input=request.expression, error=error or "Unknown failure.")
    return SymbolicResponse(**payload)


@router.post(
    "/symbolic/z/inverse",
    response_model=SymbolicResponse,
    dependencies=[Depends(rate_limit)],
    summary="Inverse Z transform (not supported symbolically)",
)
def z_inverse(request: ExpressionRequest) -> SymbolicResponse:
    # Being explicit is better than returning a half-correct series: SymPy has
    # no inverse Z-transform, and the frontend computes exact causal inverses
    # by recursion instead.
    return SymbolicResponse(
        input=request.expression,
        error=(
            "The symbolic engine does not provide an inverse Z-transform. Use the Z-Transform Lab, which computes the causal inverse exactly "
            "by recursion and cross-checks any closed form it displays."
        ),
        assumptions=["No result is fabricated when a transform is unsupported."],
    )


@router.post(
    "/symbolic/simplify",
    response_model=SimplifyResponse,
    dependencies=[Depends(rate_limit)],
    summary="Symbolic simplification",
)
def simplify(request: ExpressionRequest) -> SimplifyResponse:
    payload, error = _run(symbolic_engine.simplify, request.expression)
    if error or payload is None:
        return SimplifyResponse(input=request.expression, error=error or "Unknown failure.")
    return SimplifyResponse(**payload)
