#!/bin/bash
# =============================================================================
# NexaLink Server — Zero-Downtime Update Script
#
# Usage:
#   sudo bash scripts/update.sh
#
# What it does:
#   1. Pulls latest code from git
#   2. Checks for new required .env variables (MinIO, etc.)
#   3. Rebuilds the NexaLink web UI
#   4. Pulls updated Docker images
#   5. Rebuilds custom Synapse image (s3 provider)
#   6. Applies rolling restart (non-critical services first, Synapse last)
#   7. Verifies health of all services
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[UPDATE]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# --- Locate directories ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
    err "Run as root: sudo bash scripts/update.sh"
    exit 1
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}   NexaLink Server Update${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# =============================================================================
# Step 1: Load current environment
# =============================================================================
ENV_FILE="$SERVER_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    err "No .env file found at $ENV_FILE"
    err "Run setup.sh first."
    exit 1
fi

# Source the env file (export all vars)
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

log "Loaded configuration from .env"

# =============================================================================
# Step 2: Check for new required variables (added in updates)
# =============================================================================
log "Checking for new required configuration..."

NEEDS_ENV_UPDATE=false

# MinIO credentials (added in 2026 update)
if ! grep -q "^MINIO_ROOT_USER=" "$ENV_FILE"; then
    warn "MINIO_ROOT_USER not found in .env — adding with default."
    echo "" >> "$ENV_FILE"
    echo "# --- MinIO (self-hosted S3 media storage) ---" >> "$ENV_FILE"
    echo "MINIO_ROOT_USER=nexalink" >> "$ENV_FILE"
    NEEDS_ENV_UPDATE=true
fi

if ! grep -q "^MINIO_ROOT_PASSWORD=" "$ENV_FILE"; then
    MINIO_PASS=$(openssl rand -hex 24)
    echo "MINIO_ROOT_PASSWORD=$MINIO_PASS" >> "$ENV_FILE"
    log "Generated MINIO_ROOT_PASSWORD and added to .env"
    NEEDS_ENV_UPDATE=true
fi

if [ "$NEEDS_ENV_UPDATE" = "true" ]; then
    log "New variables added to .env — reloading."
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
fi

# =============================================================================
# Step 3: Pull latest code
# =============================================================================
log "Pulling latest code from git..."
cd "$REPO_DIR"

# Stash any local changes to prevent merge conflicts
git stash --quiet 2>/dev/null || true

git pull --rebase origin main 2>&1 | tail -5 || {
    warn "git pull failed. Using existing code."
    git stash pop --quiet 2>/dev/null || true
}

log "Code updated."

# =============================================================================
# Step 4: Rebuild the NexaLink web UI
# =============================================================================
log "Building NexaLink web UI..."

# Install Node.js if not available
if ! command -v node &>/dev/null; then
    log "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi

cd "$REPO_DIR"
npm ci --production=false 2>/dev/null || npm install
npm run build

# Deploy to nginx
mkdir -p "$SERVER_DIR/nginx/www/nexalink"
cp -r "$REPO_DIR/dist/"* "$SERVER_DIR/nginx/www/nexalink/"
log "NexaLink UI rebuilt and deployed."

# =============================================================================
# Step 5: Generate platform installers
# =============================================================================
BASE_URL="https://$(echo "${SERVER_HOST:-localhost}" | tr '.' '-').nip.io"
if [ -f "$SERVER_DIR/nginx/www/nexalink/installers/nexalink.conf" ]; then
    BASE_URL=$(cat "$SERVER_DIR/nginx/www/nexalink/installers/nexalink.conf" 2>/dev/null || echo "$BASE_URL")
fi

if [ -f "$REPO_DIR/scripts/build-installers.sh" ]; then
    bash "$REPO_DIR/scripts/build-installers.sh" "$BASE_URL" 2>&1 || \
        warn "Desktop installer build failed (non-critical)"
fi

# =============================================================================
# Step 6: Pull updated Docker images (except Synapse which we build)
# =============================================================================
log "Pulling updated Docker images..."
cd "$SERVER_DIR"

docker compose pull --ignore-pull-failures postgres redis nginx \
    element coturn synapse-admin grafana prometheus node-exporter \
    postgres-exporter media-purger pgbouncer minio 2>&1 | tail -10 || true

# =============================================================================
# Step 7: Rebuild custom Synapse image (with s3_storage_provider)
# =============================================================================
log "Rebuilding Synapse image with s3_storage_provider..."
docker compose build --no-cache synapse 2>&1 | tail -20 || {
    warn "Synapse image rebuild failed. Using cached version."
}

# =============================================================================
# Step 8: Ensure new services are initialized
# =============================================================================
log "Ensuring new services are started..."

# Start MinIO if not running
if ! docker compose ps minio 2>/dev/null | grep -q "running\|Up"; then
    log "Starting MinIO..."
    docker compose up -d minio
    log "Waiting for MinIO to be ready..."
    for i in $(seq 1 30); do
        if curl -sf http://localhost:9000/minio/health/live &>/dev/null 2>&1; then
            break
        fi
        # Try via Docker network
        if docker compose exec -T minio sh -c 'curl -sf http://localhost:9000/minio/health/live' &>/dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    docker compose run --rm minio-init 2>&1 || warn "MinIO bucket init failed (may already exist)"
fi

# =============================================================================
# Step 9: Rolling restart — non-critical services first
# =============================================================================
log "Rolling restart — monitoring stack..."
docker compose up -d --no-deps prometheus grafana node-exporter postgres-exporter
sleep 5

log "Rolling restart — infrastructure..."
docker compose up -d --no-deps pgbouncer redis
sleep 5

log "Rolling restart — proxy..."
docker compose up -d --no-deps nginx element synapse-admin admin-api sygnal
sleep 5

log "Restarting media purger..."
docker compose up -d --no-deps media-purger
sleep 3

# =============================================================================
# Step 10: Restart Synapse (the main server — last to avoid downtime)
# =============================================================================
log "Restarting Synapse (main messaging server)..."

# Graceful restart: docker compose sends SIGTERM which lets Synapse drain connections
docker compose up -d --no-deps synapse

log "Waiting for Synapse to become healthy..."
HEALTHY=false
for i in $(seq 1 60); do
    if docker compose exec -T synapse python3 -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8008/health')" \
        2>/dev/null; then
        HEALTHY=true
        break
    fi
    echo -n "."
    sleep 3
done
echo ""

if [ "$HEALTHY" = "false" ]; then
    warn "Synapse health check timed out. Check logs:"
    warn "  cd $SERVER_DIR && docker compose logs synapse --tail=50"
else
    log "Synapse is healthy."
fi

# Final nginx reload to serve new static files
docker compose exec -T nginx nginx -s reload 2>/dev/null || \
    docker compose restart nginx 2>/dev/null || true

# =============================================================================
# Step 11: Verify all services
# =============================================================================
log "Verifying all services..."
echo ""

check_service() {
    local name="$1"
    local status
    status=$(docker compose ps "$name" 2>/dev/null | grep -E "running|Up" | wc -l)
    if [ "$status" -gt 0 ]; then
        echo -e "  ${GREEN}✓${NC} $name"
    else
        echo -e "  ${RED}✗${NC} $name — not running"
    fi
}

check_service postgres
check_service pgbouncer
check_service redis
check_service minio
check_service synapse
check_service sygnal
check_service nginx
check_service grafana
check_service prometheus

echo ""

# Check Matrix API
if curl -sk --max-time 5 "https://${SERVER_HOST:-localhost}/_matrix/client/versions" &>/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Matrix API responding"
else
    echo -e "  ${YELLOW}?${NC} Matrix API not reachable from this host (may still work externally)"
fi

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   NexaLink Update Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

NIP_DOMAIN=$(echo "${SERVER_HOST:-localhost}" | tr '.' '-').nip.io
echo -e "  Web client:     ${CYAN}https://${NIP_DOMAIN}${NC}"
echo -e "  Admin panel:    ${CYAN}https://${NIP_DOMAIN}/admin${NC}"
echo -e "  Config panel:   ${CYAN}https://${NIP_DOMAIN}/config${NC}"
echo -e "  Grafana:        ${CYAN}https://${NIP_DOMAIN}/grafana/${NC}"
echo -e "  MinIO console:  ${CYAN}https://${NIP_DOMAIN}/minio-console/${NC}"
echo ""
echo -e "  Logs: ${CYAN}cd $SERVER_DIR && docker compose logs -f${NC}"
echo ""
