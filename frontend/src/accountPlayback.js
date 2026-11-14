import { apiRequest } from "./api/client.js";
import * as player from "./audioPlayer.js";

export function bindAccountPlayback(userId) {
  if (!userId) return () => {};
  player.setPlaybackPersistenceOwner(userId);

  let active = true;
  let ready = false;
  let userInteractedBeforeRestore = false;
  let awaitingResume = false;
  let lastTrackId = player.getState()?.trackId ?? null;
  let lastSavedKey = "";
  let pendingKey = "";
  let writeChain = Promise.resolve();
  let lastPhase = player.getState()?.phase ?? null;
  let lastPaused = player.getState()?.paused ?? true;

  const save = (force = false, keepalive = false) => {
    if (!active || !ready || awaitingResume) return writeChain;
    const state = player.getState();
    const trackId = state?.trackId ?? null;
    const position = trackId
      ? Math.max(0, Number(state.currentTime) || 0)
      : 0;
    const paused = Boolean(state.paused);
    const key = `${trackId ?? "none"}:${Math.floor(position)}:${paused ? "paused" : "playing"}`;
    if (!force && (key === lastSavedKey || key === pendingKey)) return writeChain;
    pendingKey = key;
    const payload = { track_id: trackId, position_seconds: position, paused };
    writeChain = writeChain.catch(() => {}).then(async () => {
      if (!active) return;
      try {
        await apiRequest("/users/me/playback-state", {
          method: "PUT",
          body: JSON.stringify(payload),
          ...(keepalive ? { keepalive: true } : {}),
        });
        lastSavedKey = key;
      } catch (error) {
        console.error("[HyperSynced] Playback state was not saved.", error);
      } finally {
        if (pendingKey === key) pendingKey = "";
      }
    });
    return writeChain;
  };

  const unsubscribe = player.subscribe((state) => {
    if (!active) return;
    const trackId = state?.trackId ?? null;
    const paused = Boolean(state?.paused);
    if (!ready) {
      if ((trackId && trackId !== lastTrackId) || state?.phase === "playing" || (lastPaused && !paused)) {
        userInteractedBeforeRestore = true;
      }
      lastPhase = state?.phase ?? null;
      lastPaused = paused;
      lastTrackId = trackId;
      return;
    }
    if (awaitingResume) {
      if (trackId !== lastTrackId || state?.phase === "playing" || !paused) {
        awaitingResume = false;
      } else {
        lastPhase = state?.phase ?? null;
        lastPaused = paused;
        return;
      }
    }
    if (trackId !== lastTrackId) {
      lastTrackId = trackId;
      void save(true);
    } else if (paused !== lastPaused) {
      void save(true);
    } else if (lastPhase !== state?.phase && (state?.phase === "playing" || state?.phase === "paused")) {
      void save(true);
    }
    lastPhase = state?.phase ?? null;
    lastPaused = paused;
  });

  const interval = window.setInterval(() => void save(false), 5_000);
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") void save(true, true);
  };
  const onPageHide = () => void save(true, true);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);

  apiRequest("/users/me/playback-state")
    .then(async (saved) => {
      if (!active) return;
      if (!userInteractedBeforeRestore) {
        if (saved?.track?.id) {
          lastTrackId = saved.track.id;
          const savedPaused = saved.paused !== false;
          awaitingResume = !savedPaused;
          lastSavedKey = `${saved.track.id}:${Math.floor(Number(saved.position_seconds) || 0}:${savedPaused ? "paused" : "playing"}`;
          await player.restoreTrackPaused(saved.track, saved.position_seconds);
        } else {
          player.stopTrack();
        }
      }
      if (!active) return;
      ready = true;
      const current = player.getState();
      lastTrackId = current?.trackId ?? null;
      lastPhase = current?.phase ?? null;
      lastPaused = Boolean(current?.paused);
      if (userInteractedBeforeRestore && current?.trackId) void save(true);
    })
    .catch((error) => {
      if (!active) return;
      ready = true;
      const current = player.getState();
      lastTrackId = current?.trackId ?? null;
      lastPhase = current?.phase ?? null;
      lastPaused = Boolean(current?.paused);
      console.error("[HyperSynced] Unable to load saved playback state.", error);
      if (userInteractedBeforeRestore && current?.trackId) void save(true);
    });

  return () => {
    active = false;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    unsubscribe();
  };
}
