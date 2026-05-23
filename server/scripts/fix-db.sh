#!/bin/bash
# =============================================================================
# NexaLink — Fix Database Password (Standalone Recovery Script)
#
# Run this when Synapse fails with:
#   "FATAL: password authentication failed for user synapse"
#   "502 Bad Gateway" after server reinstall
#
# Usage:
#   cd ~/wwww/server
#   sudo bash scripts/fix-db.sh
#
# What it does:
#   1. Reads the correct password from .env
#   2. Checks if postgres accepts it
#   3. If not — resets the postgres user password via ALTER USER
#   4. If ALTER USER fails — drops the volume and recreates postgres
#   5. Restarts Synapse and verifies everything works
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[fix-db]${NC} $1"; }
warn() { echo -e "${YELLOW}[fix-db]${NC} WARNING: $1"; }
err()  { echo -e "${RED}[fix-db]${NC} ERROR: $1" >&2; }
ok()   { echo -e "${GREEN}[fix-db]${NC} ✓ $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight
# ─────────────────────────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
    err "Run as root: sudo bash scripts/fix-db.sh"
    exit 1
fi

if [ ! -f "$SERVER_DIR/.env" ]; then
    err ".env not found in $SERVER_DIR"
    err "Run setup.sh first: cd $SERVER_DIR && sudo bash scripts/setup.sh"
    exit 1
fi

cd "$SERVER_DIR"

# Load .env
# shellcheck source=/dev/null
set -o allexport
source "$SERVER_DIR/.env"
set +o allexport

PG_USER="${POSTGRES_USER:-synapse}"
PG_DB="${POSTGRES_DB:-synapse}"
PG_PASS="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD missing from .env}"

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}   NexaLink Database Password Repair${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""
log "Server dir : $SERVER_DIR"
log "PG user    : $PG_USER"
log "PG db      : $PG_DB"
log "PG pass    : ${PG_PASS:0:6}... (hidden)"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────────────

pg_port_open() {
    docker compose exec -T postgres pg_isready -U "$PG_USER" 2>/dev/null
}

pg_auth_ok() {
    docker compose exec -T postgres \
        psql -U "$PG_USER" -d "$PG_DB" \
             -c "SELECT 1;" -q --no-password 2>/dev/null | grep -q "1 row"
}

wait_pg_port() {
    local max="${1:-40}"
    log "Waiting for PostgreSQL port (max ${max}×2s)..."
    for i in $(seq 1 "$max"); do
        if pg_port_open; then
            ok "PostgreSQL port open."
            return 0
        fi
        sleep 2
    done
    return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Check if postgres is running
# ─────────────────────────────────────────────────────────────────────────────
log "Step 1: Checking PostgreSQL container status..."

PG_RUNNING=false
if docker compose ps postgres 2>/dev/null | grep -q "Up"; then
    PG_RUNNING=true
    ok "PostgreSQL container is running."
else
    warn "PostgreSQL container is not running. Starting it..."
    docker compose up -d postgres
    if wait_pg_port 40; then
        PG_RUNNING=true
    else
        err "PostgreSQL failed to start. Checking logs:"
        docker compose logs postgres --tail=20
        exit 1
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Test authentication with the password from .env
# ─────────────────────────────────────────────────────────────────────────────
log "Step 2: Testing password authentication..."

# Wait a moment for postgres to be fully ready
sleep 3

AUTH_OK=false
for i in $(seq 1 8); do
    if pg_auth_ok; then
        AUTH_OK=true
        break
    fi
    sleep 2
done

if [ "$AUTH_OK" = "true" ]; then
    ok "Password authentication works! No fix needed."
    echo ""
    log "Restarting Synapse to ensure clean connection..."
    docker compose restart synapse
    sleep 10
    if docker compose exec -T synapse \
        python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8008/health')" \
        2>/dev/null; then
        ok "Synapse is healthy!"
    else
        warn "Synapse is still starting — wait 30 more seconds."
    fi
    echo ""
    ok "Everything looks good."
    exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Auth failed — try ALTER USER to update password
# ─────────────────────────────────────────────────────────────────────────────
warn "Step 3: Auth failed with .env password. Trying ALTER USER..."
log "The postgres data volume has a different password than .env."

# Stop Synapse so it doesn't spam error logs while we fix postgres
docker compose stop synapse 2>/dev/null || true

ALTERED=false
for i in $(seq 1 15); do
    if docker compose exec -T postgres \
        psql -U postgres \
             -c "ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASS}';" \
             2>/dev/null | grep -q "ALTER ROLE"; then
        ALTERED=true
        break
    fi
    sleep 2
done

if [ "$ALTERED" = "true" ]; then
    ok "ALTER USER succeeded. Verifying auth..."
    sleep 2
    if pg_auth_ok; then
        ok "Authentication now works with the .env password!"
    else
        warn "Auth still failing after ALTER USER. Proceeding to volume reset..."
        ALTERED=false
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: If ALTER USER failed or didn't help — drop volume and recreate
# ─────────────────────────────────────────────────────────────────────────────
if [ "$ALTERED" = "false" ] || ! pg_auth_ok; then
    warn "Step 4: Dropping PostgreSQL volume and recreating with .env password."
    warn "This will DELETE all existing data in PostgreSQL."
    echo ""
    read -rp "  Are you sure? This is irreversible. [y/N] " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        err "Aborted. Fix the password manually or run setup.sh."
        exit 1
    fi

    log "Stopping and removing postgres container..."
    docker compose stop postgres 2>/dev/null || true
    docker compose rm -f postgres 2>/dev/null || true

    log "Removing postgres data volume..."
    docker volume rm server_postgres_data 2>/dev/null || true
    ok "Volume removed."

    log "Starting fresh postgres with .env password..."
    docker compose up -d postgres

    if ! wait_pg_port 40; then
        err "PostgreSQL failed to start after volume reset."
        docker compose logs postgres --tail=20
        exit 1
    fi

    sleep 5
    if pg_auth_ok; then
        ok "PostgreSQL running with fresh volume and correct password."
    else
        err "Still failing. Check .env and docker-compose.yml manually."
        docker compose logs postgres --tail=20
        exit 1
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: Recreate Synapse database schema (if volume was reset)
# ─────────────────────────────────────────────────────────────────────────────
if [ "$ALTERED" = "false" ]; then
    log "Step 5: Regenerating Synapse signing key (fresh DB needs fresh key)..."

    # Remove old synapse data volume so schema is recreated cleanly
    docker volume rm server_synapse_data 2>/dev/null || true
    docker volume create server_synapse_data 2>/dev/null || true
    docker run --rm -v server_synapse_data:/data alpine sh -c \
        "mkdir -p /data/media_store /data/uploads /data/log && \
         chown -R 991:991 /data && chmod -R 755 /data" 2>/dev/null || true

    # Remove old signing key so it gets regenerated
    rm -f "$SERVER_DIR/synapse/signing.key"

    log "Regenerating server signing key..."
    docker run --rm \
        -v "$SERVER_DIR/synapse:/data" \
        -e SYNAPSE_SERVER_NAME="$(grep "^SERVER_HOST=" "$SERVER_DIR/.env" | cut -d'=' -f2)" \
        -e SYNAPSE_REPORT_STATS=no \
        --entrypoint python3 \
        matrixdotorg/synapse:latest \
        -m synapse.app.homeserver \
        --config-path /data/homeserver.yaml \
        --generate-keys 2>&1 | tail -3 || true

    ok "Signing key regenerated."
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Restart Synapse and verify health
# ─────────────────────────────────────────────────────────────────────────────
log "Step 6: Restarting Synapse..."

docker compose up -d synapse
log "Waiting for Synapse to start (up to 4 minutes)..."

SYNAPSE_OK=false
for i in $(seq 1 80); do
    if docker compose exec -T synapse \
        python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8008/health')" \
        2>/dev/null; then
        SYNAPSE_OK=true
        break
    fi
    printf "."
    sleep 3
done
echo ""

if [ "$SYNAPSE_OK" = "true" ]; then
    ok "Synapse is healthy and accepting connections!"
else
    warn "Synapse not yet healthy — may still be starting."
    log "Check status: docker compose logs synapse --tail=30"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 7: Recreate admin user (if DB was reset)
# ─────────────────────────────────────────────────────────────────────────────
if [ "$ALTERED" = "false" ] && [ "$SYNAPSE_OK" = "true" ]; then
    ADMIN_USER="${ADMIN_USER:-admin}"
    ADMIN_PASS="${ADMIN_PASSWORD:-}"
    SERVER_HOST="$(grep "^SERVER_HOST=" "$SERVER_DIR/.env" | cut -d'=' -f2)"

    if [ -n "$ADMIN_PASS" ]; then
        log "Step 7: Recreating admin user @${ADMIN_USER}:${SERVER_HOST}..."
        docker compose exec -T synapse register_new_matrix_user \
            -u "$ADMIN_USER" \
            -p "$ADMIN_PASS" \
            -a \
            -c /data/homeserver.yaml \
            http://localhost:8008 2>&1 || warn "Admin user may already exist (OK)."
        ok "Admin user ready."
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}   Database repair complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
log "Synapse status   : $(docker compose ps synapse --format '{{.Status}}' 2>/dev/null || echo 'check manually')"
log "PostgreSQL status: $(docker compose ps postgres --format '{{.Status}}' 2>/dev/null || echo 'check manually')"
echo ""
log "Test connection  : curl -k https://$(grep '^SERVER_HOST=' "$SERVER_DIR/.env" | cut -d'=' -f2)/health"
echo ""
