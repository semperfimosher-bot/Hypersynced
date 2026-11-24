import { apiRequest } from "./api/client.js";

const CACHE_KEY = "hypersynced.home-recently-added.v1";
const CACHE_TTL_MS = 30 * 60 * 1000;
const TRACK_LIMIT = 12;

function normalizeTracks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tracks = [];
  for (const track of value) {
    const id = String(track?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tracks.push(track);
    if (tracks.length >= TRACK_LIMIT) break;
  }
  return tracks;
}

export function readCachedHomeRecentlyAdded(now = Date.now()) {
  try {
    const storage = globalThis.localStorage;
    const snapshot = JSON.parse(storage?.getItem(CACHE_KEY) ?? "null");
    if (!snapshot || !Number.isFinite(snapshot.cachedAt) || now - snapshot.cachedAt > CACHE_TTL_MS || snapshot.cachedAt > now + 60_000) {
      storage?.removeItem(CACHE_KEY);
      return [];
    }
    return normalizeTracks(snapshot.tracks);
  } catch {
    return [];
  }
}

export function writeCachedHomeRecentlyAdded(tracks, now = Date.now()) {
  const normalized = normalizeTracks(tracks);
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify({ cachedAt: now, tracks: normalized }));
  } catch {
    // Cache is an optional performance optimization.
  }
  return normalized;
}

export async function refreshHomeRecentlyAdded() {
  const tracks = await apiRequest("/catalog/recently-added", { method: "GET" });
  return writeCachedHomeRecentlyAdded(tracks);
}
