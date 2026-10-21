"""Pydantic schemas for the symbolic API."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class ExpressionRequest(BaseModel):
    """A single user expression, e.g. ``exp(-2*t)*sin(3*t)``."""

    expression: str = Field(..., min_length=1, max_length=300, description="Expression in the documented variable (t for Laplace, n for Z).")

    @field_validator("expression")
    @classmethod
    def _strip(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("The expression must not be blank.")
        return value.strip()


class SymbolicResponse(BaseModel):
    """Result of a symbolic transform.

    ``error`` is populated whenever a result could not be produced. The service
    never returns a plausible-looking placeholder in place of a real result.
    """

    input: str
    result: str | None = None
    free_symbols: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    error: str | None = None


class LaplacResponse(SymbolicResponse):
    pass


class SimplifyResponse(BaseModel):
    input: str
    result: str | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    sympy: str
    limits: dict[str, str | int | float]
