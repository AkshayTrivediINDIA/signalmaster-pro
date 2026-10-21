#!/usr/bin/env bash
# Start the Vite dev server and (optionally) the symbolic backend together.
# Usage: ./scripts/dev.sh [--frontend-only]
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

if [ "${1:-}" != "--frontend-only" ] && [ -d "$root/backend" ]; then
  echo "==> starting symbolic engine on :8000"
  (
    cd "$root/backend"
    if [ -d .venv ]; then
      # shellcheck disable=SC1091
      source .venv/bin/activate
    fi
    exec uvicorn app.main:app --reload --port 8000
  ) &
  pids+=("$!")
  echo "    (if uvicorn is missing: pip install -r backend/requirements.txt)"
fi

echo "==> starting frontend on :5173"
cd "$root/frontend"
exec npm run dev
