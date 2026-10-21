"""Input hardening and resource protection.

Design rules
------------
1. **No arbitrary code execution.** User strings are never passed to ``eval``,
   ``exec`` or ``sympify`` with the default global namespace. They are first
   filtered against a narrow character whitelist and a token blacklist, then
   parsed by :func:`sympy.parse_expr` with an explicit, small symbol/function
   table and ``global_dict`` restricted to that table.
2. **Bounded resources.** Expressions are length-limited, requests are
   size-limited, and every symbolic computation runs in a separate process with
   a wall-clock budget so a pathological input cannot occupy the server.
3. **Bounded rate.** A per-client token bucket (single process) smooths traffic.
   For multi-instance deployments put a shared limiter at the proxy; this is
   documented rather than silently assumed.
"""
from __future__ import annotations

import multiprocessing as mp
import queue
import re
import threading
import time
from collections import deque
from typing import Any, Callable

# --------------------------------------------------------------------------
# Expression filtering
# --------------------------------------------------------------------------

#: Characters allowed in an expression. Everything else is rejected outright.
ALLOWED_CHAR_RE = re.compile(r"^[0-9a-zA-Z_+\-*/^().,%\s]*$")

#: Substrings that must never appear (defence in depth: they are also
#: unreachable once the character whitelist and parse_expr table are applied).
FORBIDDEN_TOKENS = (
    "__",
    "import",
    "lambda",
    "exec",
    "eval",
    "open",
    "os.",
    "sys.",
    "subprocess",
    "socket",
    "builtins",
    "getattr",
    "setattr",
    "globals",
    "locals",
    "compile",
    "input",
    "file",
    "write",
    "read",
    ";",
    "[",
    "]",
    "{",
    "}",
    "\\",
    "@",
    "$",
    "`",
    "?",
    ":",
    "=",
    "<",
    ">",
    "&",
    "|",
    "~",
)


class UnsafeExpressionError(ValueError):
    """Raised when an expression fails the safety filter."""


def validate_expression(raw: str, max_length: int) -> str:
    """Return the trimmed expression or raise :class:`UnsafeExpressionError`."""
    if not isinstance(raw, str):
        raise UnsafeExpressionError("The expression must be a string.")
    expression = raw.strip()
    if not expression:
        raise UnsafeExpressionError("The expression is empty.")
    if len(expression) > max_length:
        raise UnsafeExpressionError(f"Expressions are limited to {max_length} characters.")
    if not ALLOWED_CHAR_RE.match(expression):
        raise UnsafeExpressionError("The expression contains characters that are not allowed.")
    lowered = expression.lower()
    for token in FORBIDDEN_TOKENS:
        if token in lowered:
            raise UnsafeExpressionError(f"The expression contains a forbidden token: {token!r}.")
    # A crude but effective guard against function-call chains such as f()().
    if re.search(r"\)\s*\(", expression):
        raise UnsafeExpressionError("Nested call expressions are not allowed.")
    return expression


# --------------------------------------------------------------------------
# Process-isolated computation with a hard timeout
# --------------------------------------------------------------------------

def _runner(func: Callable[..., Any], args: tuple, result_queue: "mp.Queue[Any]") -> None:  # pragma: no cover - runs in a child process
    try:
        result_queue.put(("ok", func(*args)))
    except Exception as exc:  # noqa: BLE001 - the message is returned to the caller
        result_queue.put(("error", f"{type(exc).__name__}: {exc}"))


def run_isolated(func: Callable[..., Any], *args: Any, timeout: float) -> Any:
    """Run ``func(*args)`` in a child process, terminating it after ``timeout``.

    Raises :class:`TimeoutError` on expiry and re-raises the child's exception
    type as a :class:`RuntimeError` otherwise. Using a process (rather than a
    thread) is what makes the timeout enforceable.
    """
    context = mp.get_context("spawn")
    result_queue: "mp.Queue[Any]" = context.Queue()
    process = context.Process(target=_runner, args=(func, args, result_queue), daemon=True)
    process.start()
    try:
        status, payload = result_queue.get(timeout=timeout)
    except queue.Empty:
        process.terminate()
        process.join(timeout=1)
        raise TimeoutError(f"The computation exceeded the {timeout:.1f} s budget and was stopped.") from None
    finally:
        if process.is_alive():
            process.terminate()
            process.join(timeout=1)
    if status == "error":
        raise RuntimeError(payload)
    return payload


# --------------------------------------------------------------------------
# Rate limiting
# --------------------------------------------------------------------------

class TokenBucketLimiter:
    """In-memory per-client limiter (per process).

    Adequate for a single instance and for local use. Behind a load balancer,
    each replica enforces its own share — documented limitation, not a silent
    guarantee.
    """

    def __init__(self, capacity: int, per_seconds: float = 60.0) -> None:
        self.capacity = max(1, capacity)
        self.window = per_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, client: str) -> tuple[bool, float]:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits.setdefault(client, deque())
            while bucket and now - bucket[0] > self.window:
                bucket.popleft()
            if len(bucket) >= self.capacity:
                retry_after = self.window - (now - bucket[0])
                return False, max(0.0, retry_after)
            bucket.append(now)
            if len(self._hits) > 5000:  # bound memory under a spray of client keys
                for key in list(self._hits)[:1000]:
                    if not self._hits[key]:
                        self._hits.pop(key, None)
            return True, 0.0
