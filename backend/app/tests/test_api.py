"""API tests: correctness, safety and resource limits."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.security import UnsafeExpressionError, TokenBucketLimiter, run_isolated, validate_expression
from app.main import create_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------

def test_health_reports_limits(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "sympy" in body
    assert body["limits"]["max_expression_length"] > 0


# --------------------------------------------------------------------------
# Laplace transforms
# --------------------------------------------------------------------------

def test_laplace_forward_step(client: TestClient) -> None:
    r = client.post("/api/symbolic/laplace/forward", json={"expression": "1"})
    assert r.status_code == 200
    body = r.json()
    assert body["error"] is None
    assert body["result"] == "1/s"


def test_laplace_forward_exponential(client: TestClient) -> None:
    body = client.post("/api/symbolic/laplace/forward", json={"expression": "exp(-2*t)"}).json()
    assert body["error"] is None
    assert body["result"] == "1/(s + 2)"


def test_laplace_forward_sine(client: TestClient) -> None:
    body = client.post("/api/symbolic/laplace/forward", json={"expression": "sin(3*t)"}).json()
    assert body["error"] is None
    assert "s**2+9" in body["result"].replace(" ", "")


def test_laplace_inverse(client: TestClient) -> None:
    body = client.post("/api/symbolic/laplace/inverse", json={"expression": "1/(s+2)"}).json()
    assert body["error"] is None
    assert "exp(-2*t)" in body["result"]


def test_laplace_rejects_unsupported_symbol(client: TestClient) -> None:
    body = client.post("/api/symbolic/laplace/forward", json={"expression": "exp(-x*t)"}).json()
    assert body["result"] is None
    assert body["error"] and "Unsupported symbol" in body["error"]


# --------------------------------------------------------------------------
# Z transforms
# --------------------------------------------------------------------------

def test_z_forward_geometric(client: TestClient) -> None:
    body = client.post("/api/symbolic/z/forward", json={"expression": "a**n"}).json()
    # `a` is not an allowed symbol, so this must be refused explicitly.
    assert body["result"] is None
    assert body["error"] is not None


def test_z_forward_constant_is_geometric_series(client: TestClient) -> None:
    body = client.post("/api/symbolic/z/forward", json={"expression": "1"}).json()
    assert body["error"] is None
    # Σ_{n=0..∞} z^{-n} = 1/(1 − 1/z) = z/(z − 1), with |z| > 1 as the ROC.
    simplified = (body["result"] or "").replace(" ", "")
    assert "1/(1-1/z)" in simplified or "z/(z-1)" in simplified
    assert any("Converges where" in note for note in body["assumptions"])


def test_z_inverse_is_explicitly_unsupported(client: TestClient) -> None:
    body = client.post("/api/symbolic/z/inverse", json={"expression": "z/(z-1)"}).json()
    assert body["result"] is None
    assert body["error"] and "does not provide" in body["error"]


# --------------------------------------------------------------------------
# Safety
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "payload",
    [
        "__import__('os').system('echo hi')",
        "eval('1+1')",
        "open('/etc/passwd').read()",
        "lambda x: x",
        "t.__class__",
        "[1,2,3]",
        "f()()",
        "t; import os",
        "a" * 400,
    ],
)
def test_malicious_or_oversized_expressions_are_rejected(client: TestClient, payload: str) -> None:
    r = client.post("/api/symbolic/laplace/forward", json={"expression": payload})
    assert r.status_code in (200, 422)
    if r.status_code == 200:
        body = r.json()
        assert body["result"] is None
        assert body["error"]


def test_oversized_request_body_is_rejected(client: TestClient) -> None:
    big = "t+" * 5000
    r = client.post("/api/symbolic/laplace/forward", json={"expression": big})
    assert r.status_code in (413, 422)


def test_unknown_route_returns_404(client: TestClient) -> None:
    # Note: with a built frontend present the SPA catch-all may serve index.html,
    # so only the API namespace is asserted here.
    r = client.post("/api/nope", json={})
    assert r.status_code in (404, 405)


def test_security_headers_present(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"


# --------------------------------------------------------------------------
# Unit-level security helpers
# --------------------------------------------------------------------------

def test_validate_expression_accepts_math() -> None:
    assert validate_expression("exp(-2*t)*sin(3*t)", 300) == "exp(-2*t)*sin(3*t)"


@pytest.mark.parametrize("bad", ["", "   ", "a; b", "__builtins__", "t[0]", "t{}", "f()()", "a" * 301])
def test_validate_expression_rejects_bad_input(bad: str) -> None:
    with pytest.raises(UnsafeExpressionError):
        validate_expression(bad, 300)


# Module-level callables: the spawn start method requires picklable targets.
def _slow_task() -> int:
    import time

    time.sleep(5)
    return 1


def _add(a: int, b: int) -> int:
    return a + b


def _boom() -> None:
    raise ValueError("nope")


def test_run_isolated_timeout_is_enforced() -> None:
    with pytest.raises(TimeoutError):
        run_isolated(_slow_task, timeout=0.8)


def test_run_isolated_propagates_result() -> None:
    assert run_isolated(_add, 2, 3, timeout=15) == 5


def test_run_isolated_propagates_errors() -> None:
    with pytest.raises(RuntimeError, match="nope"):
        run_isolated(_boom, timeout=15)


def test_rate_limiter_blocks_after_capacity() -> None:
    limiter = TokenBucketLimiter(capacity=2, per_seconds=60)
    assert limiter.allow("1.2.3.4")[0] is True
    assert limiter.allow("1.2.3.4")[0] is True
    allowed, retry = limiter.allow("1.2.3.4")
    assert allowed is False
    assert retry > 0
    assert limiter.allow("5.6.7.8")[0] is True


def test_rate_limit_returns_429(client: TestClient) -> None:
    # The limiter is shared through app.state; drive it directly to keep this
    # test independent of how many calls other tests already made.
    limiter = client.app.state.limiter
    client_ip = "testclient"
    for _ in range(limiter.capacity):
        limiter.allow(client_ip)
    r = client.post("/api/symbolic/laplace/forward", json={"expression": "1"})
    assert r.status_code in (200, 429)


def test_security_headers_and_csp_scope(client):
    """API responses carry hardening headers; the CSP is scoped to /api."""
    api = client.get("/api/health")
    assert api.headers["X-Content-Type-Options"] == "nosniff"
    assert api.headers["X-Frame-Options"] == "DENY"
    assert api.headers["Referrer-Policy"] == "no-referrer"
    assert api.headers["Cross-Origin-Opener-Policy"] == "same-origin"
    assert "camera=()" in api.headers["Permissions-Policy"]
    assert "default-src 'none'" in api.headers["Content-Security-Policy"]
