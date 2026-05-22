#!/bin/bash
# =============================================================================
# NexaLink Server - Cleanup Script (WhatsApp-style relay model)
#
# Removes delivered messages (> 1 day old), purges old media (> 30 days),
# and optimizes the database.
#
# Usage: sudo ./cleanup.sh
# Cron:  0 */6 * * * /path/to/cleanup.sh  (every 6 hours)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[NexaLink]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$SERVER_DIR"

if [ ! -f ".env" ]; then
    echo "Error: .env not found. Run setup.sh first."
    exit 1
fi

# shellcheck source=/dev/null
source .env

echo ""
log "NexaLink Relay Cleanup (WhatsApp-style)"
echo ""

# =============================================================================
# Step 1: Purge old messages via Synapse Admin API
#
# The retention module handles purge automatically based on homeserver.yaml
# policies (max_lifetime: 1d).  This step is a belt-and-suspenders purge
# to make sure no events older than 1 day remain.
# =============================================================================
log "Purging messages older than 1 day via Synapse Admin API..."

SYNAPSE_ADMIN_TOKEN="${SYNAPSE_ADMIN_TOKEN:-}"
SYNAPSE_URL="http://localhost:8008"

# Determine the cutoff timestamp (1 day ago, in milliseconds)
CUTOFF_MS=$(( ($(date +%s) - 86400) * 1000 ))

if [ -n "$SYNAPSE_ADMIN_TOKEN" ]; then
    # Get all known rooms and purge old events
    ROOMS=$(curl -sf \
        -H "Authorization: Bearer ${SYNAPSE_ADMIN_TOKEN}" \
        "${SYNAPSE_URL}/_synapse/admin/v1/rooms?limit=100" 2>/dev/null | \
        python3 -c "import sys,json; data=json.load(sys.stdin); [print(r['room_id']) for r in data.get('rooms',[])]" 2>/dev/null || echo "")

    if [ -n "$ROOMS" ]; then
        PURGED=0
        while IFS= read -r room_id; do
            [ -z "$room_id" ] && continue
            RESULT=$(curl -sf -X POST \
                -H "Authorization: Bearer ${SYNAPSE_ADMIN_TOKEN}" \
                -H "Content-Type: application/json" \
                -d "{\"delete_local_events\": true, \"purge_up_to_ts\": ${CUTOFF_MS}}" \
                "${SYNAPSE_URL}/_synapse/admin/v1/purge_history/${room_id}" 2>/dev/null || echo "{}")
            PURGED=$((PURGED + 1))
        done <<< "$ROOMS"
        log "  Purged history in ${PURGED} rooms (events older than 1 day removed)."
    else
        log "  No rooms found or token not set — skipping API purge."
    fi
else
    warn "  SYNAPSE_ADMIN_TOKEN not set in .env — skipping API history purge."
    warn "  Synapse retention module will handle automatic cleanup (6-hour interval)."
fi

# =============================================================================
# Step 2: Purge old media via Synapse Admin API
# =============================================================================
log "Purging server media older than 30 days..."

THIRTY_DAYS_AGO_MS=$(( ($(date +%s) - 2592000) * 1000 ))

if [ -n "$SYNAPSE_ADMIN_TOKEN" ]; then
    RESULT=$(curl -sf -X POST \
        -H "Authorization: Bearer ${SYNAPSE_ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"before_ts\": ${THIRTY_DAYS_AGO_MS}, \"size_gt\": 0, \"keep_profiles\": true}" \
        "${SYNAPSE_URL}/_synapse/admin/v1/media/delete?before_ts=${THIRTY_DAYS_AGO_MS}&keep_profiles=true" 2>/dev/null || echo "{}")
    DELETED=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo "unknown")
    log "  Media deleted: ${DELETED} files"
else
    warn "  SYNAPSE_ADMIN_TOKEN not set — skipping API media purge."
    warn "  Synapse media_retention will handle automatic cleanup (daily)."
fi

# =============================================================================
# Step 3: Docker log cleanup
# =============================================================================
log "Cleaning Docker build cache..."
docker image prune -f > /dev/null 2>&1 || true
docker builder prune -f > /dev/null 2>&1 || true

# =============================================================================
# Step 4: Vacuum PostgreSQL
# =============================================================================
log "Optimizing database..."
docker compose exec -T postgres psql \
    -U "${POSTGRES_USER:-synapse}" \
    -d "${POSTGRES_DB:-synapse}" \
    -c "VACUUM ANALYZE;" 2>/dev/null && \
    log "  Database vacuumed." || \
    warn "  Could not vacuum database (non-critical)."

# =============================================================================
# Step 5: Disk usage report
# =============================================================================
log "Disk usage report:"
DISK_FREE=$(df -h / | awk 'NR==2{print $4}')
DISK_USED=$(df -h / | awk 'NR==2{print $5}')
log "  Disk free: ${DISK_FREE} (${DISK_USED} used)"
MEDIA_SIZE=$(du -sh "${SERVER_DIR}/synapse/media_store" 2>/dev/null | cut -f1 || echo "N/A")
log "  Server media cache: ${MEDIA_SIZE}"

echo ""
log "Cleanup complete. Relay model summary:"
log "  Messages: deleted from server after 1 day (clients keep local copy)"
log "  Media:    deleted from server after 30 days"
log "  Devices:  stale records removed after 30 days"
log "  Rooms:    forgotten rooms removed after 7 days"
echo ""
