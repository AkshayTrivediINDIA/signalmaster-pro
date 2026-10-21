#!/usr/bin/env bash
# Run every check that does not need a browser.
# Usage: ./scripts/check.sh
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> frontend: typecheck"
(cd "$root/frontend" && npm run typecheck)

echo "==> frontend: lint"
(cd "$root/frontend" && npm run lint)

echo "==> frontend: unit + component tests"
(cd "$root/frontend" && npm test)

echo "==> frontend: production build"
(cd "$root/frontend" && npm run build)

if [ -d "$root/backend" ] && command -v python3 >/dev/null 2>&1; then
  echo "==> backend: tests"
  (cd "$root/backend" && python3 -m pytest -q)
else
  echo "==> backend: skipped (no backend/ or python3 not found)"
fi

echo
echo "All checks passed."
