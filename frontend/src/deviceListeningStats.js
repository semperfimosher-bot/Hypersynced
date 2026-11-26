const DEVICE_STATS_PREFIX = "hypersynced:device-listening-stats:v1:";
const DEVICE_HISTORY_PREFIX = "hypersynced:device-played-history:v1:";
const DEVICE_SESSIONS_PREFIX = "hypersynced:device-listening-sessions:v1:";
export const DEVICE_LISTENING_STATS_CHANGED_EVENT = "hypersynced:device-listening-stats-changed";
export const DEVICE_PLAYED_HISTORY_CHANGED_EVENT = "hypersynced:device-played-history-changed";
const DEVICE_HISTORY_LIMIT = 1000;
const DEVICE_SESSIONS_LIMIT = 4000;
let activeSessionOwner = null;
let activeSessionId = null;
const DEFAULT_STATS = { tracksPlayed: 0, listenedSeconds: 0 };

function historyKeyFor(owner) {
  const value = String(owner ?? "").trim();
  return value ? DEVICE_HISTORY_PREFIX + encodeURIComponent(value) : null;
}

function sessionsKeyFor(owner) {\n  const value = String(owner ?? "").trim();\n  return value ? DEVICE_SESSIONS_PREFIX + encodeURIComponent(value) : null;\n}\n\nexport function readDeviceListeningSessions(owner) {\n  const key = sessionsKeyFor(owner);\n  if (!key) return [];\n  try { const raw = globalThis.localStorage?.getItem(key); const value = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value : []; } catch { return []; }\n}\n\nfunction saveDeviceListeningSessions(owner, sessions) {\n  const key = sessionsKeyFor(owner);\n  if (!key) return;\n  try { globalThis.localStorage?.setItem(key, JSON.stringify(sessions.slice(-DEVICE_SESSIONS_LIMIT))); } catch {}\n}\n\nfunction keyFor(owner) {
  const value = String(owner ?? "").trim();
  return value ? DEVICE_STATS_PREFIX + encodeURIComponent(value) : null;
}

export function readDeviceListeningStats(owner) {
  const key = keyFor(owner);
  if (!key) return { ...DEFAULT_STATS };
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const value = raw ? JSON.parse(raw) : null;
    return {
      tracksPlayed: Math.max(0, Number(value?.tracksPlayed) || 0),
      listenedSeconds: Math.max(0, Number(value?.listenedSeconds) || 0),
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function readDevicePlayedHistory(owner) {
  const key = historyKeyFor(owner);
  if (!key) return [];
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDevicePlayedHistory(owner, tracks) {
  const key = historyKeyFor(owner);
  if (!key) return;
  try { globalThis.localStorage?.setItem(key, JSON.stringify(tracks.slice(0, DEVICE_HISTORY_LIMIT))); } catch {}
}

export function recordDevicePlayback(owner, state, previous = null) {
  const ownerKey = String(owner ?? "").trim();
  const current = state?.trackId == null ? null : String(state.trackId);
  const playing = Boolean(current && !state?.paused);
  const currentTime = Number(state?.currentTime) || 0;
  const previousTrack = previous?.trackId == null ? null : String(previous.trackId);
  const previousTime = Number(previous?.currentTime) || 0;
  const trackStarted = playing && (current !== previousTrack || previous?.paused === true && previous?.phase === "loading" || (previousTrack === current && currentTime < previousTime - 5));
  const delta = playing && current === previousTrack && currentTime >= previousTime
    ? Math.min(3, currentTime - previousTime)
    : 0;
  const stats = readDeviceListeningStats(owner);
  let sessions = readDeviceListeningSessions(owner);
  if (trackStarted) {
    stats.tracksPlayed += 1;
    const track = {
      id: current,
      title: state?.title ?? "",
      artist: state?.artist ?? "",
      album: state?.album ?? "",
      artwork_url: state?.artworkUrl ?? state?.artwork_url ?? null,
      audio_url: state?.audioUrl ?? state?.audio_url ?? null,
      mime_type: state?.mimeType ?? state?.mime_type ?? null,
      file_size: state?.fileSize ?? state?.file_size ?? null,
      media_version: state?.mediaVersion ?? state?.media_version ?? null,
      genre: state?.genre ?? "",
      release_year: state?.releaseYear ?? state?.release_year ?? null,
      last_played_at: new Date().toISOString(),
    };
    const history = readDevicePlayedHistory(owner);
    const existing = history.find((item) => String(item?.id) === current);
    track.play_count = Math.max(0, Number(existing?.play_count) || 0) + 1;
    saveDevicePlayedHistory(owner, [track, ...history.filter((item) => String(item?.id) !== current)]);
    try { globalThis.dispatchEvent?.(new Event(DEVICE_PLAYED_HISTORY_CHANGED_EVENT)); } catch {}
    activeSessionOwner = ownerKey;
    activeSessionId = `${current}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
    sessions.push({
      session_id: activeSessionId,
      track_id: current,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork_url: track.artwork_url,
      started_at: track.last_played_at,
      listened_seconds: 0,
      day_seconds: 0,
      night_seconds: 0,
    });
  }
  if (delta > 0) {
    stats.listenedSeconds += delta;
    if (activeSessionOwner === ownerKey && activeSessionId) {
      const session = sessions.find((item) => item.session_id === activeSessionId);
      if (session) {
        session.listened_seconds = Math.max(0, Number(session.listened_seconds) || 0) + delta;
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 18) session.day_seconds = (Number(session.day_seconds) || 0) + delta;
        else session.night_seconds = (Number(session.night_seconds) || 0) + delta;
      }
    }
  }
  if (trackStarted || delta > 0) {
    const key = keyFor(owner);
    try { if (key && globalThis.localStorage) globalThis.localStorage.setItem(key, JSON.stringify(stats)); } catch {}
    saveDeviceListeningSessions(owner, sessions);
    try { globalThis.dispatchEvent?.(new Event(DEVICE_LISTENING_STATS_CHANGED_EVENT)); } catch {}
  }
  return stats;
}
