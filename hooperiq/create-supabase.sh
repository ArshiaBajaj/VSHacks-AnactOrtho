#!/usr/bin/env bash
# Create (or reuse) a Supabase cloud project, push HooperIQ schema, write .env.local
#
# Usage (run in your own terminal — Cursor agent sandbox blocks api.supabase.com):
#   ./hooperiq/create-supabase.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
OUT="$ROOT/.supabase-create-out.txt"
: > "$OUT"
log() { printf '%s\n' "$*" | tee -a "$OUT"; }

export DO_NOT_TRACK=1
export SUPABASE_INTERNAL_NO_TELEMETRY=1
export SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -s 'Supabase CLI' -w 2>/dev/null || true)}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Not logged in to Supabase CLI."
  echo "Run:  supabase login"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found. Install: brew install supabase/tap/supabase"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 required"
  exit 1
fi

api() {
  local method="$1" path="$2"
  shift 2
  curl -sS -X "$method" "https://api.supabase.com/v1${path}" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    "$@"
}

log "==> Organizations"
ORG_JSON=$(api GET /organizations)
echo "$ORG_JSON" >> "$OUT"
ORG_ID=$(echo "$ORG_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if isinstance(d,list) and d else "")')
if [[ -z "$ORG_ID" ]]; then
  echo "Could not resolve org. Response:" >&2
  echo "$ORG_JSON" >&2
  exit 1
fi
log "ORG_ID=$ORG_ID"

log "==> Projects"
PROJ_JSON=$(api GET /projects)
echo "$PROJ_JSON" >> "$OUT"
EXISTING_REF=$(echo "$PROJ_JSON" | python3 -c '
import sys,json
d=json.load(sys.stdin)
if not isinstance(d,list): raise SystemExit
for p in d:
  name=(p.get("name") or "").lower()
  if name in ("hooperiq","hooper-iq","summerhackathon","courtvision"):
    print(p["id"]); break
')

REGION="${SUPABASE_REGION:-us-east-1}"
DB_PASS=""
REF=""

if [[ -n "$EXISTING_REF" ]]; then
  REF="$EXISTING_REF"
  log "Reusing project ref=$REF"
  if [[ -f "$ROOT/supabase/.temp-db-password" ]]; then
    DB_PASS=$(cat "$ROOT/supabase/.temp-db-password")
  fi
else
  DB_PASS=$(openssl rand -base64 32 | tr -d '/+=' | head -c 28)
  umask 077
  mkdir -p "$ROOT/supabase"
  printf '%s' "$DB_PASS" > "$ROOT/supabase/.temp-db-password"
  log "==> Creating project hooperiq ($REGION)"
  CREATE=$(api POST /projects -d "{\"name\":\"hooperiq\",\"organization_id\":\"$ORG_ID\",\"db_pass\":\"$DB_PASS\",\"region\":\"$REGION\",\"plan\":\"free\"}")
  echo "$CREATE" >> "$OUT"
  REF=$(echo "$CREATE" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("id") or "")')
  if [[ -z "$REF" ]]; then
    echo "Create failed:" >&2
    echo "$CREATE" >&2
    exit 1
  fi
  log "Created ref=$REF"
fi

log "==> Waiting for ACTIVE_HEALTHY"
for i in $(seq 1 90); do
  STATUS=$(api GET "/projects/$REF" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))' 2>/dev/null || true)
  log "  [$i] $STATUS"
  [[ "$STATUS" == "ACTIVE_HEALTHY" ]] && break
  sleep 5
done

log "==> API keys"
KEYS=$(api GET "/projects/$REF/api-keys")
echo "$KEYS" >> "$OUT"
ANON=$(echo "$KEYS" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((k.get("api_key") for k in d if k.get("name")=="anon" or k.get("type")=="anon"),""))')
SERVICE=$(echo "$KEYS" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((k.get("api_key") for k in d if k.get("name") in ("service_role","service") or k.get("type")=="service_role"),""))')
URL="https://${REF}.supabase.co"

if [[ -z "$ANON" ]]; then
  echo "Could not read anon key" >&2
  echo "$KEYS" >&2
  exit 1
fi

umask 077
cat > "$REPO/apps/web/.env.local" <<ENV
VITE_API_URL=http://localhost:8787
VITE_SUPABASE_URL=$URL
VITE_SUPABASE_ANON_KEY=$ANON
ENV

cat > "$ROOT/.env" <<ENV
SUPABASE_URL=$URL
SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
SUPABASE_PROJECT_REF=$REF
ENV

# Link + push schema
cd "$ROOT"
log "==> Linking project"
if [[ -n "$DB_PASS" ]]; then
  supabase link --project-ref "$REF" --password "$DB_PASS" || true
else
  log "No DB password on file — if link fails, run: supabase link --project-ref $REF"
  supabase link --project-ref "$REF" || true
fi

log "==> Pushing migrations"
supabase db push --include-all --yes

# Seed via psql if we have password, else via supabase db execute
if [[ -n "$DB_PASS" && -f "$ROOT/supabase/seed.sql" ]]; then
  log "==> Seeding demo data"
  PGPASSWORD="$DB_PASS" psql \
    "postgresql://postgres.${REF}:${DB_PASS}@aws-0-${REGION}.pooler.supabase.com:6543/postgres" \
    -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed.sql" \
  || PGPASSWORD="$DB_PASS" psql \
    "postgresql://postgres:${DB_PASS}@db.${REF}.supabase.co:5432/postgres" \
    -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed.sql" \
  || log "Seed via psql failed — run seed manually in SQL editor"
fi

log ""
log "============================================"
log "Supabase ready"
log "  Project: $REF"
log "  URL:     $URL"
log "  Env:     apps/web/.env.local"
log "  Restart: npm run dev"
log "============================================"
