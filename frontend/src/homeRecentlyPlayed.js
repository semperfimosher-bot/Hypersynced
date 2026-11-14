export function getHomeRecentlyPlayed(profile, limit = 12) {
  const tracks = Array.isArray(profile?.recently_played) ? profile.recently_played : [];
  return tracks.slice(0, limit);
}

export const LISTENING_HISTORY_CHANGED_EVENT = "hypersynced:listening-history-changed";

export function notifyListeningHistoryChanged(target = globalThis.window) {
  if (!target?.dispatchEvent) return false;
  target.dispatchEvent(new Event(LISTENING_HISTORY_CHANGED_EVENT));
  return true;
}

export function subscribeListeningHistoryChanged(listener, target = globalThis.window) {
  if (!target?.addEventListener || !target?.removeEventListener) return () => {};
  target.addEventListener(LISTENING_HISTORY_CHANGED_EVENT, listener);
  return () => target.removeEventListener(LISTENING_HISTORY_CHANGED_EVENT, listener);
}

export function canRecordListeningHistory(accessToken, storedSession) {
  return Boolean(accessToken || storedSession);
}

export function isCurrentHistoryResponse(request, latestRequest, owner, currentOwner) {
  return request === latestRequest && owner === currentOwner;
}

// Recently played is fetched from Neon. This bounded Map only combines updates
// during the current page runtime; it is not a persistent browser cache.
const recentByOwner = new Map();

function normalizeOwner(owner) {
  const value = String(owner ?? "").trim();
  return value || null;
}

export function getHomeRecentlyPlayedForOwner(owner, stateOwner, tracks) {
  const key = normalizeOwner(owner);
  if (!key) return [];
  if (String(key) === String(stateOwner)) return Array.isArray(tracks) ? tracks : [];
  return readCachedHomeRecentlyPlayed(key);
}

export function readCachedHomeRecentlyPlayed(owner, limit = 12) {
  const key = normalizeOwner(owner);
  if (!key) return [];
  return [...(recentByOwner.get(key) ?? [])].slice(0, Math.max(0, limit));
}

export function writeCachedHomeRecentlyPlayed(owner, tracks, limit = 12) {
  const key = normalizeOwner(owner);
  if (!key || !Array.isArray(tracks)) return false;
  const seen = new Set();
  const normalized = [];
  for (const track of tracks) {
    if (!track || track.id === null || track.id === undefined) continue;
    const id = String(track.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const cachedTrack = { ...track };
    delete cachedTrack.audio_url;
    delete cachedTrack.src;
    normalized.push(cachedTrack);
    if (normalized.length >= Math.max(0, limit)) break;
  }
  recentByOwner.set(key, normalized);
  return true;
}
