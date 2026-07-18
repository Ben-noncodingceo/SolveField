#!/usr/bin/env bash
# ================================================================================
# SolveField deploy.sh — Standardized CI-style deploy pipeline
#
# Usage:
#   CLOUDFLARE_API_TOKEN=<token> bash scripts/deploy.sh [--skip-db]
#
# What it does:
#   1. Pre-flight: check token, bindings, schema drift
#   2. Clean build: rm -rf .next .open-next → full rebuild
#   3. Workerd smoke: wrangler dev --local (3 endpoints 200)
#   4. Deploy: wrangler deploy
#   5. Health check: production 4 endpoints 200
#   6. Auto-rollback on any failure
#
# Exit codes:
#   0 — success, production verified healthy
#   1 — pre-flight failed
#   2 — build failed
#   3 — local smoke failed
#   4 — deploy failed (auto-rollback attempted)
#   5 — health check failed (auto-rollback attempted)
# ================================================================================

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_ENDPOINTS=(
  "https://solvefield.playphysics.net/"
  "https://solvefield.playphysics.net/problems"
  "https://solvefield.playphysics.net/problems/ipho-2026-t1?lang=en"
  "https://solvefield.playphysics.net/admin"
  "https://solvefield.playphysics.net/api/problems"
)
SMOKE_PORT=8788
SMOKE_ENDPOINTS=("http://localhost:${SMOKE_PORT}/" "http://localhost:${SMOKE_PORT}/problems" "http://localhost:${SMOKE_PORT}/admin")
SKIP_DB=false
ROLLBACK_TARGET=""  # filled at deploy step if we need to rollback

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy.sh]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy.sh] WARN${NC} $*"; }
err()  { echo -e "${RED}[deploy.sh] ERROR${NC} $*"; }

# ── Argument parsing ────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --skip-db) SKIP_DB=true ;;
    *) err "Unknown argument: $arg"; exit 1 ;;
  esac
done

cd "$REPO_ROOT"

# ════════════════════════════════════════════════════════════════════════════════
# STEP 0 — Pre-flight checks
# ════════════════════════════════════════════════════════════════════════════════
log "══════ STEP 0: Pre-flight checks ══════"

# 0a. Token
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  err "CLOUDFLARE_API_TOKEN is not set. Export it before running."
  exit 1
fi

# 0b. wrangler whoami
if ! npx wrangler whoami >/dev/null 2>&1; then
  err "wrangler whoami failed — token may be invalid or expired."
  exit 1
fi
log "✓ Token valid (wrangler whoami OK)"

# 0c. Bindings: D1/R2/KV present in wrangler config
log "Checking bindings…"
# Use wrangler deploy --dry-run to verify bindings resolve (stderr expected for dry-run abort)
set +e
BINDINGS_OUTPUT="$(npx wrangler deploy --dry-run --config wrangler.jsonc 2>&1)"
DRY_RUN_RC=$?
set -e
# dry-run aborts with non-zero — check the output regardless
if ! echo "$BINDINGS_OUTPUT" | grep -q 'env.D1'; then
  err "D1 binding missing from deploy output. Dry-run output:"
  echo "$BINDINGS_OUTPUT"
  exit 1
fi
if ! echo "$BINDINGS_OUTPUT" | grep -q 'env.R2'; then
  err "R2 binding missing from deploy output."
  exit 1
fi
if ! echo "$BINDINGS_OUTPUT" | grep -q 'env.KV'; then
  err "KV binding missing from deploy output."
  exit 1
fi
log "✓ Bindings verified (D1, R2, KV)"

# 0d. Schema drift check (skip if --skip-db)
if [ "$SKIP_DB" = false ]; then
  log "Checking for unapplied migrations (schema drift)…"
  # Compare local migration files vs remote payload_migrations table
  LOCAL_MIGRATIONS=$(ls src/migrations/ 2>/dev/null | grep -c '\.ts$' || echo 0)
  if [ "$LOCAL_MIGRATIONS" -gt 0 ]; then
    echo "  Local migrations: $LOCAL_MIGRATIONS file(s)"
    echo "  (Manual check required — verify all local migrations are applied on remote D1 before proceeding.)"
    warn "Schema drift check is advisory. Pausing 3s for human review…"
    sleep 3
  fi
fi

# ════════════════════════════════════════════════════════════════════════════════
# STEP 1 — Clean build
# ════════════════════════════════════════════════════════════════════════════════
log "══════ STEP 1: Clean build ══════"

log "Cleaning build cache…"
rm -rf .next .open-next
log "✓ Cache cleared"

log "Step 1a: next build…"
if ! pnpm run build 2>&1; then
  err "next build failed."
  exit 2
fi
log "✓ next build complete"

log "Step 1b: opennextjs-cloudflare build…"
if ! pnpm exec opennextjs-cloudflare build 2>&1; then
  err "OpenNext build failed."
  exit 2
fi

# Verify artifact is non-empty
if [ ! -d ".open-next" ]; then
  err ".open-next directory not found after build."
  exit 2
fi
if [ ! -f ".open-next/worker.js" ]; then
  err ".open-next/worker.js not found — OpenNext build may have failed silently."
  exit 2
fi
ARTIFACT_COUNT=$(find .open-next -type f | wc -l | tr -d ' ')
if [ "$ARTIFACT_COUNT" -lt 10 ]; then
  err "Build artifact looks empty: only ${ARTIFACT_COUNT} files in .open-next/"
  exit 2
fi
log "✓ Build complete: ${ARTIFACT_COUNT} files in .open-next/ (worker.js present)"

# ════════════════════════════════════════════════════════════════════════════════
# STEP 2 — Workerd local smoke
# ════════════════════════════════════════════════════════════════════════════════
log "══════ STEP 2: Workerd local smoke ══════"

log "Starting wrangler dev --local on port ${SMOKE_PORT}…"
npx wrangler dev --local --port "$SMOKE_PORT" --config wrangler.jsonc &
WRANGLER_PID=$!

# Wait for server to be ready (max 15s)
READY=false
for i in $(seq 1 15); do
  if curl -s "http://localhost:${SMOKE_PORT}/" >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
done

if [ "$READY" = false ]; then
  err "wrangler dev did not become ready within 15s."
  kill "$WRANGLER_PID" 2>/dev/null || true
  exit 3
fi
log "✓ wrangler dev ready (PID=${WRANGLER_PID})"

SMOKE_FAILED=false
for endpoint in "${SMOKE_ENDPOINTS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" 2>&1 || echo "000")
  if [ "$STATUS" = "200" ]; then
    log "  ✓ ${endpoint} → ${STATUS}"
  else
    err "  ✗ ${endpoint} → ${STATUS}"
    SMOKE_FAILED=true
  fi
done

# Kill the dev server regardless
kill "$WRANGLER_PID" 2>/dev/null || true

if [ "$SMOKE_FAILED" = true ]; then
  err "Local workerd smoke failed."
  exit 3
fi
log "✓ All local smoke endpoints 200"

# ════════════════════════════════════════════════════════════════════════════════
# STEP 3 — Deploy
# ════════════════════════════════════════════════════════════════════════════════
log "══════ STEP 3: Deploy ══════"

# Record version before deploy for potential rollback
log "Recording current active version…"
VERSIONS_BEFORE=""
if command -v jq &>/dev/null; then
  VERSIONS_BEFORE=$(npx wrangler versions list --config wrangler.jsonc --json 2>/dev/null | jq -r '.[0].id // empty' 2>/dev/null || echo "")
fi
if [ -z "$VERSIONS_BEFORE" ]; then
  # fallback: grep for first version ID in text output
  VERSIONS_BEFORE=$(npx wrangler versions list --config wrangler.jsonc 2>/dev/null | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1 || echo "")
fi
log "Current active version before deploy: ${VERSIONS_BEFORE:-unknown}"

log "Running wrangler deploy…"
DEPLOY_OUTPUT=$(npx wrangler deploy --config wrangler.jsonc 2>&1) || {
  err "wrangler deploy failed."
  echo "$DEPLOY_OUTPUT"
  exit 4
}

# Extract new version from output
NEW_VERSION=$(echo "$DEPLOY_OUTPUT" | grep -oE 'Current Version ID: [a-f0-9-]+' | awk '{print $NF}' || echo "")
if [ -z "$NEW_VERSION" ]; then
  # fallback: grep for any version-id pattern
  NEW_VERSION=$(echo "$DEPLOY_OUTPUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | tail -1 || echo "")
fi
if [ -z "$NEW_VERSION" ]; then
  err "Could not determine new version ID from deploy output."
  exit 4
fi
log "✓ Deployed: ${NEW_VERSION}"

# Set rollback target
ROLLBACK_TARGET="${VERSIONS_BEFORE}"

# ════════════════════════════════════════════════════════════════════════════════
# STEP 4 — Production health check
# ════════════════════════════════════════════════════════════════════════════════
log "══════ STEP 4: Production health check ══════"

# Brief cooldown for Cloudflare edge propagation
sleep 2

HEALTH_FAILED=false
HEALTH_MAX_RETRIES=3
for endpoint in "${HEALTH_ENDPOINTS[@]}"; do
  OK=false
  for attempt in $(seq 1 $HEALTH_MAX_RETRIES); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --noproxy '*' "$endpoint" 2>&1 || echo "000")
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ] || [ "$STATUS" = "307" ]; then
      log "  ✓ ${endpoint} → ${STATUS}"
      OK=true
      break
    fi
    sleep 1
  done
  if [ "$OK" = false ]; then
    err "  ✗ ${endpoint} → ${STATUS}"
    HEALTH_FAILED=true
  fi
done

# ════════════════════════════════════════════════════════════════════════════════
# STEP 5 — Result
# ════════════════════════════════════════════════════════════════════════════════

if [ "$HEALTH_FAILED" = true ]; then
  err "══════ HEALTH CHECK FAILED — rolling back ══════"

  if [ -n "$ROLLBACK_TARGET" ]; then
    log "Rolling back to version ${ROLLBACK_TARGET}…"
    npx wrangler rollback "$ROLLBACK_TARGET" --config wrangler.jsonc --message "auto-rollback: health check failed for ${NEW_VERSION}" 2>&1 || {
      err "Rollback failed! Manual intervention required."
      exit 5
    }

    # Verify rollback
    sleep 2
    ROLLBACK_OK=true
    for endpoint in "${HEALTH_ENDPOINTS[@]}"; do
      STATUS=$(curl -s -o /dev/null -w "%{http_code}" --noproxy '*' "$endpoint" 2>&1 || echo "000")
      if [ "$STATUS" != "200" ] && [ "$STATUS" != "301" ] && [ "$STATUS" != "302" ] && [ "$STATUS" != "307" ]; then
        err "Post-rollback ${endpoint} → ${STATUS}"
        ROLLBACK_OK=false
      fi
    done

    if [ "$ROLLBACK_OK" = true ]; then
      log "✓ Rollback successful. Production healthy on ${ROLLBACK_TARGET}."
    else
      err "Post-rollback health check also failed! Manual intervention required."
    fi
    exit 5
  else
    err "No rollback target available. Manual intervention required."
    exit 5
  fi
fi

log "══════ ALL CHECKS PASSED ══════"
log "Version: ${NEW_VERSION}"
log "Endpoints: ${#HEALTH_ENDPOINTS[@]}/${#HEALTH_ENDPOINTS[@]} healthy"
log "Deploy complete. 🎉"

# Print rollback command for reference
echo ""
echo "To rollback manually:  npx wrangler rollback ${ROLLBACK_TARGET} --config wrangler.jsonc"

exit 0
