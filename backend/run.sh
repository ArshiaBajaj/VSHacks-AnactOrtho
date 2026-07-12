#!/usr/bin/env bash
# One-command backend start (macOS/Linux). First run creates the venv and installs deps.
set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ ! -d .venv ]; then
    echo "Setting up venv (first run)..."
    if command -v uv >/dev/null 2>&1; then
        uv venv --python 3.12 .venv
        uv pip install -p .venv/bin/python -r requirements.txt
    else
        python3.12 -m venv .venv || python3 -m venv .venv
        .venv/bin/python -m pip install -r requirements.txt
    fi
fi

exec .venv/bin/python -m uvicorn app.main:app --reload --port "${PORT:-8787}"
