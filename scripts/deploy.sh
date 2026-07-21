#!/usr/bin/env bash
# ================================================================================
# SolveField deploy.sh — Standardized CI-style deploy pipeline
#
# Usage:
#   CLOUDFLARE_API_TOKEN=<token> bash scripts/deploy.sh [--skip-db] [--preflight-only]
#
# What it does:
#   1. Pre-flight: check token, bindings, schema drift
#   2. Clean build: rm -rf .next .open-next → full rebuild
#   3. Workerd smoke: wrangler dev --local (3 endpoints 200)
#   4. Deploy: wrangler deploy
#   5. Health check: production 5 endpoints healthy
#   6. Auto-rollback on post-deploy health failure
#
# Exit codes:
#   0 — success, production verified healthy
#   1 — pre-flight failed
#   2 — build failed
#   3 — local smoke failed
#   4 — deploy/version verification failed (rollback if active version changed)
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
PREFLIGHT_ONLY=false
ROLLBACK_TARGET=""  # filled at deploy step if we need to rollback
WRANGLER_PID=""
SMOKE_PERSIST_DIR=""
SMOKE_PAYLOAD_SECRET=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy.sh]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy.sh] WARN${NC} $*"; }
err()  { echo -e "${RED}[deploy.sh] ERROR${NC} $*"; }

read_active_version() {
  local deployment_status
  if ! deployment_status=$(npx wrangler deployments status --config wrangler.jsonc --json 2>/dev/null); then
    return 1
  fi
  printf '%s' "$deployment_status" | node -e '
    const deployment = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    const versions = Array.isArray(deployment.versions) ? deployment.versions : [];
    if (versions.length !== 1 || Number(versions[0].percentage) !== 100 || !versions[0].version_id) process.exit(1);
    process.stdout.write(versions[0].version_id);
  '
}

cleanup() {
  if [ -n "$WRANGLER_PID" ]; then
    kill "$WRANGLER_PID" 2>/dev/null || true
    wait "$WRANGLER_PID" 2>/dev/null || true
    WRANGLER_PID=""
  fi
  if [ -n "$SMOKE_PERSIST_DIR" ]; then
    node -e 'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })' "$SMOKE_PERSIST_DIR"
    SMOKE_PERSIST_DIR=""
  fi
  SMOKE_PAYLOAD_SECRET=""
}

on_signal() {
  cleanup
  exit 130
}

trap cleanup EXIT
trap on_signal INT TERM

# ── Argument parsing ────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --skip-db) SKIP_DB=true ;;
    --preflight-only) PREFLIGHT_ONLY=true ;;
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

# 0c. Bindings: D1/R2/KV present in wrangler config (moved to after build, needs .open-next/worker.js)
# See STEP 1b for the actual check — we defer binding verification until after OpenNext build
# since wrangler deploy --dry-run requires the entry-point file.

# 0d. Schema drift check (skip if --skip-db)
if [ "$SKIP_DB" = false ]; then
  log "Checking remote D1 migration tracking and schema sentinels…"
  if ! pnpm exec tsx scripts/deploy-database.ts --check-only; then
    err "Remote D1 schema is not aligned with the local migration registry. Deploying code is blocked."
    exit 1
  fi
  log "✓ Remote D1 schema matches local migrations"
else
  warn "Remote D1 schema check skipped by explicit --skip-db"
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

# 1c. Post-build binding check (needs .open-next/worker.js to exist)
log "Checking bindings (post-build)…"
set +e
BINDINGS_OUTPUT="$(npx wrangler deploy --dry-run --config wrangler.jsonc 2>&1)"
BINDINGS_STATUS=$?
set -e
if [ "$BINDINGS_STATUS" -ne 0 ]; then
  err "Wrangler binding dry-run failed:"
  echo "$BINDINGS_OUTPUT"
  exit 1
fi
if ! echo "$BINDINGS_OUTPUT" | grep -q 'env.D1'; then
  err "D1 binding missing from deploy output. Bindings output:"
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

# ════════════════════════════════════════════════════════════════════════════════
# STEP 2 — Workerd local smoke
# ════════════════════════════════════════════════════════════════════════════════
log "══════ STEP 2: Workerd local smoke ══════"

log "Preparing isolated local D1 and one-time Payload secret…"
SMOKE_PERSIST_DIR=$(mktemp -d)
SMOKE_PAYLOAD_SECRET=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
if ! pnpm exec tsx scripts/deploy-database.ts --local --persist-to "$SMOKE_PERSIST_DIR"; then
  err "Could not initialize the isolated local D1 schema for smoke testing."
  exit 3
fi

log "Starting wrangler dev --local on port ${SMOKE_PORT}…"
npx wrangler dev --local --persist-to "$SMOKE_PERSIST_DIR" --port "$SMOKE_PORT" \
  --config wrangler.jsonc --var "PAYLOAD_SECRET:${SMOKE_PAYLOAD_SECRET}" &
WRANGLER_PID=$!

# Wait for server to be ready (max 15s)
READY=false
for i in $(seq 1 15); do
  if curl -s --connect-timeout 1 --max-time 3 "http://localhost:${SMOKE_PORT}/" >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
done

if [ "$READY" = false ]; then
  err "wrangler dev did not become ready within 15s."
  exit 3
fi
log "✓ wrangler dev ready (PID=${WRANGLER_PID})"

SMOKE_FAILED=false
for endpoint in "${SMOKE_ENDPOINTS[@]}"; do
  if ! STATUS=$(curl -s --connect-timeout 1 --max-time 3 -o /dev/null -w "%{http_code}" "$endpoint" 2>/dev/null); then
    STATUS="000"
  fi
  if [ "$STATUS" = "200" ]; then
    log "  ✓ ${endpoint} → ${STATUS}"
  else
    err "  ✗ ${endpoint} → ${STATUS}"
    SMOKE_FAILED=true
  fi
done

# Stop the dev server before touching production.
cleanup

if [ "$SMOKE_FAILED" = true ]; then
  err "Local workerd smoke failed."
  exit 3
fi
log "✓ All local smoke endpoints 200"

if [ "$PREFLIGHT_ONLY" = true ]; then
  log "══════ PREFLIGHT-ONLY PASSED — production was not changed ══════"
  exit 0
fi

# ════════════════════════════════════════════════════════════════════════════════
# STEP 3 — Deploy
# ════════════════════════════════════════════════════════════════════════════════
log "══════ STEP 3: Deploy ══════"

# Record the actual 100%-active production version before deploy. A split
# deployment is intentionally rejected because choosing a rollback target would
# otherwise be ambiguous.
log "Recording current active version…"
if ! VERSIONS_BEFORE=$(read_active_version); then
  err "Could not resolve a single 100%-active production version; refusing to deploy without an unambiguous rollback target."
  exit 1
fi
log "Current active version before deploy: ${VERSIONS_BEFORE}"
ROLLBACK_TARGET="${VERSIONS_BEFORE}"

log "Running wrangler deploy…"
if ! DEPLOY_OUTPUT=$(npx wrangler deploy --config wrangler.jsonc 2>&1); then
  err "wrangler deploy failed."
  echo "$DEPLOY_OUTPUT"
  if ACTIVE_VERSION=$(read_active_version) && [ "$ACTIVE_VERSION" != "$ROLLBACK_TARGET" ]; then
    warn "Active version changed despite the failed command; rolling back to ${ROLLBACK_TARGET}."
    npx wrangler rollback "$ROLLBACK_TARGET" --config wrangler.jsonc --message "auto-rollback: deploy command failed" --yes 2>&1 || {
      err "Rollback failed! Manual intervention required."
    }
  fi
  exit 4
fi

# Verify the production deployment state instead of trusting CLI prose. This
# also catches a misleading exit 0 that did not activate a new Worker version.
NEW_VERSION=""
for attempt in $(seq 1 5); do
  if ACTIVE_VERSION=$(read_active_version) && [ "$ACTIVE_VERSION" != "$ROLLBACK_TARGET" ]; then
    NEW_VERSION="$ACTIVE_VERSION"
    break
  fi
  sleep 2
done

if [ -z "$NEW_VERSION" ]; then
  err "Deploy returned success but no new single 100%-active version was observed."
  if ACTIVE_VERSION=$(read_active_version) && [ "$ACTIVE_VERSION" = "$ROLLBACK_TARGET" ]; then
    err "Previous version is still active; no rollback is necessary."
  else
    warn "Production state is ambiguous; rolling back to ${ROLLBACK_TARGET}."
    npx wrangler rollback "$ROLLBACK_TARGET" --config wrangler.jsonc --message "auto-rollback: post-deploy version verification failed" --yes 2>&1 || {
      err "Rollback failed! Manual intervention required."
    }
  fi
  exit 4
fi
log "✓ Deployed and active at 100%: ${NEW_VERSION}"

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
    if ! STATUS=$(curl -s --connect-timeout 5 --max-time 15 -o /dev/null -w "%{http_code}" --noproxy '*' "$endpoint" 2>/dev/null); then
      STATUS="000"
    fi
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
    npx wrangler rollback "$ROLLBACK_TARGET" --config wrangler.jsonc --message "auto-rollback: health check failed for ${NEW_VERSION}" --yes 2>&1 || {
      err "Rollback failed! Manual intervention required."
      exit 5
    }

    # Verify rollback with the same retry policy as the first health check.
    sleep 2
    ROLLBACK_OK=true
    for endpoint in "${HEALTH_ENDPOINTS[@]}"; do
      OK=false
      for attempt in $(seq 1 $HEALTH_MAX_RETRIES); do
        if ! STATUS=$(curl -s --connect-timeout 5 --max-time 15 -o /dev/null -w "%{http_code}" --noproxy '*' "$endpoint" 2>/dev/null); then
          STATUS="000"
        fi
        if [ "$STATUS" = "200" ] || [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ] || [ "$STATUS" = "307" ]; then
          log "  ✓ post-rollback ${endpoint} → ${STATUS}"
          OK=true
          break
        fi
        sleep 1
      done
      if [ "$OK" = false ]; then
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
echo "To rollback manually:  npx wrangler rollback ${ROLLBACK_TARGET} --config wrangler.jsonc --yes"

exit 0
