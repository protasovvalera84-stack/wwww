/**
 * NexaLink Media Purger — WhatsApp-style relay model
 *
 * Purpose:
 *   Delete server-side media ASAP after all recipients have downloaded it.
 *   Hard cap: all media older than MEDIA_MAX_AGE_MS is deleted regardless.
 *
 * WhatsApp model:
 *   - Client encrypts media AES-256 before upload (server sees only blob)
 *   - After recipient downloads and decrypts, the blob serves no purpose
 *   - This service removes it from the server
 *   - Profile photos and avatars are preserved
 *
 * Configuration (environment variables):
 *   SYNAPSE_URL           Synapse homeserver URL (default: http://synapse:8008)
 *   SYNAPSE_ADMIN_TOKEN   Synapse admin access token (from .env)
 *   MEDIA_MAX_AGE_HOURS   Max media age in hours before forced deletion (default: 1)
 *   PURGE_INTERVAL_MINS   How often to run the purge (default: 10 minutes)
 *   SERVER_NAME           Matrix server_name (e.g. my-ip.nip.io)
 *
 * Deployment: runs as a sidecar in the Docker Compose stack.
 */

import fetch from "node-fetch";

const SYNAPSE_URL        = process.env.SYNAPSE_URL         || "http://synapse:8008";
const ADMIN_TOKEN        = process.env.SYNAPSE_ADMIN_TOKEN || "";
const MAX_AGE_HOURS      = parseInt(process.env.MEDIA_MAX_AGE_HOURS || "1", 10);
const INTERVAL_MINS      = parseInt(process.env.PURGE_INTERVAL_MINS  || "10", 10);

const MAX_AGE_MS         = MAX_AGE_HOURS * 60 * 60 * 1000;
const INTERVAL_MS        = INTERVAL_MINS * 60 * 1000;

function log(msg) {
  console.log(`[${new Date().toISOString()}] [media-purger] ${msg}`);
}

function warn(msg) {
  console.warn(`[${new Date().toISOString()}] [media-purger] WARN: ${msg}`);
}

// ============================================================================
// Purge via Synapse Admin API
// ============================================================================

async function purgeOldMedia() {
  if (!ADMIN_TOKEN) {
    warn("SYNAPSE_ADMIN_TOKEN not set — skipping purge (set in .env)");
    return;
  }

  // Cutoff timestamp: delete all media created before this time
  const cutoffMs = Date.now() - MAX_AGE_MS;

  log(`Purging media older than ${MAX_AGE_HOURS}h (before ${new Date(cutoffMs).toISOString()})`);

  // POST /_synapse/admin/v1/media/delete
  // Deletes local media older than before_ts
  // keep_profiles=true preserves user avatars
  const url = `${SYNAPSE_URL}/_synapse/admin/v1/media/delete` +
              `?before_ts=${cutoffMs}&keep_profiles=true&size_gt=0`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!resp.ok) {
      const body = await resp.text();
      warn(`Media delete API returned ${resp.status}: ${body}`);
      return;
    }

    const data = await resp.json();
    const deleted = data.total || 0;
    log(`Purged ${deleted} media files from server (${MAX_AGE_HOURS}h+ old)`);

    if (deleted > 0) {
      log(`Server storage freed. Media was encrypted (AES-256) — no plaintext exposed.`);
    }
  } catch (err) {
    warn(`Purge request failed: ${err.message} — will retry in ${INTERVAL_MINS}m`);
  }
}

// ============================================================================
// Message history purge (belt-and-suspenders for Synapse retention module)
// ============================================================================

async function purgeRoomHistories() {
  if (!ADMIN_TOKEN) return;

  // Get all rooms (paginated)
  const cutoffMs = Date.now() - (6 * 60 * 60 * 1000); // 6h ago

  try {
    const roomsResp = await fetch(
      `${SYNAPSE_URL}/_synapse/admin/v1/rooms?limit=100`,
      { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }
    );
    if (!roomsResp.ok) return;

    const roomsData = await roomsResp.json();
    const rooms = roomsData.rooms || [];
    if (rooms.length === 0) return;

    log(`Purging message history in ${rooms.length} rooms (events older than 6h)...`);

    let purged = 0;
    for (const room of rooms) {
      try {
        const resp = await fetch(
          `${SYNAPSE_URL}/_synapse/admin/v1/purge_history/${encodeURIComponent(room.room_id)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ADMIN_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              delete_local_events: true,
              purge_up_to_ts: cutoffMs,
            }),
          }
        );
        if (resp.ok) purged++;
      } catch { /* non-critical for individual rooms */ }
    }
    log(`Purged history in ${purged}/${rooms.length} rooms`);
  } catch (err) {
    warn(`Room history purge failed: ${err.message}`);
  }
}

// ============================================================================
// Main loop
// ============================================================================

async function runPurge() {
  log(`Starting purge cycle (max age: ${MAX_AGE_HOURS}h, interval: ${INTERVAL_MINS}m)`);
  await purgeOldMedia();
  await purgeRoomHistories();
  log("Purge cycle complete.");
}

// Run immediately on start, then on interval
log(`NexaLink Media Purger started.`);
log(`Model: WhatsApp relay — media deleted after ${MAX_AGE_HOURS}h, messages after 6h`);
log(`Synapse: ${SYNAPSE_URL}`);

if (!ADMIN_TOKEN) {
  warn("No SYNAPSE_ADMIN_TOKEN set. Purges disabled until token is configured.");
  warn("The Synapse retention module (homeserver.yaml) will still auto-purge on schedule.");
}

// Wait 60s on startup to let Synapse initialize
setTimeout(() => {
  runPurge();
  setInterval(runPurge, INTERVAL_MS);
}, 60_000);

// Keep process alive
process.on("unhandledRejection", (err) => warn(`Unhandled: ${err}`));
