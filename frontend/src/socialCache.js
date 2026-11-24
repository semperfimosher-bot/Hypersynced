const SOCIAL_CACHE_PREFIX = "hypersynced.social-cache.v1:";
const SOCIAL_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SOCIAL_CACHE_MAX_BYTES = 100_000;

function cacheKey(username, mode) {
  const normalizedUsername = String(username ?? "").trim().toLowerCase();
  if (!normalizedUsername || !["followers", "following"].includes(mode)) return null;
  return SOCIAL_CACHE_PREFIX + encodeURIComponent(normalizedUsername + ":" + mode);
}

export function readCachedSocialList(username, mode, now = Date.now()) {
  const key = cacheKey(username, mode);
  if (!key) return null;
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw || raw.length > SOCIAL_CACHE_MAX_BYTES) return null;
    const snapshot = JSON.parse(raw);
    if (!Array.isArray(snapshot?.items) || !Number.isFinite(snapshot?.savedAt)) return null;
    if (now - snapshot.savedAt > SOCIAL_CACHE_TTL_MS) {
      globalThis.localStorage?.removeItem(key);
      return null;
    }
    return snapshot.items;
  } catch {
    return null;
  }
}

export function writeCachedSocialList(username, mode, items, now = Date.now()) {
  const key = cacheKey(username, mode);
  if (!key || !Array.isArray(items)) return false;
  try {
    const serialized = JSON.stringify({ savedAt: now, items });
    if (!globalThis.localStorage || serialized.length > SOCIAL_CACHE_MAX_BYTES) return false;
    globalThis.localStorage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}
