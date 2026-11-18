export function getHomeRecentlyPlayed(profileOrTracks, limit = 12) {
  // The focused Home endpoint returns the track array directly; the profile
  // dashboard still returns the legacy { recently_played } envelope.
  const tracks = Array.isArray(profileOrTracks)
    ? profileOrTracks
    : Array.isArray(profileOrTracks?.recently_played)
      ? profileOrTracks.recently_played
      : [];
  return tracks.slice(0, limit);
}

export const LISTENING_HISTORY_CHANGED_EVENT = "hypersynced:listening-history-changed";

export function notifyListeningHistoryChanged(detail = null, target = globalThis.window) {
  // Preserve the original target-first call signature used by existing tests
  // and any internal callers.
  if (detail?.dispatchEvent && arguments.length === 1) {
    target = detail;
    detail = null;
  }
  if (!target?.dispatchEvent) return false;
  const event = typeof CustomEvent === "function"
    ? new CustomEvent(LISTENING_HISTORY_CHANGED_EVENT, { detail })
    : Object.assign(new Event(LISTENING_HISTORY_CHANGED_EVENT), { detail });
  target.dispatchEvent(event);
  return true;
}

// A listening event belongs to a distinct track start, not a pause/resume
// or a buffering recovery for the same track.
export function shouldBeginListeningEvent(activeTrackId, nextTrackId) {
  if (nextTrackId === null || nextTrackId === undefined || nextTrackId === "") return false;
  return String(activeTrackId ?? "") !== String(nextTrackId);
}

export function applyOptimisticRecentlyPlayed(tracks, playedTrack, limit = 12) {
  if (!Array.isArray(tracks) || !playedTrack?.id) return tracks ?? [];
  const id = String(playedTrack.id);
  const existing = tracks.find((track) => String(track?.id) === id);
  const nextTrack = {
    ...existing,
    id,
    title: playedTrack.title ?? existing?.title ?? "",
    artist: playedTrack.artist ?? existing?.artist ?? "",
    album: playedTrack.album ?? existing?.album ?? null,
    audio_url: playedTrack.audioUrl ?? existing?.audio_url ?? null,
    artwork_url: playedTrack.artworkUrl ?? existing?.artwork_url ?? null,
    mime_type: playedTrack.mimeType ?? existing?.mime_type ?? null,
    file_size: playedTrack.fileSize ?? existing?.file_size ?? null,
    media_version: playedTrack.mediaVersion ?? existing?.media_version ?? null,
    play_count: Math.max(0, Number(existing?.play_count) || 0) + 1,
    last_played_at: new Date().toISOString(),
  };
  return [
    nextTrack,
    ...tracks.filter((track) => String(track?.id) !== id),
  ].slice(0, Math.max(0, limit));
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

// Recently played remains Neon-authoritative. A small owner-scoped snapshot
// makes the last known list available on the next visit while the API refreshes.
const RECENT_CACHE_PREFIX = "hypersynced.recently-played.v1:";
const recentByOwner = new Map();

function normalizeOwner(owner) {
  const value = String(owner ?? "").trim();
  return value || null;
}

function storageForRecentHistory() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeRecentTracks(tracks, limit) {
  const seen = new Set();
  const normalized = [];
  for (const track of tracks) {
    if (!track || track.id === null || track.id === undefined) continue;
    const id = String(track.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const cachedTrack = { ...track };
    // Never persist playable URLs or transient object URLs in the history cache.
    delete cachedTrack.audio_url;
    delete cachedTrack.src;
    delete cachedTrack.media_url;
    normalized.push(cachedTrack);
    if (normalized.length >= Math.max(0, limit)) break;
  }
  return normalized;
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
  let tracks = recentByOwner.get(key);
  if (!tracks) {
    try {
      const raw = storageForRecentHistory()?.getItem(RECENT_CACHE_PREFIX + encodeURIComponent(key));
      const parsed = raw ? JSON.parse(raw) : null;
      tracks = Array.isArray(parsed?.tracks)
        ? normalizeRecentTracks(parsed.tracks, limit)
        : [];
      recentByOwner.set(key, tracks);
    } catch {
      tracks = [];
    }
  }
  return tracks.slice(0, Math.max(0, limit));
}

export function writeCachedHomeRecentlyPlayed(owner, tracks, limit = 12) {
  const key = normalizeOwner(owner);
  if (!key || !Array.isArray(tracks)) return false;
  const normalized = normalizeRecentTracks(tracks, limit);
  recentByOwner.set(key, normalized);
  try {
    storageForRecentHistory()?.setItem(
      RECENT_CACHE_PREFIX + encodeURIComponent(key),
      JSON.stringify({ savedAt: Date.now(), tracks: normalized }),
    );
  } catch {
    // Storage can be disabled or full; the in-memory snapshot still works.
  }
  return true;
}
