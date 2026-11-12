export function getHomeRecentlyPlayed(
  profile,
  limit = 12,
) {
  const tracks =
    Array.isArray(
      profile?.recently_played,
    )
      ? profile.recently_played
      : [];

  return tracks.slice(
    0,
    limit,
  );
}


export const LISTENING_HISTORY_CHANGED_EVENT =
  "hypersynced:listening-history-changed";


export function notifyListeningHistoryChanged(
  target =
    globalThis.window,
) {
  if (
    !target?.dispatchEvent
  ) {
    return false;
  }

  target.dispatchEvent(
    new Event(
      LISTENING_HISTORY_CHANGED_EVENT,
    ),
  );

  return true;
}


export function subscribeListeningHistoryChanged(
  listener,
  target =
    globalThis.window,
) {
  if (
    !target?.addEventListener ||
    !target?.removeEventListener
  ) {
    return () => {};
  }

  target.addEventListener(
    LISTENING_HISTORY_CHANGED_EVENT,
    listener,
  );

  return () => {
    target.removeEventListener(
      LISTENING_HISTORY_CHANGED_EVENT,
      listener,
    );
  };
}

export function canRecordListeningHistory(accessToken, storedSession) {
  return Boolean(accessToken || storedSession);
}

export function isCurrentHistoryResponse(request, latestRequest, owner, currentOwner) {
  return request === latestRequest && owner === currentOwner;
}


const HOME_RECENT_CACHE_PREFIX = "hypersync-home-recent-v1:";

function homeRecentOwnerKey(owner) {
  const value = String(owner ?? "").trim();
  return value ? HOME_RECENT_CACHE_PREFIX + encodeURIComponent(value) : null;
}

export function readCachedHomeRecentlyPlayed(owner, limit = 12) {
  const key = homeRecentOwnerKey(owner);
  if (!key) return [];
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((track) => track && track.id !== null && track.id !== undefined)
      .slice(0, Math.max(0, limit));
  } catch {
    return [];
  }
}

export function writeCachedHomeRecentlyPlayed(owner, tracks, limit = 12) {
  const key = homeRecentOwnerKey(owner);
  if (!key || !Array.isArray(tracks)) return false;
  const seen = new Set();
  const normalized = [];
  for (const track of tracks) {
    if (!track || track.id === null || track.id === undefined) continue;
    const id = String(track.id);
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(track);
    if (normalized.length >= Math.max(0, limit)) break;
  }
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}
