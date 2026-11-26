const DEVICE_STATS_PREFIX = "hypersynced:device-listening-stats:v1:";
export const DEVICE_LISTENING_STATS_CHANGED_EVENT = "hypersynced:device-listening-stats-changed";
const DEFAULT_STATS = { tracksPlayed: 0, listenedSeconds: 0 };

function keyFor(owner) {
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

export function recordDevicePlayback(owner, state, previous = null) {
  const current = state?.trackId == null ? null : String(state.trackId);
  const playing = Boolean(current && !state?.paused);
  const currentTime = Number(state?.currentTime) || 0;
  const previousTrack = previous?.trackId == null ? null : String(previous.trackId);
  const previousTime = Number(previous?.currentTime) || 0;
  const trackStarted = playing && (current !== previousTrack || (previousTrack === current && currentTime < previousTime - 5));
  const delta = playing && current === previousTrack && currentTime >= previousTime
    ? Math.min(3, currentTime - previousTime)
    : 0;
  const stats = readDeviceListeningStats(owner);
  if (trackStarted) stats.tracksPlayed += 1;
  if (delta > 0) stats.listenedSeconds += delta;
  if (trackStarted || delta > 0) {
    const key = keyFor(owner);
    try { if (key && globalThis.localStorage) globalThis.localStorage.setItem(key, JSON.stringify(stats)); } catch {}
    try { globalThis.dispatchEvent?.(new Event(DEVICE_LISTENING_STATS_CHANGED_EVENT)); } catch {}
  }
  return stats;
}
