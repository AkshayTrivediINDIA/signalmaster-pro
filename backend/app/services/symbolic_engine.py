"""SymPy-backed symbolic transforms.

Everything here runs in a child process (see ``run_isolated``) so that a slow
or non-convergent integral cannot occupy the server. Each public function
returns plain strings plus explicit notes; failures raise, and the route layer
converts them into an ``error`` field rather than inventing a result.
"""
from __future__ import annotations

import sympy as sp
from sympy.parsing.sympy_parser import (
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

# --------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------

LAPLACE_SYMBOL = sp.Symbol("t", real=True, nonnegative=True)
Z_INDEX = sp.Symbol("n", integer=True, nonnegative=True)
S = sp.Symbol("s")
Z = sp.Symbol("z")

_SAFE_LOCALS = {
    "t": LAPLACE_SYMBOL,
    "n": Z_INDEX,
    "s": S,
    "z": Z,
    "pi": sp.pi,
    "E": sp.E,
    "e": sp.E,
    "I": sp.I,
    "oo": sp.oo,
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "tanh": sp.tanh,
    "exp": sp.exp,
    "log": sp.log,
    "ln": sp.log,
    "sqrt": sp.sqrt,
    "Abs": sp.Abs,
    "abs": sp.Abs,
    "Heaviside": sp.Heaviside,
    "u": lambda x: sp.Heaviside(x, 1),
    "sinc": lambda x: sp.sin(sp.pi * x) / (sp.pi * x) if x != 0 else sp.Integer(1),
    "sign": sp.sign,
    "floor": sp.floor,
    "ceiling": sp.ceiling,
    "Piecewise": sp.Piecewise,
}

#: `parse_expr` receives an explicit global table, so names outside this set
#: cannot resolve to anything from the Python runtime.
_SAFE_GLOBALS = {"__builtins__": {}, "Integer": sp.Integer, "Float": sp.Float, "Rational": sp.Rational, "Symbol": sp.Symbol}

_TRANSFORMS = standard_transformations + (implicit_multiplication_application,)


class UnsymbolicError(ValueError):
    """Raised when the expression is outside the supported symbolic subset."""


def _parse(expression: str) -> sp.Expr:
    try:
        expr = parse_expr(
            expression,
            local_dict=dict(_SAFE_LOCALS),
            global_dict=dict(_SAFE_GLOBALS),
            transformations=_TRANSFORMS,
            evaluate=True,
        )
    except Exception as exc:  # noqa: BLE001 - parse errors are user-facing
        raise UnsymbolicError(f"The expression could not be parsed: {exc}") from exc
    if not isinstance(expr, sp.Expr):
        raise UnsymbolicError("The input is not a mathematical expression.")
    unknown = {str(sym) for sym in expr.free_symbols} - {"t", "n", "s", "z"}
    if unknown:
        raise UnsymbolicError(
            "Unsupported symbol(s): " + ", ".join(sorted(unknown)) + ". Use t (Laplace), n (Z-transform), s or z."
        )
    if sp.count_ops(expr) > 200:
        raise UnsymbolicError("The expression is too complex for the symbolic engine (operation limit 200).")
    return expr


def _result(expr: sp.Expr) -> str:
    """Stable, human-readable text form (SymPy pretty printer, single line)."""
    return sp.sstr(sp.simplify(expr))


# --------------------------------------------------------------------------
# Laplace
# --------------------------------------------------------------------------

def laplace_forward(expression: str) -> dict[str, object]:
    expr = _parse(expression)
    if expr.has(Z_INDEX):
        raise UnsymbolicError("The Laplace transform expects the variable t, not n.")
    try:
        transformed, lower, upper = sp.laplace_transform(expr, LAPLACE_SYMBOL, S, noconds=False)
    except Exception as exc:  # noqa: BLE001
        raise UnsymbolicError(f"SymPy could not compute this transform: {exc}") from exc
    if transformed.has(sp.LaplaceTransform):
        raise UnsymbolicError(
            "SymPy left the transform unevaluated — this expression is outside the supported table. No result is returned rather than a partial one."
        )
    return {
        "input": expression,
        "result": _result(transformed),
        "free_symbols": sorted(str(sym) for sym in transformed.free_symbols),
        "assumptions": [
            "Unilateral (one-sided) Laplace transform over t ≥ 0.",
            _describe_strip(lower, upper),
        ],
    }


def _describe_strip(lower: sp.Expr, upper: sp.Expr) -> str:
    """Human-readable convergence description from SymPy's bounds."""
    has_lower = lower not in (-sp.oo, sp.true, sp.false)
    has_upper = upper not in (sp.oo, sp.true, sp.false, sp.nan)
    if has_lower and has_upper:
        return f"Convergence strip reported by SymPy: {sp.sstr(lower)} < Re(s) < {sp.sstr(upper)}."
    if has_lower:
        return f"SymPy reports Re(s) > {sp.sstr(lower)} as the convergence half-plane."
    if has_upper:
        return f"SymPy reports Re(s) < {sp.sstr(upper)} as the convergence half-plane."
    return "SymPy did not report a finite convergence bound; state the ROC from the pole locations."


def laplace_inverse(expression: str) -> dict[str, object]:
    expr = _parse(expression)
    if expr.has(LAPLACE_SYMBOL):
        raise UnsymbolicError("The inverse transform expects the variable s, not t.")
    try:
        result = sp.inverse_laplace_transform(expr, S, LAPLACE_SYMBOL)
    except Exception as exc:  # noqa: BLE001
        raise UnsymbolicError(f"SymPy could not invert this expression: {exc}") from exc
    if result.has(sp.InverseLaplaceTransform):
        raise UnsymbolicError("The inverse transform could not be evaluated for this expression.")
    return {
        "input": expression,
        "result": sp.sstr(result),
        "free_symbols": sorted(str(sym) for sym in result.free_symbols),
        "assumptions": [
            "Causal (right-sided) inverse transform: the result is valid for t ≥ 0 (SymPy multiplies by Heaviside(t)).",
        ],
    }


# --------------------------------------------------------------------------
# Z transform (unilateral, by direct summation)
# --------------------------------------------------------------------------

def z_forward(expression: str) -> dict[str, object]:
    """Unilateral Z transform computed as Σ_{n=0}^{∞} x[n] z^{-n}.

    SymPy 1.14 does not ship a Z-transform routine, so the series is summed
    symbolically. SymPy typically returns a ``Piecewise`` whose conditional
    branch is exactly the convergence condition — that condition *is* the
    region of convergence, so it is reported rather than discarded. When the
    series cannot be summed the call fails explicitly; a truncated (windowed)
    sum is never presented as the transform.
    """
    expr = _parse(expression)
    if expr.has(LAPLACE_SYMBOL):
        raise UnsymbolicError("The Z-transform expects the variable n, not t.")
    try:
        total = sp.summation(expr * Z ** (-Z_INDEX), (Z_INDEX, 0, sp.oo))
    except Exception as exc:  # noqa: BLE001
        raise UnsymbolicError(f"SymPy could not sum this series: {exc}") from exc

    roc = "Region of convergence not reported by SymPy for this sequence."
    if isinstance(total, sp.Piecewise):
        converged = [arg for arg in total.args if arg[1] is not sp.true]
        if not converged:
            raise UnsymbolicError("The series did not converge for any finite z.")
        value, condition = converged[0]
        if value.has(sp.Sum):
            raise UnsymbolicError("The series did not converge to a closed form. No result is returned.")
        roc = f"Converges where {sp.sstr(condition)} (this is the region of convergence in z)."
        total_expr = sp.simplify(value)
    else:
        total_expr = sp.simplify(total)

    if total_expr.has(sp.Sum) or total_expr is sp.nan or total_expr.has(sp.zoo):
        raise UnsymbolicError(
            "The series did not converge to a closed form (the sequence may grow, or lie outside the supported family). No result is returned."
        )
    return {
        "input": expression,
        "result": sp.sstr(total_expr),
        "free_symbols": sorted(str(sym) for sym in total_expr.free_symbols),
        "assumptions": [
            "Unilateral Z transform: X(z) = Σ_{n=0}^{∞} x[n] z^{-n}.",
            roc,
        ],
    }


# --------------------------------------------------------------------------
# Simplification
# --------------------------------------------------------------------------

def simplify(expression: str) -> dict[str, object]:
    expr = _parse(expression)
    return {"input": expression, "result": sp.sstr(sp.simplify(expr))}
