#!/usr/bin/env bash
# Initialize the isolated HooperIQ PostgreSQL database.
# Usage:
#   ./db/init.sh           # migrations only
#   ./db/init.sh --seed    # migrations + demo seed
#   DATABASE_URL=postgres://user:pass@host:5432/hooperiq ./db/init.sh --seed

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="${HOOPERIQ_DATABASE_URL:-${DATABASE_URL:-postgres://localhost/hooperiq}}"
SEED=0

for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    -h|--help)
      echo "Usage: $0 [--seed]"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install PostgreSQL client tools." >&2
  exit 1
fi

echo "==> HooperIQ DB init"
echo "    URL: ${DB_URL%%@*}@***"

# Create database if using local default and createdb is available
if [[ "$DB_URL" == "postgres://localhost/hooperiq" ]] || [[ "$DB_URL" == "postgresql://localhost/hooperiq" ]]; then
  if command -v createdb >/dev/null 2>&1; then
    createdb hooperiq 2>/dev/null || true
  fi
fi

MIGRATIONS=(
  "001_extensions.sql"
  "002_users.sql"
  "003_basketball_plays.sql"
  "004_team_campaigns.sql"
  "005_assessments.sql"
  "006_indexes_and_views.sql"
)

for file in "${MIGRATIONS[@]}"; do
  path="$ROOT/db/migrations/$file"
  echo "==> Applying $file"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$path"
done

if [[ "$SEED" -eq 1 ]]; then
  echo "==> Seeding demo data"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT/db/seeds/001_demo.sql"
fi

echo "==> Done. Core tables:"
psql "$DB_URL" -c "\dt" | sed -n '1,40p'
