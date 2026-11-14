import { apiRequest } from "./api/client.js";
import * as player from "./audioPlayer.js";

function timestampValue(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function bindAccountPlayback(userId) {
  if (!userId) return () => {};

  player.setPlaybackPersistenceOwner(userId);

  let active = true;
  let ready = false;
  let userInteractedBeforeRestore = false;
  let awaitingResume = false;
  let applyingRemoteState = false;
  let expectedRemoteTrackId = null;
  let localRevision = 0;
  let lastServerUpdatedAt = 0;
  let refreshPromise = null;
  let lastTrackId = player.getState()?.trackId ?? null;
  let lastSavedKey = "";
  let pendingKey = "";
  let writeChain = Promise.resolve();
  let lastPhase = player.getState()?.phase ?? null;
  let lastPaused = player.getState()?.paused ?? true;

  const syncObservedState = () => {
    const current = player.getState();
    lastTrackId = current?.trackId ?? null;
    lastPhase = current?.phase ?? null;
    lastPaused = Boolean(current?.paused);
  };

  const save = (force = false, keepalive = false) => {
    if (!active || !ready || awaitingResume || applyingRemoteState) return writeChain;
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
        const saved = await apiRequest("/users/me/playback-state", {
          method: "PUT",
          body: JSON.stringify(payload),
          ...(keepalive ? { keepalive: true } : {}),
        });
        lastSavedKey = key;
        lastServerUpdatedAt = Math.max(
          lastServerUpdatedAt,
          timestampValue(saved?.updated_at),
        );
      } catch (error) {
        console.error("[HyperSynced] Playback state was not saved.", error);
      } finally {
        if (pendingKey === key) pendingKey = "";
      }
    });
    return writeChain;
  };

  const refreshFromDatabase = (initial = false) => {
    if (!active || refreshPromise) return refreshPromise ?? Promise.resolve();
    const revisionAtRequest = localRevision;

    const task = (async () => {
      try {
        // Let this device's pending write finish first so its own PUT response
        // cannot be mistaken for a newer playback session from another device.
        await writeChain.catch(() => {});
        if (!active || localRevision !== revisionAtRequest) return;

        const saved = await apiRequest("/users/me/playback-state");
        if (!active) return;

        const serverUpdatedAt = timestampValue(saved?.updated_at);
        if (localRevision !== revisionAtRequest) {
          if (serverUpdatedAt) {
            lastServerUpdatedAt = Math.max(lastServerUpdatedAt, serverUpdatedAt);
          }
          return;
        }
        if (serverUpdatedAt && serverUpdatedAt <= lastServerUpdatedAt) return;
        if (!initial && !serverUpdatedAt) return;

        if (initial && userInteractedBeforeRestore) {
          lastServerUpdatedAt = Math.max(lastServerUpdatedAt, serverUpdatedAt);
          return;
        }

        applyingRemoteState = true;
        expectedRemoteTrackId = saved?.track?.id
          ? String(saved.track.id)
          : null;

        if (saved?.track?.id) {
          await player.restoreTrackPaused(
            saved.track,
            saved.position_seconds,
          );
          if (!active || localRevision !== revisionAtRequest) return;

          // Browsers must not autoplay after a refresh or remote-device update.
          awaitingResume = saved.paused === false;
          lastSavedKey = `${saved.track.id}:${Math.floor(Number(saved.position_seconds) || 0)}:${saved.paused === false ? "playing" : "paused"}`;
        } else {
          if (player.getState()?.trackId) player.stopTrack();
          awaitingResume = false;
          lastSavedKey = "none:0:paused";
        }

        lastServerUpdatedAt = Math.max(lastServerUpdatedAt, serverUpdatedAt);
      } catch (error) {
        if (initial) {
          console.error("[HyperSynced] Unable to load saved playback state.", error);
        } else {
          console.warn("[HyperSynced] Unable to refresh saved playback state.", error);
        }
      } finally {
        if (initial && active) ready = true;
        applyingRemoteState = false;
        expectedRemoteTrackId = null;
        syncObservedState();
        if (initial && active && userInteractedBeforeRestore && player.getState()?.trackId) {
          void save(true);
        }
      }
    })();

    refreshPromise = task;
    return task.finally(() => {
      if (refreshPromise === task) refreshPromise = null;
    });
  };

  const unsubscribe = player.subscribe((state) => {
    if (!active) return;
    const trackId = state?.trackId ?? null;
    const paused = Boolean(state?.paused);

    if (applyingRemoteState) {
      // Ignore the state notifications generated by our own database restore.
      // A different track or an actual Play action is still a local user action.
      if (
        trackId !== expectedRemoteTrackId ||
        state?.phase === "playing" ||
        !paused
      ) {
        localRevision += 1;
        userInteractedBeforeRestore = true;
      }
      lastPhase = state?.phase ?? null;
      lastPaused = paused;
      lastTrackId = trackId;
      return;
    }

    if (!ready) {
      if (
        (trackId && trackId !== lastTrackId) ||
        state?.phase === "playing" ||
        (lastPaused && !paused)
      ) {
        userInteractedBeforeRestore = true;
        localRevision += 1;
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
      localRevision += 1;
      lastTrackId = trackId;
      void save(true);
    } else if (paused !== lastPaused) {
      localRevision += 1;
      void save(true);
    } else if (
      lastPhase !== state?.phase &&
      (state?.phase === "playing" || state?.phase === "paused")
    ) {
      localRevision += 1;
      void save(true);
    }

    lastPhase = state?.phase ?? null;
    lastPaused = paused;
  });

  const interval = window.setInterval(() => {
    void save(false);
    void refreshFromDatabase(false);
  }, 5_000);

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") void save(true, true);
    else void refreshFromDatabase(false);
  };
  const onPageHide = () => void save(true, true);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);

  void refreshFromDatabase(true);

  return () => {
    active = false;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    unsubscribe();
  };
}
