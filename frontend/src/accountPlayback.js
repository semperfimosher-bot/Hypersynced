import { apiRequest } from "./api/client.js";
import * as player from "./audioPlayer.js";

export function bindAccountPlayback(userId) {
  if (!userId) return () => {};

  let active = true;
  let ready = false;
  let userInteractedBeforeRestore = false;
  let lastTrackId = player.getState()?.trackId ?? null;
  let lastSavedKey = "";
  let pendingKey = "";
  let writeChain = Promise.resolve();
  let lastPhase = player.getState()?.phase ?? null;
  let lastPaused = player.getState()?.paused ?? true;

  const save = (force = false, keepalive = false) => {
    if (!active || !ready) return writeChain;

    const state = player.getState();
    if (!state?.trackId) return writeChain;

    const position = Math.max(0, Number(state.currentTime) || 0);
    const paused = Boolean(state.paused);
    const key = `${state.trackId}:${Math.floor(position)}:${paused ? "paused" : "playing"}`;
    if (!force && (key === lastSavedKey || key === pendingKey)) return writeChain;

    pendingKey = key;
    const payload = {
      track_id: state.trackId,
      position_seconds: position,
      paused,
    };

    writeChain = writeChain
      .catch(() => {})
      .then(async () => {
        if (!active) return;
        try {
          await apiRequest("/users/me/playback-state", {
            method: "PUT",
            body: JSON.stringify(payload),
            ...(keepalive ? { keepalive: true } : {}),
          });
          lastSavedKey = key;
        } catch (error) {
          // Leave lastSavedKey unchanged so the next checkpoint retries the
          // latest state instead of treating a failed write as persisted.
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
      if (
        (trackId && trackId !== lastTrackId) ||
        state?.phase === "playing" ||
        (lastPaused && !paused)
      ) {
        userInteractedBeforeRestore = true;
      }
      lastPhase = state?.phase ?? null;
      lastPaused = paused;
      lastTrackId = trackId;
      return;
    }

    if (trackId && trackId !== lastTrackId) {
      lastTrackId = trackId;
      void save(true);
    } else if (paused !== lastPaused) {
      void save(true);
    } else if (
      lastPhase !== state?.phase &&
      (state?.phase === "playing" || state?.phase === "paused")
    ) {
      void save(true);
    }

    lastPhase = state?.phase ?? null;
    lastPaused = paused;
  });

  const interval = window.setInterval(() => {
    void save(false);
  }, 15_000);

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") void save(true, true);
  };
  const onPageHide = () => {
    void save(true, true);
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);

  apiRequest("/users/me/playback-state")
    .then(async (saved) => {
      if (!active) return;

      if (saved?.track?.id && !userInteractedBeforeRestore) {
        lastTrackId = saved.track.id;
        lastSavedKey = `${saved.track.id}:${Math.floor(Number(saved.position_seconds) || 0)}:paused`;
        await player.restoreTrackPaused(saved.track, saved.position_seconds);
      }

      if (!active) return;
      ready = true;

      // If playback changed while the initial restore request was in flight,
      // persist that newer selection immediately instead of waiting for a timer.
      const current = player.getState();
      lastTrackId = current?.trackId ?? null;
      lastPhase = current?.phase ?? null;
      lastPaused = Boolean(current?.paused);
      if (userInteractedBeforeRestore && current?.trackId) {
        void save(true);
      }
    })
    .catch((error) => {
      if (!active) return;
      ready = true;
      const current = player.getState();
      lastTrackId = current?.trackId ?? null;
      lastPhase = current?.phase ?? null;
      lastPaused = Boolean(current?.paused);
      console.error("[HyperSynced] Unable to load saved playback state.", error);
      if (current?.trackId) void save(true);
    });

  return () => {
    active = false;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    unsubscribe();
  };
}
