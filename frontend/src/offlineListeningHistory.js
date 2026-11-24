import { apiRequest } from "./api/client.js";
import { notifyListeningHistoryChanged } from "./homeRecentlyPlayed.js";

const PREFIX = "hypersynced.offline-listening-events.v1:";
const MAX_PENDING_EVENTS = 500;
let activeOwner = null;
const flushByOwner = new Map();

function ownerKey(owner) {
  const value = String(owner ?? "").trim();
  return value || null;
}
function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function key(owner) {
  const normalized = ownerKey(owner);
  return normalized ? PREFIX + encodeURIComponent(normalized) : null;
}
export function createListeningEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
export function readOfflineListeningEvents(owner) {
  const cacheKey = key(owner);
  if (!cacheKey) return [];
  try {
    const parsed = JSON.parse(storage()?.getItem(cacheKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((event) =>
        event &&
        typeof event.eventId === "string" &&
        typeof event.trackId === "string" &&
        typeof event.listenedAt === "string"
      )
      .slice(-MAX_PENDING_EVENTS);
  } catch { return []; }
}
export function enqueueOfflineListeningEvent(owner, event) {
  const cacheKey = key(owner);
  if (!cacheKey || !event?.eventId || !event?.trackId || !event?.listenedAt) return false;
  const current = readOfflineListeningEvents(owner);
  if (current.some((item) => item.eventId === event.eventId)) return true;
  current.push({
    eventId: String(event.eventId),
    trackId: String(event.trackId),
    listenedAt: String(event.listenedAt),
    queuedAt: Date.now(),
  });
  const bounded = current.slice(-MAX_PENDING_EVENTS);
  try {
    const target = storage();
    if (!target) return false;
    target.setItem(cacheKey, JSON.stringify(bounded));
    return true;
  } catch { return false; }
}
function removeQueuedEvent(owner, eventId) {
  const cacheKey = key(owner);
  if (!cacheKey) return;
  const remaining = readOfflineListeningEvents(owner).filter((event) => event.eventId !== eventId);
  try {
    const target = storage();
    if (!target) return;
    if (remaining.length) target.setItem(cacheKey, JSON.stringify(remaining));
    else target.removeItem(cacheKey);
  } catch {}
}
export async function flushOfflineListeningEvents(owner, request = apiRequest) {
  const normalized = ownerKey(owner);
  if (!normalized || globalThis.navigator?.onLine === false) return 0;
  if (flushByOwner.has(normalized)) return flushByOwner.get(normalized);
  const task = (async () => {
    let uploaded = 0;
    for (const event of readOfflineListeningEvents(normalized)) {
      if (globalThis.navigator?.onLine === false) break;
      try {
        await request("/users/me/listening", {
          method: "POST",
          body: JSON.stringify({
            track_id: event.trackId,
            event_id: event.eventId,
            listened_at: event.listenedAt,
          }),
        });
        removeQueuedEvent(normalized, event.eventId);
        uploaded += 1;
      } catch {
        // Keep the failed event and later events for a future retry.
        break;
      }
    }
    if (uploaded) {
      notifyListeningHistoryChanged({
        type: "offline-history-synced",
        owner: normalized,
      });
    }
    return uploaded;
  })().finally(() => flushByOwner.delete(normalized));
  flushByOwner.set(normalized, task);
  return task;
}
export function setOfflineListeningOwner(owner) {
  activeOwner = ownerKey(owner);
  if (activeOwner && globalThis.navigator?.onLine !== false) {
    void flushOfflineListeningEvents(activeOwner);
  }
}
if (typeof globalThis.window?.addEventListener === "function") {
  globalThis.window.addEventListener("online", () => {
    if (activeOwner) void flushOfflineListeningEvents(activeOwner);
  });
}
