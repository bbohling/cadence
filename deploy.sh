#!/usr/bin/env bash
#
# deploy.sh — Server-side deploy for Cadence (cadence.brndn.me)
#
# Runs ON the droplet. The UI is built in CI (GitHub Actions) and its
# `ui/dist` is rsynced onto the server BEFORE this script runs, so this
# script never builds the UI — the droplet (2GB RAM, tight disk) can't
# reliably run a Vite build. This script only:
#   - pulls latest API source + configs
#   - installs API dependencies (light)
#   - backs up + migrates the SQLite database
#   - restarts PM2 processes
#   - health-checks the API before declaring success
#
# Usage:
#   ./deploy.sh
#   ssh user@host 'cd /usr/share/nginx/cadence && ./deploy.sh'
#
# Prerequisites:
#   - bun, pm2, caddy installed on the server
#   - ui/dist already rsynced into place by CI
#   - api/.env contains secrets (Bun auto-loads it)
#   - cadence.caddy symlinked into /etc/caddy/sites/

set -euo pipefail

# Non-interactive SSH (how CI connects) does not source ~/.bashrc, so the
# Bun install dir is not on PATH. Add it explicitly.
export PATH="$HOME/.bun/bin:$PATH"

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
CADDY_SITES_DIR="/etc/caddy/sites"
CADDY_CONFIG="/etc/caddy/Caddyfile"
DB_PATH="$DEPLOY_DIR/api/data/cadence.db"
LOG_PREFIX="[cadence-deploy]"

log()  { echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') $*"; }
fail() { log "FAILED: $*" >&2; exit 1; }

command -v bun >/dev/null 2>&1 || fail "bun not found on PATH ($PATH)"

cd "$DEPLOY_DIR"
log "Starting deploy from $DEPLOY_DIR"

# ── Pull latest code (ui/dist is gitignored, rsync'd artifact survives) ─
log "Pulling latest code..."
git pull --ff-only origin main || fail "git pull failed"

# ── Verify CI shipped the UI build ─────────────────────────────────────
if [[ ! -f "$DEPLOY_DIR/ui/dist/index.html" ]]; then
    fail "ui/dist/index.html missing — CI did not ship the UI build"
fi

# ── Install API dependencies (light, no build) ─────────────────────────
log "Installing API dependencies..."
cd api
bun install --frozen-lockfile || fail "API bun install failed"
cd ..

# ── Back up the database before migrating (single rolling backup; disk
#    on this droplet is tight, so we keep only the last one) ────────────
if [[ -f "$DB_PATH" ]]; then
    log "Backing up database..."
    cp -f "$DB_PATH" "$DB_PATH.bak" || log "WARNING: db backup failed, continuing"
fi

# ── Run database migrations ────────────────────────────────────────────
log "Running database migrations..."
cd api
bun src/db/migrate.ts || fail "Database migration failed"
cd ..

# ── Restart PM2 processes ──────────────────────────────────────────────
log "Restarting PM2 processes..."
pm2 restart ecosystem.config.cjs || {
    log "PM2 restart failed, attempting fresh start..."
    pm2 delete cadence-api cadence-sync cadence-kom-refresh 2>/dev/null || true
    pm2 start ecosystem.config.cjs || fail "PM2 start failed"
}
pm2 save || log "WARNING: pm2 save failed (processes running but not persisted)"

# ── Health gate — fail loudly if the API is not actually serving ───────
log "Health check..."
for i in 1 2 3 4 5; do
    if curl -fsS "http://localhost:3033/health" >/dev/null 2>&1; then
        log "API healthy"
        break
    fi
    [[ $i -eq 5 ]] && fail "API health check failed after restart"
    sleep 2
done

# ── Ensure Caddy config is symlinked ───────────────────────────────────
if [[ -d "$CADDY_SITES_DIR" ]] && [[ ! -L "$CADDY_SITES_DIR/cadence.caddy" ]]; then
    log "Symlinking Caddy config..."
    ln -s "$DEPLOY_DIR/cadence.caddy" "$CADDY_SITES_DIR/cadence.caddy"
    if caddy validate --config "$CADDY_CONFIG" 2>/dev/null; then
        sudo caddy reload --config "$CADDY_CONFIG" || log "WARNING: Caddy reload failed"
    else
        log "WARNING: Caddy config validation failed, skipping reload"
        rm "$CADDY_SITES_DIR/cadence.caddy"
    fi
fi

log "Deploy complete ✅"
