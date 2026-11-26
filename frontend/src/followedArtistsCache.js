const FOLLOWED_ARTISTS_CACHE_PREFIX = "hypersynced:followed-artists-cache:v1:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 300_000;

function ownerKey(owner) {
  const value = String(owner ?? "").trim().toLowerCase();
  return value ? FOLLOWED_ARTISTS_CACHE_PREFIX + encodeURIComponent(value) : null;
}

export function readFollowedArtistsCache(owner, now = Date.now()) {
  const key = ownerKey(owner);
  if (!key) return null;
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw || raw.length > MAX_CACHE_BYTES) return null;
    const snapshot = JSON.parse(raw);
    if (!Array.isArray(snapshot?.items) || !Number.isFinite(snapshot.savedAt)) return null;
    if (snapshot.savedAt > now + 60_000 || now - snapshot.savedAt > CACHE_TTL_MS) {
      globalThis.localStorage?.removeItem(key);
      return null;
    }
    return snapshot.items;
  } catch {
    return null;
  }
}

export function writeFollowedArtistsCache(owner, items, now = Date.now()) {
  const key = ownerKey(owner);
  if (!key || !Array.isArray(items)) return false;
  try {
    const raw = JSON.stringify({ savedAt: now, items });
    if (!globalThis.localStorage || raw.length > MAX_CACHE_BYTES) return false;
    globalThis.localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}
