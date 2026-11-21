import * as player from "./audioPlayer.js";

function playbackSnapshotKey(ownerId) {
  return "hypersynced.device-playback.v2:" + encodeURIComponent(String(ownerId ?? ""));
}
function legacyPlaybackSnapshotKey(ownerId) {
  return "hypersynced.playback-snapshot.v1:" + encodeURIComponent(String(ownerId ?? ""));
}
function normalizeTrack(track) {
  if (!track?.id) return null;
  return {
    id: String(track.id), title: String(track.title ?? ""), artist: String(track.artist ?? ""),
    album: String(track.album ?? ""), audio_url: track.audioUrl ?? track.audio_url ?? null,
    artwork_url: track.artworkUrl ?? track.artwork_url ?? null, mime_type: track.mimeType ?? track.mime_type ?? null,
    file_size: track.fileSize ?? track.file_size ?? null, media_version: track.mediaVersion ?? track.media_version ?? null,
    artwork_version: track.artworkVersion ?? track.artwork_version ?? null,
    duration_seconds: track.durationSeconds ?? track.duration_seconds ?? null,
    catalog_track_id: track.catalogTrackId ?? track.catalog_track_id ?? null,
  };
}
function readDevicePlayback(ownerId) {
  try {
    const storage = globalThis.localStorage;
    const currentRaw = storage?.getItem(playbackSnapshotKey(ownerId));
    const raw = currentRaw ?? storage?.getItem(legacyPlaybackSnapshotKey(ownerId));
    const saved = raw ? JSON.parse(raw) : null;
    const track = normalizeTrack(saved?.track);
    const savedAt = Number(saved?.savedAt);
    if (!track || !savedAt || Date.now() - savedAt > 30 * 24 * 60 * 60 * 1000) return null;
    return { track, positionSeconds: Math.max(0, Number(saved.positionSeconds) || 0) };
  } catch { return null; }
}
function writeDevicePlayback(ownerId, state) {
  const track = normalizeTrack({
    id: state.trackId, title: state.title, artist: state.artist, album: state.album,
    artworkUrl: state.artworkUrl, mimeType: state.mimeType, fileSize: state.fileSize,
    mediaVersion: state.mediaVersion, artworkVersion: state.artworkVersion,
    durationSeconds: state.durationSeconds, catalogTrackId: state.catalogTrackId,
  });
  if (!track) return false;
  try {
    globalThis.localStorage?.setItem(playbackSnapshotKey(ownerId), JSON.stringify({
      savedAt: Date.now(), track, positionSeconds: Math.max(0, Number(state.currentTime) || 0),
      paused: Boolean(state.paused),
    }));
    globalThis.localStorage?.removeItem(legacyPlaybackSnapshotKey(ownerId));
    return true;
  } catch { return false; }
}
export function bindAccountPlayback(userId, onInitialRestoreComplete = () => {}) {
  if (!userId) return () => {};
  player.setPlaybackPersistenceOwner(userId);
  let active = true;
  let lastSignature = "";
  const saveLocal = () => {
    if (!active) return;
    const state = player.getState();
    if (!state?.trackId) return;
    const signature = String(state.trackId) + ":" + Math.floor(Number(state.currentTime) || 0) + ":" + Boolean(state.paused) + ":" + state.phase;
    if (signature === lastSignature) return;
    lastSignature = signature;
    writeDevicePlayback(userId, state);
  };
  const cached = readDevicePlayback(userId);
  if (cached?.track?.id) {
    // Restore UI state only. Resolving/loading the media source is deferred
    // until the user presses Play, avoiding an automatic startup network fetch.
    player.restoreCachedTrackMetadata(cached.track, cached.positionSeconds);
  }
  const unsubscribe = player.subscribe(() => saveLocal());
  const persistOnHide = () => saveLocal();
  const onVisibilityChange = () => { if (document.visibilityState === "hidden") persistOnHide(); };
  window.addEventListener("pagehide", persistOnHide);
  document.addEventListener("visibilitychange", onVisibilityChange);
  try { onInitialRestoreComplete(); } catch {}
  return () => {
    active = false;
    window.removeEventListener("pagehide", persistOnHide);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    unsubscribe();
  };
}
