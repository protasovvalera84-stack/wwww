/**
 * NexaLink Media Encryption — WhatsApp/Signal model
 *
 * All media (images, video, audio, GIFs, files) is encrypted CLIENT-SIDE
 * with AES-256-CTR before being uploaded to the server.
 *
 * The server stores ONLY encrypted binary blobs — it cannot read any media.
 * The encryption key is transmitted inside the Matrix E2EE message payload
 * (protected by Olm/Megolm), so the key never touches the server in plaintext.
 *
 * Follows the Matrix encrypted media spec (m.EncryptedFile, MSC1767):
 *   https://spec.matrix.org/v1.8/client-server-api/#sending-encrypted-attachments
 *
 * Lifecycle (WhatsApp model):
 *   Sender:    plaintext → AES-256-CTR → encrypted blob → server
 *              key + IV + SHA-256 → E2EE message body → recipient
 *   Server:    stores encrypted blob only (cannot decrypt)
 *   Recipient: downloads encrypted blob → decrypts with key from message
 *              saves plaintext to app-private local storage
 *   Server:    deletes blob after 24h (or sooner via media-purger)
 */

/** Matrix encrypted file descriptor (stored in message body, protected by E2EE). */
export interface EncryptedFileInfo {
  /** mxc:// URI pointing to the encrypted blob on the server */
  url: string;
  /** Original MIME type (e.g. "image/jpeg") */
  mimetype: string;
  /** Original file size in bytes (before encryption) */
  size: number;
  /** AES-256-CTR key as JSON Web Key */
  key: {
    kty: "oct";
    key_ops: ["encrypt", "decrypt"];
    alg: "A256CTR";
    /** Base64url-encoded 256-bit key */
    k: string;
    ext: true;
  };
  /** Base64url-encoded 128-bit IV (16 bytes; last 64 bits are the counter init) */
  iv: string;
  /** Integrity hashes of the encrypted blob */
  hashes: {
    sha256: string; // base64-encoded SHA-256
  };
  /** Spec version */
  v: "v2";
}

// ============================================================================
// Encoding helpers
// ============================================================================

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  return arrayBufferToBase64(buf)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64UrlToArrayBuffer(b64: string): ArrayBuffer {
  const b64std = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64std + "=".repeat((4 - (b64std.length % 4)) % 4);
  const binary = atob(padded);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf.buffer;
}

// ============================================================================
// Encryption
// ============================================================================

/**
 * Encrypt a File (or Blob) using AES-256-CTR.
 *
 * Returns the encrypted ArrayBuffer and the key descriptor to embed in the
 * Matrix message (protected by the room's E2EE session).
 */
export async function encryptMedia(
  file: File | Blob,
  mimeType?: string,
): Promise<{ encryptedBuffer: ArrayBuffer; keyInfo: Omit<EncryptedFileInfo, "url"> }> {
  const mime = mimeType ?? (file instanceof File ? file.type : "application/octet-stream");
  const plaintext = await file.arrayBuffer();

  // 1. Generate a random 256-bit key
  const cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-CTR", length: 256 },
    true,  // extractable — we need to export it for the message
    ["encrypt", "decrypt"],
  );

  // 2. Generate a random 128-bit IV
  //    Per Matrix spec: 8 bytes random nonce + 8 bytes zero counter
  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv.subarray(0, 8)); // first 8 bytes random
  iv.fill(0, 8, 16);                          // last 8 bytes = zero counter

  // 3. Encrypt
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-CTR", counter: iv, length: 64 }, // 64-bit counter
    cryptoKey,
    plaintext,
  );

  // 4. Compute SHA-256 of the encrypted blob for integrity verification
  const sha256Buffer = await crypto.subtle.digest("SHA-256", encryptedBuffer);

  // 5. Export key as JWK
  const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);

  const keyInfo: Omit<EncryptedFileInfo, "url"> = {
    mimetype: mime,
    size: file.size ?? plaintext.byteLength,
    key: {
      kty: "oct",
      key_ops: ["encrypt", "decrypt"],
      alg: "A256CTR",
      k: jwk.k!,
      ext: true,
    },
    iv: arrayBufferToBase64Url(iv),
    hashes: {
      sha256: arrayBufferToBase64(sha256Buffer),
    },
    v: "v2",
  };

  return { encryptedBuffer, keyInfo };
}

// ============================================================================
// Decryption
// ============================================================================

/**
 * Decrypt an encrypted media blob downloaded from the server.
 *
 * @param encryptedBuffer  The raw encrypted blob from the server
 * @param fileInfo         The EncryptedFileInfo from the Matrix message
 * @returns Decrypted Blob with the original MIME type
 */
export async function decryptMedia(
  encryptedBuffer: ArrayBuffer,
  fileInfo: EncryptedFileInfo,
): Promise<Blob> {
  // 1. Verify SHA-256 integrity
  const sha256Buffer = await crypto.subtle.digest("SHA-256", encryptedBuffer);
  const computedHash = arrayBufferToBase64(sha256Buffer);
  if (computedHash !== fileInfo.hashes.sha256) {
    throw new Error("Media integrity check failed: SHA-256 mismatch. Possible tampering.");
  }

  // 2. Import the key
  const keyBytes = base64UrlToArrayBuffer(fileInfo.key.k);
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "oct",
      key_ops: ["encrypt", "decrypt"],
      alg: "A256CTR",
      k: fileInfo.key.k,
      ext: true,
    },
    { name: "AES-CTR", length: 256 },
    false, // not extractable after import
    ["decrypt"],
  );

  // 3. Decode IV
  const iv = new Uint8Array(base64UrlToArrayBuffer(fileInfo.iv));

  // Prevent unused variable warning
  void keyBytes;

  // 4. Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CTR", counter: iv, length: 64 },
    cryptoKey,
    encryptedBuffer,
  );

  return new Blob([plaintext], { type: fileInfo.mimetype });
}

// ============================================================================
// Upload + Download helpers (integrate with server)
// ============================================================================

/**
 * Encrypt and upload a media file.
 *
 * The encrypted blob is uploaded to /_matrix/media/v3/upload.
 * Returns the EncryptedFileInfo to embed in the Matrix message body.
 *
 * Usage:
 *   const enc = await uploadEncryptedMedia(accessToken, file);
 *   // Send enc as `file` field in Matrix m.image / m.video / m.audio message
 */
export async function uploadEncryptedMedia(
  serverUrl: string,
  accessToken: string,
  file: File,
): Promise<EncryptedFileInfo> {
  // 1. Encrypt client-side
  const { encryptedBuffer, keyInfo } = await encryptMedia(file);

  // 2. Upload ONLY the encrypted blob (server never sees plaintext)
  //    Use generic MIME type — prevents server from inferring content type
  const resp = await fetch(
    `${serverUrl}/_matrix/media/v3/upload?filename=${encodeURIComponent(file.name + ".enc")}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream", // always opaque
        Authorization: `Bearer ${accessToken}`,
      },
      body: encryptedBuffer,
    },
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Upload failed: ${resp.status}`);
  }

  const data = await resp.json() as { content_uri: string };

  return {
    url: data.content_uri,
    ...keyInfo,
  };
}

/**
 * Download and decrypt a media blob.
 *
 * @param serverUrl   Homeserver base URL
 * @param accessToken User access token (required — media is auth-gated)
 * @param fileInfo    EncryptedFileInfo from the Matrix message
 * @returns Object URL pointing to the decrypted in-memory Blob
 */
export async function downloadDecryptedMedia(
  serverUrl: string,
  accessToken: string,
  fileInfo: EncryptedFileInfo,
): Promise<string> {
  // 1. Build authenticated download URL from mxc:// URI
  const mxcParts = fileInfo.url.replace("mxc://", "").split("/");
  if (mxcParts.length < 2) throw new Error("Invalid mxc:// URI");
  const [serverName, mediaId] = [mxcParts[0], mxcParts.slice(1).join("/")];
  const downloadUrl = `${serverUrl}/_matrix/media/v3/download/${serverName}/${mediaId}`;

  // 2. Fetch encrypted blob (with auth header — media requires authentication)
  const resp = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Media download failed: ${resp.status}`);
  }

  const encryptedBuffer = await resp.arrayBuffer();

  // 3. Decrypt
  const plainBlob = await decryptMedia(encryptedBuffer, fileInfo);

  // 4. Return a temporary object URL (freed when tab closes)
  return URL.createObjectURL(plainBlob);
}

/**
 * Check if a Matrix message content contains encrypted media.
 */
export function isEncryptedMedia(content: Record<string, unknown>): boolean {
  return (
    typeof content.file === "object" &&
    content.file !== null &&
    "v" in (content.file as Record<string, unknown>) &&
    (content.file as Record<string, unknown>).v === "v2"
  );
}
