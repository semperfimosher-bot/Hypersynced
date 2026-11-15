import { apiRequest } from "./api/client.js";
import * as player from "./audioPlayer.js";

function timestampValue(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function bindAccountPlayback(userId, onInitialRestoreComplete = () => {}) {
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
  let lastServerUpdatedAtValue = null;
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

  const save = (force = false) => {
    if (!active || !ready || awaitingResume || applyingRemoteState) return writeChain;
    const state = player.getState();
    const trackId = state?.trackId ?? null;

    // An idle player is not an instruction to erase the account's last
    // playback position. In particular, a fresh tab can be temporarily
    // idle while Neon is still restoring the saved track. Only a real
    // track selection may update the persisted playback record.
    if (!trackId) return writeChain;

    const position = Math.max(0, Number(state.currentTime) || 0);
    const paused = Boolean(state.paused);
    const key = `${trackId ?? "none"}:${Math.floor(position)}:${paused ? "paused" : "playing"}`;
    if (!force && (key === lastSavedKey || key === pendingKey)) return writeChain;
    pendingKey = key;
    writeChain = writeChain.catch(() => {}).then(async () => {
      if (!active) return;
      try {
        const payload = {
          track_id: trackId,
          position_seconds: position,
          paused,
          // Read the version when this serialized write actually runs. Earlier
          // queued writes may have advanced the version in the meantime.
          expected_playback_updated_at: lastServerUpdatedAtValue,
        };
        const saved = await apiRequest("/users/me/playback-state", {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        lastSavedKey = key;
        lastServerUpdatedAtValue = saved?.updated_at ?? null;
        lastServerUpdatedAt = Math.max(
          lastServerUpdatedAt,
          timestampValue(saved?.updated_at),
        );
      } catch (error) {
        if (error?.status === 409) {
          // Never retry the stale payload: read Neon and reconcile first.
          lastSavedKey = "";
          Promise.resolve().then(() => {
            if (active) void refreshFromDatabase(false);
          });
        } else {
          console.error("[HyperSynced] Playback state was not saved.", error);
        }
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
          if (serverUpdatedAt >= lastServerUpdatedAt) {
            lastServerUpdatedAtValue = saved?.updated_at ?? null;
          }
          if (serverUpdatedAt) {
            lastServerUpdatedAt = Math.max(lastServerUpdatedAt, serverUpdatedAt);
          }
          return;
        }
        if (serverUpdatedAt && serverUpdatedAt <= lastServerUpdatedAt) return;
        if (!initial && !serverUpdatedAt) return;

        if (initial && userInteractedBeforeRestore) {
          lastServerUpdatedAtValue = saved?.updated_at ?? null;
          lastServerUpdatedAt = Math.max(lastServerUpdatedAt, serverUpdatedAt);
          return;
        }

        applyingRemoteState = true;
        expectedRemoteTrackId = saved?.track?.id
          ? String(saved.track.id)
          : null;

        if (saved?.track?.id) {
          // Apply the database track metadata immediately, but do not make
          // first paint wait for the audio URL/network request. The player
          // restores the saved seek position as soon as media metadata loads.
          // The UI can render the restored page and paused player meanwhile.
          void player.restoreTrackPaused(
            saved.track,
            saved.position_seconds,
          ).catch((error) => {
            console.error("[HyperSynced] Unable to prepare restored audio in the background.", error);
          });
          if (!active) return;
          if (localRevision !== revisionAtRequest) {
            lastServerUpdatedAtValue = saved?.updated_at ?? null;
            lastServerUpdatedAt = Math.max(lastServerUpdatedAt, serverUpdatedAt);
            return;
          }

          // Browsers must not autoplay after a refresh or remote-device update.
          awaitingResume = saved.paused === false;
          lastSavedKey = `${saved.track.id}:${Math.floor(Number(saved.position_seconds) || 0)}:${saved.paused === false ? "playing" : "paused"}`;
        } else {
          if (player.getState()?.trackId) player.stopTrack();
          awaitingResume = false;
          lastSavedKey = "none:0:paused";
        }

        lastServerUpdatedAtValue = saved?.updated_at ?? null;
        lastServerUpdatedAt = Math.max(lastServerUpdatedAt, serverUpdatedAt);
      } catch (error) {
        if (initial) {
          console.error("[HyperSynced] Unable to load saved playback state.", error);
        } else {
          console.warn("[HyperSynced] Unable to refresh saved playback state.", error);
        }
      } finally {
        if (initial && active) {
          ready = true;
          try {
            onInitialRestoreComplete();
          } catch (callbackError) {
            console.error("[HyperSynced] Account restore completion callback failed.", callbackError);
          }
        }
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
        state?.phase === "playing"
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

  // The audio player's own clock updates the UI continuously. Persist only
  // a compact checkpoint every few seconds, rather than writing to Neon every
  // second. Discrete player actions above (track/pause/resume/seek) still save
  // immediately.
  const checkpointInterval = window.setInterval(() => {
    void save(false);
  }, 5_000);

  // Cross-device changes are read separately at a lower frequency. This
  // avoids coupling every checkpoint write to a database read while keeping
  // another device's actions visible promptly.
  const refreshInterval = window.setInterval(() => {
    void refreshFromDatabase(false);
  }, 12_000);

  const onVisibilityChange = () => {
    if (document.visibilityState !== "hidden") {
      void refreshFromDatabase(false);
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  void refreshFromDatabase(true);

  return () => {
    active = false;
    window.clearInterval(checkpointInterval);
    window.clearInterval(refreshInterval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    unsubscribe();
  };
}
