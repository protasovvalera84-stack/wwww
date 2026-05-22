import { Chat, Message, MediaAttachment } from "@/data/mockData";

const DB_NAME = "nexalink-storage";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("chats")) {
        db.createObjectStore("chats", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("media")) {
        const mediaStore = db.createObjectStore("media", { keyPath: "id" });
        mediaStore.createIndex("chatId", "chatId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Save all chats (without blob URLs -- those are transient). */
export async function saveChats(chats: Chat[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("chats", "readwrite");
  const store = tx.objectStore("chats");

  // Clear old data and write fresh
  store.clear();
  for (const chat of chats) {
    // Strip blob URLs from media before persisting -- we store blobs separately
    const cleaned: Chat = {
      ...chat,
      messages: chat.messages.map((m) => ({
        ...m,
        media: m.media?.map((a) => ({ ...a, url: "" })),
      })),
    };
    store.put(cleaned);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load all chats from IndexedDB. Returns empty array if nothing stored. */
export async function loadChats(): Promise<Chat[]> {
  try {
    const db = await openDB();
    const tx = db.transaction("chats", "readonly");
    const store = tx.objectStore("chats");
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        resolve(request.result || []);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    return [];
  }
}

interface StoredMedia {
  id: string;
  chatId: string;
  messageId: string;
  name: string;
  type: MediaAttachment["type"];
  mimeType: string;
  size: number;
  blob: Blob;
}

/** Save a media file blob to IndexedDB. */
export async function saveMediaBlob(
  chatId: string,
  messageId: string,
  attachment: MediaAttachment,
  blob: Blob,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("media", "readwrite");
  const store = tx.objectStore("media");

  const record: StoredMedia = {
    id: attachment.id,
    chatId,
    messageId,
    name: attachment.name,
    type: attachment.type,
    mimeType: attachment.mimeType,
    size: attachment.size,
    blob,
  };

  store.put(record);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load all media blobs for a chat and return a map of mediaId -> blobURL. */
export async function loadMediaForChat(chatId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const db = await openDB();
    const tx = db.transaction("media", "readonly");
    const store = tx.objectStore("media");
    const index = store.index("chatId");
    const request = index.getAll(chatId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        for (const record of request.result as StoredMedia[]) {
          const url = URL.createObjectURL(record.blob);
          map.set(record.id, url);
        }
        resolve(map);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    return map;
  }
}

/** Get the platform-appropriate download/save directory hint. */
/**
 * Get the platform-appropriate PRIVATE storage path hint.
 *
 * WhatsApp model: media stored in app-private directories, NOT in public
 * Downloads / Documents folders. Other apps cannot access private storage.
 * In the browser context all media lives in IndexedDB (sandboxed per-origin).
 */
export function getStorageInfo(): { platform: string; savePath: string; isPrivate: boolean } {
  const ua = navigator.userAgent.toLowerCase();
  const isNativeApp = !!(window as Record<string, unknown>).nexalink;

  if (ua.includes("android")) {
    return {
      platform: "Android",
      savePath: isNativeApp
        ? "app-private: /data/data/io.nexalink.app/files/media/"
        : "IndexedDB (sandboxed)",
      isPrivate: true,
    };
  }
  if (ua.includes("win")) {
    return {
      platform: "Windows",
      savePath: isNativeApp ? `%LOCALAPPDATA%\\NexaLink\\media\\` : "IndexedDB (sandboxed)",
      isPrivate: true,
    };
  }
  if (ua.includes("linux")) {
    return {
      platform: "Linux",
      savePath: isNativeApp ? "~/.local/share/nexalink/media/" : "IndexedDB (sandboxed)",
      isPrivate: true,
    };
  }
  if (ua.includes("mac")) {
    return {
      platform: "macOS",
      savePath: isNativeApp
        ? "~/Library/Application Support/NexaLink/media/"
        : "IndexedDB (sandboxed)",
      isPrivate: true,
    };
  }
  return { platform: "Browser", savePath: "IndexedDB (sandboxed)", isPrivate: true };
}

/** Trigger a browser download of a media attachment. */
export function downloadToDevice(attachment: MediaAttachment): void {
  const a = document.createElement("a");
  a.href = attachment.url;
  a.download = attachment.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Convert a File to a MediaAttachment with blob URL. */
export function fileToAttachment(file: File): MediaAttachment {
  let type: MediaAttachment["type"] = "image";
  if (file.type.startsWith("video/")) type = "video";
  else if (file.type.startsWith("audio/")) type = "audio";

  return {
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    name: file.name,
    url: URL.createObjectURL(file),
    size: file.size,
    mimeType: file.type,
  };
}
