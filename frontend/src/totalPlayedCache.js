const TOTAL_PLAYED_CACHE_PREFIX = "hypersynced:total-played-cache:";
const CACHE_TRACK_LIMIT = 1000;
const memoryCache = new Map();
function cacheKey(owner) { return owner ? `${TOTAL_PLAYED_CACHE_PREFIX}${encodeURIComponent(String(owner))}` : null; }
function safeStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
function cleanTrack(track) {
  if (!track?.id) return null;
  return { id: track.id, title: track.title ?? "", artist: track.artist ?? "", album: track.album ?? null, genre: track.genre ?? null,
    release_year: track.release_year ?? null, artwork_url: track.artwork_url ?? null, mime_type: track.mime_type ?? null,
    file_size: track.file_size ?? null, media_version: track.media_version ?? null, artwork_version: track.artwork_version ?? null,
    play_count: Math.max(0, Number(track.play_count) || 0), last_played_at: track.last_played_at ?? null };
}
function dedupeTracks(tracks) {
  const seen = new Set(), result = [];
  for (const item of tracks ?? []) { const track = cleanTrack(item), id = String(track?.id ?? "");
    if (!track || !id || seen.has(id)) continue; seen.add(id); result.push(track); if (result.length >= CACHE_TRACK_LIMIT) break; }
  return result;
}
export function readTotalPlayedCache(owner) {
  const key = cacheKey(owner); if (!key) return { tracks: [], hasMore: false };
  const cached = memoryCache.get(key); if (cached) return cached;
  try { const raw = safeStorage()?.getItem(key); if (!raw) return { tracks: [], hasMore: false };
    const parsed = JSON.parse(raw), value = { tracks: dedupeTracks(parsed?.tracks), hasMore: Boolean(parsed?.hasMore) };
    memoryCache.set(key, value); return value;
  } catch { return { tracks: [], hasMore: false }; }
}
export function writeTotalPlayedCache(owner, tracks, hasMore = false) {
  const key = cacheKey(owner); if (!key) return false;
  const value = { tracks: dedupeTracks(tracks), hasMore: Boolean(hasMore) }; memoryCache.set(key, value);
  try { safeStorage()?.setItem(key, JSON.stringify(value)); } catch { /* memory cache remains available */ }
  return true;
}
export function mergeTotalPlayedTracks(existing, incoming) { return dedupeTracks([...(existing ?? []), ...(incoming ?? [])]); }
