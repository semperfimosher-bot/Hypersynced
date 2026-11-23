const HOME_SUGGESTIONS_CACHE_PREFIX = "hypersynced:home-suggestions:";
const HOME_SUGGESTIONS_LIMIT = 12;
const memoryCache = new Map();
function cacheKey(owner) { return owner ? `${HOME_SUGGESTIONS_CACHE_PREFIX}${encodeURIComponent(String(owner))}` : null; }
function safeStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
function cleanTrack(track) {
  if (!track?.id) return null;
  return { id: track.id, title: track.title ?? "", artist: track.artist ?? "", album: track.album ?? null, genre: track.genre ?? null,
    release_year: track.release_year ?? null, artwork_url: track.artwork_url ?? null, mime_type: track.mime_type ?? null,
    file_size: track.file_size ?? null, media_version: track.media_version ?? null, artwork_version: track.artwork_version ?? null };
}
function dedupeTracks(tracks) {
  const seen = new Set(), result = [];
  for (const track of tracks ?? []) { const clean = cleanTrack(track), id = String(clean?.id ?? "");
    if (!clean || !id || seen.has(id)) continue; seen.add(id); result.push(clean); if (result.length >= HOME_SUGGESTIONS_LIMIT) break; }
  return result;
}
export function readCachedHomeSuggestions(owner) {
  const key = cacheKey(owner); if (!key) return [];
  if (memoryCache.has(key)) return memoryCache.get(key);
  try { const parsed = JSON.parse(safeStorage()?.getItem(key) ?? "null"), tracks = dedupeTracks(parsed?.tracks);
    memoryCache.set(key, tracks); return tracks;
  } catch { return []; }
}
export function writeCachedHomeSuggestions(owner, tracks) {
  const key = cacheKey(owner); if (!key) return false;
  const cleaned = dedupeTracks(tracks); memoryCache.set(key, cleaned);
  try { safeStorage()?.setItem(key, JSON.stringify({ tracks: cleaned })); } catch { /* in-session cache still works */ }
  return true;
}
