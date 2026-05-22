/**
 * NexaLink Secure Session — encrypted token storage (WhatsApp model)
 *
 * Problem: storing the Matrix access token in plain localStorage exposes it
 * to XSS attacks — any injected script can read `localStorage.getItem(...)`.
 *
 * Solution: encrypt the session data with a device-bound AES-256-GCM key
 * derived from the user's password + userId using PBKDF2 (100 000 iterations).
 * Only the encrypted ciphertext is written to localStorage.
 * The raw key lives in memory (a module-level variable) for the lifetime of the tab.
 *
 * WhatsApp model:
 *   - Access token: encrypted at rest, plaintext only in memory
 *   - Session locked to this device (PBKDF2 salt is device-specific)
 *   - Tab close clears the in-memory key → future loads require re-derivation
 *     (user can re-authenticate to re-derive the same key)
 *
 * Storage layout (localStorage):
 *   nexalink-session-salt   → hex-encoded random 32-byte PBKDF2 salt
 *   nexalink-session-enc    → base64(iv + ciphertext) of JSON session
 */

import type { NexaLinkSession } from "./meshClient";

const SALT_KEY = "nexalink-session-salt";
const ENC_KEY = "nexalink-session-enc";
const LEGACY_PLAIN_KEY = "nexalink-session"; // migrated away from plain storage

// Module-level in-memory key — never persisted
let _memKey: CryptoKey | null = null;

// ============================================================================
// Helpers
// ============================================================================

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

// ============================================================================
// Key derivation
// ============================================================================

/**
 * Derive an AES-256-GCM key from password + userId using PBKDF2.
 * The derived key is held in memory only — never serialised.
 */
async function deriveKey(password: string, userId: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password + "|" + userId),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Get or create the PBKDF2 salt for this device/browser.
 * The salt is NOT secret — it just makes the derived key device-specific.
 */
function getOrCreateSalt(): Uint8Array {
  const stored = localStorage.getItem(SALT_KEY);
  if (stored) return hexToBytes(stored);
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  localStorage.setItem(SALT_KEY, bytesToHex(salt));
  return salt;
}

// ============================================================================
// Encrypt / decrypt
// ============================================================================

async function encryptSession(session: NexaLinkSession, key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  // Store iv (12 bytes) + ciphertext together
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return arrayBufferToBase64(combined.buffer);
}

async function decryptSession(encoded: string, key: CryptoKey): Promise<NexaLinkSession | null> {
  try {
    const combined = new Uint8Array(base64ToArrayBuffer(encoded));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as NexaLinkSession;
  } catch {
    return null;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Save session — encrypts with the in-memory key derived from password + userId.
 * Call this after the user logs in or registers (password is available).
 */
export async function saveSecureSession(
  session: NexaLinkSession,
  password: string,
): Promise<void> {
  const salt = getOrCreateSalt();
  const key = await deriveKey(password, session.userId, salt);
  _memKey = key;
  const encoded = await encryptSession(session, key);
  localStorage.setItem(ENC_KEY, encoded);
  // Remove legacy plain-text session if it exists
  localStorage.removeItem(LEGACY_PLAIN_KEY);
}

/**
 * Load session — decrypts with the in-memory key if available,
 * or falls back to the legacy plain-text session (migration path).
 *
 * If the key is not in memory (tab was closed and reopened), returns null
 * and the app should prompt for password to re-derive the key.
 */
export async function loadSecureSession(): Promise<NexaLinkSession | null> {
  // 1. Try encrypted session with in-memory key
  if (_memKey) {
    const encoded = localStorage.getItem(ENC_KEY);
    if (encoded) {
      return decryptSession(encoded, _memKey);
    }
  }

  // 2. Legacy migration: read plain-text session and re-encrypt it
  const legacy = localStorage.getItem(LEGACY_PLAIN_KEY);
  if (legacy) {
    try {
      const session = JSON.parse(legacy) as NexaLinkSession;
      // Keep plain-text session until user provides password (can't derive key here)
      // The App.tsx will call saveSecureSession() with the password on next login
      return session;
    } catch {
      /* corrupt, ignore */
    }
  }

  // 3. No session found
  return null;
}

/**
 * Re-derive the in-memory key after a tab reload (user provides password again).
 * Call this when the user re-enters their password on the lock screen.
 */
export async function unlockSession(
  password: string,
  userId: string,
): Promise<NexaLinkSession | null> {
  const salt = getOrCreateSalt();
  const key = await deriveKey(password, userId, salt);
  const encoded = localStorage.getItem(ENC_KEY);
  if (!encoded) return null;
  const session = await decryptSession(encoded, key);
  if (session) _memKey = key;
  return session;
}

/**
 * Clear all session data from storage and memory.
 */
export function clearSecureSession(): void {
  _memKey = null;
  localStorage.removeItem(ENC_KEY);
  localStorage.removeItem(SALT_KEY);
  localStorage.removeItem(LEGACY_PLAIN_KEY);
}

/**
 * Check whether an encrypted session exists on this device.
 */
export function hasStoredSession(): boolean {
  return (
    localStorage.getItem(ENC_KEY) !== null ||
    localStorage.getItem(LEGACY_PLAIN_KEY) !== null
  );
}
