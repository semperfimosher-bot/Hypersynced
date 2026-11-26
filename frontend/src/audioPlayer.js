import {
  apiRequest,
} from "./api/client.js";

import {
  getAccessToken,
  hasStoredSession,
} from "./api/storage.js";

import {
  waitForServiceWorkerController,
} from "./serviceWorkerController.js";

import {
  resolveMediaUrl,
} from "./mediaCache.js";

import {
  appendAutoplayQueueEntries,
  appendQueueEntry,
  buildTrackQueue,
  catalogTrackIdOrNull,
  filterCatalogTrackIds,
  getNextQueueIndex,
  getQueueTrackAtIndex,
  insertQueueEntryAsNext,
} from "./playerQueue.js";

import {
  readPlayerQueueSnapshot,
  writePlayerQueueSnapshot,
} from "./playerQueueCache.js";

import {
  prepareTrackAudioSource,
  recordTrackPlayback,
  warmTrackPlayback,
} from "./mediaPlayback.js";

import {
  beginPlaybackSession,
  cancelActivePlaybackSession,
  canReuseLoadedAudioSource,
  isPlaybackSessionCurrent,
} from "./player/playbackSession.js";

import {
  mediaSessionIdentity,
  mediaSessionPlaybackState,
} from "./player/mediaSessionState.js";

import {
  fetchTrackLyrics,
} from "./lyricsPrefetch.js";

import {
  catalogLyricsTrackId,
} from "./lyricsSync.js";

import {
  shouldCorrectRestoredPlaybackClock,
  shouldReleaseRestoredPosition,
  isRestoredClockProgressing,
} from "./playerRestorePosition.js";

import {
  notifyListeningHistoryChanged,
  canRecordListeningHistory,
  shouldBeginListeningEvent,
  applyOptimisticRecentlyPlayed,
  readCachedHomeRecentlyPlayed,
  writeCachedHomeRecentlyPlayed,
} from "./homeRecentlyPlayed.js";
import {
  createListeningEventId,
  enqueueOfflineListeningEvent,
  setOfflineListeningOwner,
} from "./offlineListeningHistory.js";


const audio =
  new Audio();

audio.crossOrigin =
  "anonymous";

audio.preload =
  "auto";

let activeListeningEvent =
  null;

let subscribers =
  new Set();


let currentArtworkUrl =
  null;

let currentTrackTitle =
  "";

let currentTrackArtist =
  "";

let currentTrackId =
  null;

let currentTrackMeta =
  null;

let lastMediaSessionSignature =
  null;

let activeObjectUrl =
  null;

let loadedAudioTrackId =
  null;

let warmPlaybackTask =
  null;

let warmPlaybackTaskKey =
  null;


/*
 * When the application is refreshed,
 * this contains the position that the
 * restored song should return to.
 */
let restoredTimeSeconds =
  0;

let restoredClockPreviousSeconds =
  null;

let restoredClockProgressTicks =
  0;


/*
 * Prevent multiple callers from trying
 * to rebuild the same audio source at
 * the same time.
 */
let sourcePreparationPromise =
  null;

let sourcePreparationTrackId =
  null;


let activePlaybackOwnerId = null;


let currentQueue =
  [];

let currentQueueIndex =
  -1;

function persistQueueSnapshot() {
  return writePlayerQueueSnapshot(
    activePlaybackOwnerId,
    currentQueue,
    currentQueueIndex,
  );
}

function restoreQueueForTrack(trackId, meta = {}) {
  queueRevision += 1;
  const id = String(trackId);
  const existingIndex = currentQueue.findIndex(
    (entry) => String(entry?.id ?? "") === id,
  );

  if (existingIndex >= 0) {
    const existing = currentQueue[existingIndex];
    currentQueue[existingIndex] = {
      id,
      meta: {
        ...(existing?.meta ?? {}),
        ...normalizeTrackMeta(meta),
      },
    };
    currentQueueIndex = existingIndex;
  } else {
    currentQueue = [{
      id,
      meta: normalizeTrackMeta(meta),
    }];
    currentQueueIndex = 0;
  }

  persistQueueSnapshot();
}

let recentTrackIds =
  [];

const AUTOPLAY_REFILL_THRESHOLD =
  6;

const AUTOPLAY_BATCH_SIZE =
  16;

const AUTOPLAY_CONTEXT_SIZE =
  16;

let queueRevision =
  0;

let shuffleModeEnabled = false;

let autoplayFill =
  null;

let nextTrackTransitionPromise =
  null;

let playbackPhase =
  "idle";

let playbackError =
  null;

let requestedPauseCause = null;
let lastPauseCause = null;
let unexpectedPauseRecoveryTimer = null;
let unexpectedPauseRecoveryTrackId = null;
let unexpectedPauseRecoveryAttempts = 0;
const MAX_UNEXPECTED_PAUSE_RECOVERIES = 2;


const queuedAudioWarmups =
  new Map();

let nextTrackFirstChunkWarmKey = null;


function warmQueuedAudioEntry(
  entry,
  options = {},
) {
  return warmTrackForPlayback(
    entry?.id,
    entry?.meta ?? {},
    options,
  );
}

let nextLyricsPrefetchKey = null;

function prefetchNextTrackLyrics() {
  if (!currentTrackId || audio.paused || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const nextIndex = getNextQueueIndex(currentQueue, currentQueueIndex);
  if (nextIndex < 0) return;
  const entry = currentQueue[nextIndex];
  const lyricsId = catalogLyricsTrackId(entry?.meta?.catalogTrackId ?? entry?.id);
  if (!lyricsId) return;
  if (audio.duration - audio.currentTime > 5 || audio.currentTime > audio.duration) return;
  if (nextLyricsPrefetchKey === String(lyricsId)) return;
  nextLyricsPrefetchKey = String(lyricsId);
  void fetchTrackLyrics(lyricsId).catch(() => {});
}

function warmNextTrackFirstChunk() {
  if (
    !currentTrackId ||
    !Number.isFinite(audio.duration) ||
    audio.duration <= 0 ||
    !Number.isFinite(audio.currentTime) ||
    audio.paused ||
    globalThis.navigator?.onLine === false
  ) {
    return;
  }

  const nextIndex = getNextQueueIndex(currentQueue, currentQueueIndex);
  if (nextIndex < 0) return;

  const entry = currentQueue[nextIndex];
  const meta = entry?.meta ?? {};
  const mediaVersion = meta.mediaVersion ?? meta.media_version ?? null;
  if (!entry?.id || !mediaVersion) return;

  const remaining = audio.duration - audio.currentTime;
  // Start warming well before the transition so the first media range is
  // already in the service-worker cache when the current track ends.
  // Fetch the upcoming track's first playable range 5 seconds before the transition.
  if (remaining > 5 || remaining < 0) return;

  const key = `${String(entry.id)}|${String(mediaVersion)}`;
  if (nextTrackFirstChunkWarmKey === key) return;
  nextTrackFirstChunkWarmKey = key;

  void Promise.resolve(
    warmQueuedAudioEntry(entry, { warmBytes: 256 * 1024 }),
  ).then((result) => {
    // Retry on later timeupdate events if this opportunistic warm failed.
    if (!result?.warmed && nextTrackFirstChunkWarmKey === key) {
      nextTrackFirstChunkWarmKey = null;
    }
  }).catch(() => {
    if (nextTrackFirstChunkWarmKey === key) {
      nextTrackFirstChunkWarmKey = null;
    }
  });
}



export function warmTrackForPlayback(
  trackId,
  meta = {},
  options = {},
) {
  const mediaVersion =
    meta.mediaVersion ??
    meta.media_version ??
    null;

  const fileSize =
    Number(
      meta.fileSize ??
      meta.file_size ??
      null,
    );

  if (
    !trackId ||
    !mediaVersion ||
    !Number.isSafeInteger(
      fileSize,
    ) ||
    fileSize <= 0
  ) {
    return null;
  }

  const key = [
    String(trackId),
    String(mediaVersion),
  ].join("|");

  const existing =
    queuedAudioWarmups.get(
      key,
    );

  if (existing) {
    return existing;
  }

  const task =
    waitForServiceWorkerController()
      .then((controllerReady) => {
        if (!controllerReady) {
          return false;
        }

        return warmTrackPlayback(
          trackId,
          meta,
          {
            positionSeconds:
              0,
            durationSeconds:
              meta.durationSeconds ??
              meta.duration_seconds ??
              null,
            useStableMediaRoute:
              true,
            warmBytes:
              options.warmBytes,
          },
        );
      })
      .catch(
        () => false,
      )
      .finally(
        () => {
          if (
            queuedAudioWarmups.get(key) ===
              task
          ) {
            queuedAudioWarmups.delete(
              key,
            );
          }
        },
      );

  queuedAudioWarmups.set(
    key,
    task,
  );

  return task;
}


function beginListeningEvent(
  trackId,
  meta = {},
) {
  const offline = globalThis.navigator?.onLine === false;
  const canRecordOnline = canRecordListeningHistory(getAccessToken(), hasStoredSession());
  if (!canRecordOnline && !(offline && activePlaybackOwnerId)) {
    activeListeningEvent = null;
    return;
  }

  const owner = activePlaybackOwnerId;
  const event = {
    trackId: String(trackId),
    eventId: null,
    clientEventId: createListeningEventId(),
    listenedAt: new Date().toISOString(),
    request: null,
    listenedSeconds: 0,
    lastMediaTime: getSafeCurrentTime(),
    lastSampleAt: globalThis.performance?.now?.() ?? Date.now(),
    lastCheckpointSentAt: 0,
    checkpointPromise: null,
    historyNotified: false,
  };

  const queueOfflineEvent = () => {
    const queued = enqueueOfflineListeningEvent(owner, {
      eventId: event.clientEventId,
      trackId: event.trackId,
      listenedAt: event.listenedAt,
    });
    if (queued) {
      notifyListeningHistoryChanged({ type: "offline-history-queued", owner });
    }
    return null;
  };

  event.request = offline
    ? Promise.resolve(queueOfflineEvent())
    : apiRequest("/users/me/listening", {
        method: "POST",
        body: JSON.stringify({
          track_id: event.trackId,
          event_id: event.clientEventId,
          listened_at: event.listenedAt,
        }),
      })
        .then((data) => {
          const eventId = data?.event_id ?? null;
          if (eventId) {
            event.historyNotified = true;
            notifyListeningHistoryChanged({
              type: "confirmed-play",
              trackId: event.trackId,
            });
          }
          return eventId;
        })
        .catch((error) => {
          console.warn("[HyperSynced] Listening history will sync when connection returns.", error);
          queueOfflineEvent();
          notifyListeningHistoryChanged({ type: "write-failed" });
          return null;
        });

  activeListeningEvent = event;

  if (owner) {
    const cachedRecent = readCachedHomeRecentlyPlayed(owner);
    writeCachedHomeRecentlyPlayed(
      owner,
      applyOptimisticRecentlyPlayed(cachedRecent, { id: event.trackId, ...meta }, 12, {
        incrementPlayCount: false,
      }),
    );
  }
  notifyListeningHistoryChanged({
    type: "optimistic-play",
    track: { id: event.trackId, ...meta },
  });

  void event.request.then((eventId) => {
    if (activeListeningEvent === event) event.eventId = eventId;
  });
}

function sampleListeningProgress() {
  const event = activeListeningEvent;
  if (!event) return;

  const now = globalThis.performance?.now?.() ?? Date.now();
  const mediaTime = getSafeCurrentTime();
  const wallSeconds = Math.max(0, (now - event.lastSampleAt) / 1000);
  const mediaSeconds = mediaTime - event.lastMediaTime;
  event.lastSampleAt = now;
  event.lastMediaTime = mediaTime;

  if (
    playbackPhase === "playing" &&
    mediaSeconds > 0 &&
    mediaSeconds <= Math.max(1.25, wallSeconds * Math.max(audio.playbackRate || 1, 1) * 1.8)
  ) {
    event.listenedSeconds += Math.min(
      mediaSeconds,
      wallSeconds * Math.max(audio.playbackRate || 1, 1) * 1.8 + 0.25,
    );
  }

}

function saveListeningCheckpoint(keepalive = true) {
  const event = activeListeningEvent;
  if (!event) return Promise.resolve();
  if (event.checkpointPromise) return event.checkpointPromise;
  const elapsed = Math.floor(event.listenedSeconds);
  if (elapsed <= event.lastCheckpointSentAt) return Promise.resolve();
  const task = (async () => {
    const eventId = event.eventId ?? await event.request;
    if (!eventId) return;
    await apiRequest(
      `/users/me/listening/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ outcome: "progress", position_seconds: elapsed }),
        ...(keepalive ? { keepalive: true } : {}),
      },
    );
    event.lastCheckpointSentAt = elapsed;
  })().catch((error) => {
    console.warn("[HyperSynced] Listening checkpoint was not saved.", error);
  }).finally(() => {
    event.checkpointPromise = null;
  });
  event.checkpointPromise = task;
  return task;
}

function finishListeningEvent(outcome) {
  const event = activeListeningEvent;
  if (!event) return;

  sampleListeningProgress();
  activeListeningEvent = null;

  void (async () => {
    // If a background checkpoint is already in flight, serialize the final
    // outcome after it so a late progress PATCH cannot overwrite completion.
    if (event.checkpointPromise) {
      await event.checkpointPromise;
    }
    const eventId = event.eventId ?? await event.request;
    if (!eventId) return;
    await apiRequest(
      `/users/me/listening/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          outcome,
          position_seconds: Math.max(0, Math.floor(event.listenedSeconds)),
        }),
        keepalive: true,
      },
    );
    notifyListeningHistoryChanged({ type: "confirmed-outcome" });
  })().catch((error) => {
    console.error("[HyperSynced] Listening history outcome was not saved.", error);
  });
}

function normalizeTrackMeta(
  meta = {},
) {
  return {
    audioUrl:
      meta.audioUrl ??
      meta.audio_url ??
      null,

    artworkUrl:
      meta.artworkUrl ??
      meta.artwork_url ??
      null,

    mimeType:
      meta.mimeType ??
      meta.mime_type ??
      null,

    fileSize:
      meta.fileSize ??
      meta.file_size ??
      null,

    mediaVersion:
      meta.mediaVersion ??
      meta.media_version ??
      null,

    artworkVersion:
      meta.artworkVersion ??
      meta.artwork_version ??
      null,

    durationSeconds:
      meta.durationSeconds ??
      meta.duration_seconds ??
      null,

    catalogTrackId:
      meta.catalogTrackId ??
      meta.catalog_track_id ??
      null,

    title:
      meta.title ??
      "",

    artist:
      meta.artist ??
      "",

    album:
      meta.album ??
      "",

    genre:
      meta.genre ??
      "",

    releaseYear:
      meta.releaseYear ??
      meta.release_year ??
      null,
  };
}


function getSafeCurrentTime() {
  return Number.isFinite(
    audio.currentTime,
  )
    ? Math.max(
        audio.currentTime,
        0,
      )
    : 0;
}


function hasAudioSource() {
  return Boolean(
    audio.currentSrc ||
    audio.getAttribute(
      "src",
    ),
  );
}

function clearQueue() {
  currentQueue =
    [];

  currentQueueIndex =
    -1;

  queueRevision +=
    1;
}

function upcomingQueueCount() {
  if (
    currentQueueIndex < 0
  ) {
    return 0;
  }

  return Math.max(
    currentQueue.length -
      currentQueueIndex -
      1,
    0,
  );
}


function appendRecentContextId(
  ids,
  value,
) {
  const id =
    String(
      value ?? "",
    ).trim();

  if (!id) {
    return;
  }

  const existingIndex =
    ids.indexOf(
      id,
    );

  if (
    existingIndex >= 0
  ) {
    ids.splice(
      existingIndex,
      1,
    );
  }

  ids.push(
    id,
  );
}


function rememberAutoplayTrack(
  trackId,
) {
  const next = [
    ...recentTrackIds,
  ];

  appendRecentContextId(
    next,
    trackId,
  );

  recentTrackIds =
    next.slice(
      -AUTOPLAY_CONTEXT_SIZE,
    );
}


function getAutoplayContextTrackIds() {
  const ids = [];

  for (
    const id
    of recentTrackIds
  ) {
    appendRecentContextId(
      ids,
      id,
    );
  }

  if (
    currentQueue.length >
      0 &&
    currentQueueIndex >= 0
  ) {
    const startIndex =
      Math.max(
        0,
        currentQueueIndex -
          (
            AUTOPLAY_CONTEXT_SIZE -
            1
          ),
      );

    for (
      const entry
      of currentQueue.slice(
        startIndex,
        currentQueueIndex + 1,
      )
    ) {
      appendRecentContextId(
        ids,
        entry?.id,
      );
    }
  }

  if (currentTrackId) {
    appendRecentContextId(
      ids,
      currentTrackId,
    );
  }

  return ids.slice(
    -AUTOPLAY_CONTEXT_SIZE,
  );
}


function ensureCurrentTrackInQueue() {
  if (
    currentQueue.length > 0 ||
    !currentTrackId ||
    !currentTrackMeta
  ) {
    return;
  }

  currentQueue = [
    {
      id:
        String(
          currentTrackId,
        ),

      meta: {
        ...currentTrackMeta,
      },
    },
  ];

  currentQueueIndex =
    0;

  persistQueueSnapshot();
}


function appendAutoplayTracks(
  tracks,
) {
  const beforeLength = currentQueue.length;
  currentQueue = appendAutoplayQueueEntries(currentQueue, tracks);
  const addedCount = currentQueue.length - beforeLength;
  if (!addedCount) return 0;

  persistQueueSnapshot();
  notify();

  // Prepare the upcoming queue while the current song is still playing.
  // This warms up to two upcoming entries, preserving playlist order and never
  // jumping ahead to a recommendation over the user's queued tracks.
  const nextIndex = getNextQueueIndex(currentQueue, currentQueueIndex);
  if (nextIndex >= 0) {
    for (const warmIndex of [nextIndex, nextIndex + 1]) {
      const entry = currentQueue[warmIndex];
      if (!entry) continue;
      void Promise.resolve(
        warmQueuedAudioEntry(entry, { warmBytes: 256 * 1024 }),
      ).catch(() => {});
    }
  }

  return addedCount;
}

async function ensureAutoplayQueue({
  force = false,
} = {}) {
  if (
    !currentTrackId
  ) {
    return 0;
  }


  ensureCurrentTrackInQueue();


  if (
    !force &&
    upcomingQueueCount() >
      AUTOPLAY_REFILL_THRESHOLD
  ) {
    return 0;
  }


  const revision =
    queueRevision;


  if (
    autoplayFill?.revision ===
    revision
  ) {
    return autoplayFill.promise;
  }


  /*
   * Exclude all upcoming tracks plus
   * roughly the previous 24 songs.
   *
   * We intentionally do not exclude
   * everything forever, otherwise a
   * smaller catalog would eventually
   * run out completely.
   */
  const exclusionStart =
    Math.max(
      0,
      currentQueueIndex -
        24,
    );


  const excludeTrackIds =
    [];

  for (
    const id
    of recentTrackIds
  ) {
    appendRecentContextId(
      excludeTrackIds,
      id,
    );
  }

  for (
    const entry
    of currentQueue.slice(
      exclusionStart,
    )
  ) {
    appendRecentContextId(
      excludeTrackIds,
      entry?.id,
    );
  }

  excludeTrackIds.splice(
    0,
    Math.max(
      excludeTrackIds.length -
        100,
      0,
    ),
  );

  const autoplayCurrentTrackId =
    catalogTrackIdOrNull(
      currentTrackMeta
        ?.catalogTrackId,
    ) ??
    catalogTrackIdOrNull(
      currentTrackId,
    );

  const autoplayExcludeTrackIds =
    filterCatalogTrackIds(
      excludeTrackIds,
      100,
    );

  const autoplayContextTrackIds =
    filterCatalogTrackIds(
      getAutoplayContextTrackIds(),
      AUTOPLAY_CONTEXT_SIZE,
    );


  let requestPromise;


  requestPromise =
    (async () => {
      try {
        const tracks =
          await apiRequest(
            "/recommendations/autoplay",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  current_track_id:
                    autoplayCurrentTrackId,

                  exclude_track_ids:
                    autoplayExcludeTrackIds,

                  context_track_ids:
                    autoplayContextTrackIds,

                  limit:
                    AUTOPLAY_BATCH_SIZE,
                }),
            },
          );


        /*
         * The user selected a completely
         * different song/playlist while
         * recommendations were loading.
         */
        if (
          revision !==
          queueRevision
        ) {
          return 0;
        }


        return appendAutoplayTracks(
          Array.isArray(
            tracks,
          )
            ? tracks
            : [],
        );

      } catch {
        /*
         * Autoplay failure should never
         * break ordinary playback.
         */
        return 0;

      } finally {
        if (
          autoplayFill?.promise ===
          requestPromise
        ) {
          autoplayFill =
            null;
        }
      }
    })();


  autoplayFill = {
    revision,
    promise:
      requestPromise,
  };


  return requestPromise;
}

function isExpectedPlayInterruption(
  error,
) {
  if (!error) {
    return false;
  }

  if (
    error.name ===
      "AbortError"
  ) {
    return true;
  }

  const message =
    String(
      error.message ??
        error,
    ).toLowerCase();

  return (
    message.includes(
      "play() request was interrupted",
    ) ||
    message.includes(
      "interrupted by a new load request",
    )
  );
}


function pauseAudioWithCause(cause) {
  if (audio.paused) return false;
  requestedPauseCause = cause;
  audio.pause();
  return true;
}

function setPlaybackPhase(
  phase,
  error = null,
) {
  playbackPhase =
    phase;

  playbackError =
    error;
}


function updateMediaSession(
  state,
) {
  const mediaSession =
    globalThis.navigator
      ?.mediaSession;

  if (!mediaSession) {
    return;
  }

  const identity = mediaSessionIdentity(
    state,
    audio.getAttribute("src"),
  );

  try {
    if (
      identity &&
      typeof globalThis.MediaMetadata ===
        "function"
    ) {
      const album =
        currentTrackMeta
          ?.album ??
        "";

      let artworkSrc =
        null;

      if (state.artworkUrl) {
        try {
          artworkSrc =
            new URL(
              state.artworkUrl,
              globalThis.location
                ?.href ??
                "https://hypersynced.invalid/",
            ).href;
        } catch {
          artworkSrc =
            null;
        }
      }

      const signature =
        JSON.stringify([
          identity,
          state.title,
          state.artist,
          album,
          artworkSrc,
        ]);

      if (
        signature !==
        lastMediaSessionSignature
      ) {
        mediaSession.metadata =
          new globalThis.MediaMetadata({
            title:
              state.title ||
              "Unknown Track",
            artist:
              state.artist ||
              "Unknown Artist",
            album,
            artwork:
              artworkSrc
                ? [
                    {
                      src:
                        artworkSrc,
                    },
                  ]
                : [],
          });

        lastMediaSessionSignature =
          signature;
      }
    } else if (!identity) {
      mediaSession.metadata =
        null;

      lastMediaSessionSignature =
        null;
    }

    mediaSession.playbackState =
      mediaSessionPlaybackState(
        state,
        audio.getAttribute("src"),
      );

    if (
      typeof mediaSession
        .setPositionState ===
        "function" &&
      Number.isFinite(
        state.duration,
      ) &&
      state.duration > 0 &&
      Number.isFinite(
        state.currentTime,
      )
    ) {
      mediaSession.setPositionState({
        duration:
          state.duration,
        playbackRate:
          audio.playbackRate ||
          1,
        position:
          Math.max(
            0,
            Math.min(
              state.currentTime,
              state.duration,
            ),
          ),
      });
    }
  } catch {
    // Media Session support varies by browser.
  }
}


function notify() {
  const state =
    getState();

  updateMediaSession(
    state,
  );

  subscribers.forEach(
    (cb) => {
      try {
        cb(state);
      } catch {
        // Subscriber failures must never
        // interrupt playback.
      }
    },
  );
}


export function subscribe(
  cb,
) {
  subscribers.add(
    cb,
  );

  try {
    cb(
      getState(),
    );
  } catch {
    // Ignore subscriber errors.
  }

  return () => {
    subscribers.delete(
      cb,
    );
  };
}


export function getState() {
  return {
    trackId:
      currentTrackId,

    src:
      audio.currentSrc ||
      null,

    paused:
      audio.paused,

    shuffleEnabled:
      shuffleModeEnabled,

    phase:
      playbackPhase,

    error:
      playbackError,

    lastPauseCause,

    currentTime:
      currentTrackId && (
        loadedAudioTrackId !== currentTrackId ||
        restoredTimeSeconds > 0
      )
        ? Math.max(0, Number(restoredTimeSeconds) || 0)
        : getSafeCurrentTime(),

    duration:
      Number.isFinite(
        audio.duration,
      ) && audio.duration > 0
        ? audio.duration
        : Number(currentTrackMeta?.durationSeconds) || 0,

    volume:
      audio.volume,

    muted:
      audio.muted,

    artworkUrl:
      currentArtworkUrl,

    audioUrl:
      currentTrackMeta?.audioUrl ?? null,

    title:
      currentTrackTitle,

    artist:
      currentTrackArtist,

    album:
      currentTrackMeta?.album ??
      "",

    genre:
      currentTrackMeta?.genre ??
      "",

    releaseYear:
      currentTrackMeta?.releaseYear ??
      null,

    mimeType:
      currentTrackMeta?.mimeType ??
      null,

    fileSize:
      currentTrackMeta?.fileSize ??
      null,

    mediaVersion:
      currentTrackMeta?.mediaVersion ??
      null,

    artworkVersion:
      currentTrackMeta?.artworkVersion ??
      null,

    durationSeconds:
      currentTrackMeta?.durationSeconds ??
      null,

    catalogTrackId:
      currentTrackMeta?.catalogTrackId ??
      null,

    queue:
      currentQueue,

    queueIndex:
      currentQueueIndex,
  };
}


async function playNextQueueTrack() {
  if (
    nextTrackTransitionPromise
  ) {
    return nextTrackTransitionPromise;
  }

  let transitionPromise;

  transitionPromise =
    (async () => {
      let nextIndex =
        getNextQueueIndex(
          currentQueue,
          currentQueueIndex,
        );


      /*
       * Autoplay is normally filled while
       * the current song is still playing.
       * This forced refill is only the
       * final safety net for a brand-new
       * single-track playback context.
       */
      if (
        nextIndex === -1
      ) {
        await ensureAutoplayQueue({
          force:
            true,
        });

        nextIndex =
          getNextQueueIndex(
            currentQueue,
            currentQueueIndex,
          );
      }


      if (
        nextIndex === -1
      ) {
        notify();

        return false;
      }


      currentQueueIndex =
        nextIndex;


      const nextTrack =
        currentQueue[
          nextIndex
        ];


      try {
        const state =
          await playTrackInternal(
            nextTrack.id,
            nextTrack.meta,
            true,
          );

        /*
         * Keep several songs ready ahead of
         * the active one. That makes the
         * natural ended -> next transition
         * immediate regardless of which page
         * originally started playback.
         */
        void ensureAutoplayQueue()
          .catch(
            () => {},
          );

        return Boolean(
          state,
        );

      } catch (error) {
        if (
          !isExpectedPlayInterruption(
            error,
          )
        ) {
          notify();
        }

        return false;
      }
    })()
      .finally(
        () => {
          if (
            nextTrackTransitionPromise ===
              transitionPromise
          ) {
            nextTrackTransitionPromise =
              null;
          }
        },
      );

  nextTrackTransitionPromise =
    transitionPromise;

  return transitionPromise;
}


function attachEvents() {
  audio.addEventListener(
    "loadstart",
    () => {
      if (currentTrackId) {
        setPlaybackPhase(
          "loading",
        );
      }

      notify();
    },
  );


  audio.addEventListener(
    "playing",
    () => {
      // Keep the saved position as the UI source of truth until the live
      // clock has demonstrably advanced from the restored point. A "playing"
      // event alone is not proof: some browsers briefly report the song end.
      const restoredTarget = Math.max(0, Number(restoredTimeSeconds) || 0);
      const mediaClock = Number(audio.currentTime) || 0;
      if (restoredTarget > 0) {
        if (
          shouldCorrectRestoredPlaybackClock(
            restoredTarget,
            mediaClock,
            audio.duration,
          )
        ) {
          try {
            audio.currentTime = restoredTarget;
          } catch {
            // Keep the fallback active and retry on subsequent clock updates.
          }
          restoredClockPreviousSeconds = restoredTarget;
        } else {
          restoredClockPreviousSeconds = mediaClock;
        }
        restoredClockProgressTicks = 0;
      }
      setPlaybackPhase(
        "playing",
      );

      // Listening history starts only after the browser confirms audible playback.
      if (
        currentTrackId &&
        currentTrackMeta &&
        shouldBeginListeningEvent(activeListeningEvent?.trackId, currentTrackId)
      ) {
        if (activeListeningEvent) finishListeningEvent("skipped");
        beginListeningEvent(currentTrackId, currentTrackMeta);
        void recordTrackPlayback(currentTrackId, currentTrackMeta).catch(() => {});
      }

      notify();
    },
  );


  audio.addEventListener(
    "play",
    () => {
      if (
        playbackPhase !==
        "playing"
      ) {
        setPlaybackPhase(
          "loading",
        );
      }

      notify();
    },
  );


  audio.addEventListener(
    "pause",
    () => {
      const previousPhase = playbackPhase;
      const cause = requestedPauseCause ?? (previousPhase === "loading" ? "source-change" : "external-browser-or-device");
      requestedPauseCause = null;
      lastPauseCause = {
        cause,
        trackId: currentTrackId,
        previousPhase,
        positionSeconds: getSafeCurrentTime(),
        timestamp: Date.now(),
        visibility: globalThis.document?.visibilityState ?? "unknown",
        readyState: audio.readyState,
        networkState: audio.networkState,
        mediaError: audio.error?.code ?? null,
      };
      if (cause === "external-browser-or-device") {
        console.warn("[HyperSynced] Playback paused outside an app pause request. Diagnostic:", lastPauseCause);
      }
      if (unexpectedPauseRecoveryTimer) {
        globalThis.clearTimeout(unexpectedPauseRecoveryTimer);
        unexpectedPauseRecoveryTimer = null;
      }
      sampleListeningProgress();
      // Preserve the pause point and current history event. Only recover
      // unexpected pauses while the app is visible; explicit pause requests
      // and source-change pauses never auto-resume.
      if ((currentTrackId || audio.currentSrc) && playbackPhase !== "loading") {
        setPlaybackPhase("paused");
      }
      const trackAtPause = currentTrackId;
      if (
        cause === "external-browser-or-device" &&
        previousPhase === "playing" &&
        trackAtPause &&
        globalThis.document?.visibilityState === "visible" &&
        hasAudioSource() &&
        unexpectedPauseRecoveryTrackId === trackAtPause &&
        unexpectedPauseRecoveryAttempts < MAX_UNEXPECTED_PAUSE_RECOVERIES
      ) {
        unexpectedPauseRecoveryTimer = globalThis.setTimeout(() => {
          unexpectedPauseRecoveryTimer = null;
          if (
            currentTrackId !== trackAtPause ||
            !audio.paused ||
            playbackPhase !== "paused" ||
            globalThis.document?.visibilityState !== "visible"
          ) return;
          unexpectedPauseRecoveryAttempts += 1;
          setPlaybackPhase("loading");
          notify();
          void togglePlay().catch((error) => {
            if (currentTrackId !== trackAtPause) return;
            setPlaybackPhase("error", error instanceof Error ? error.message : "Playback recovery failed.");
            notify();
          });
        }, 1200);
      }
      notify();
    },
  );


  audio.addEventListener(
    "waiting",
    () => {
      if (!audio.paused) {
        setPlaybackPhase(
          "buffering",
        );
      }

      notify();
    },
  );


  audio.addEventListener(
    "stalled",
    () => {
      if (!audio.paused) {
        setPlaybackPhase(
          "buffering",
        );
      }

      notify();
    },
  );


  audio.addEventListener(
    "seeking",
    () => {
      setPlaybackPhase(
        "buffering",
      );

      notify();
    },
  );


  audio.addEventListener(
    "seeked",
    () => {
      // The seek may land correctly while the browser's clock is still
      // settling. Do not release the saved-position display on seeked alone.
      setPlaybackPhase(
        audio.paused
          ? "paused"
          : "playing",
      );

      notify();
    },
  );


  [
    "timeupdate",
    "durationchange",
    "volumechange",
    "loadedmetadata",
  ].forEach(
    (eventName) => {
      audio.addEventListener(
        eventName,
        () => {
          if (eventName === "timeupdate" && restoredTimeSeconds > 0) {
            const liveClock = Number(audio.currentTime) || 0;
            const restoredTarget = Math.max(0, Number(restoredTimeSeconds) || 0);
            if (
              shouldCorrectRestoredPlaybackClock(
                restoredTarget,
                liveClock,
                audio.duration,
              )
            ) {
              try {
                audio.currentTime = restoredTarget;
              } catch {
                // Fallback remains authoritative; try again on later updates.
              }
            } else if (
              loadedAudioTrackId === currentTrackId &&
              hasAudioSource() &&
              !audio.paused
            ) {
              const previousClock = Number.isFinite(restoredClockPreviousSeconds)
                ? restoredClockPreviousSeconds
                : restoredTarget;
              if (
                isRestoredClockProgressing(
                  previousClock,
                  liveClock,
                  restoredTarget,
                  audio.duration,
                )
              ) {
                restoredClockProgressTicks += 1;
              } else {
                restoredClockProgressTicks = 0;
              }
              restoredClockPreviousSeconds = liveClock;

              if (
                restoredClockProgressTicks >= 2 &&
                shouldReleaseRestoredPosition(
                  restoredTarget,
                  liveClock,
                  audio.paused,
                  audio.duration,
                )
              ) {
                restoredTimeSeconds = 0;
                restoredClockPreviousSeconds = null;
                restoredClockProgressTicks = 0;
              }
            } else {
              restoredClockPreviousSeconds = liveClock;
              restoredClockProgressTicks = 0;
            }
          }
          notify();
        },
      );
    },
  );

    audio.addEventListener(
    "timeupdate",
    () => {
      sampleListeningProgress();
      prefetchNextTrackLyrics();
      warmNextTrackFirstChunk();
    },
  );


  audio.addEventListener(
    "volumechange",
    () => {

    },
  );

  audio.addEventListener(
    "error",
    () => {
      setPlaybackPhase(
        "error",
        audio.error?.message ??
          "Audio playback failed.",
      );

      notify();
    },
  );


  audio.addEventListener(
  "ended",
  () => {
    finishListeningEvent(
      "completed",
      Number.isFinite(
        audio.duration,
      )
        ? audio.duration
        : getSafeCurrentTime(),
    );


    void playNextQueueTrack()
      .catch(
        () => {},
      );
  },
);
}


attachEvents();


function handleBackgroundPlaybackLifecycle() {
  const hidden =
    globalThis.document
      ?.visibilityState ===
      "hidden";

  if (hidden) {
    sampleListeningProgress();
    void saveListeningCheckpoint(true);
  }

  updateMediaSession(
    getState(),
  );

  if (
    currentTrackId &&
    !audio.paused
  ) {
    void ensureAutoplayQueue()
      .catch(
        () => {},
      );

    if (hidden) {
      void Promise.resolve(
        warmCurrentTrackForResume(),
      ).catch(
        () => {},
      );
    }
  }

  if (!hidden) {
    notify();
  }
}


if (
  globalThis.document
    ?.addEventListener
) {
  globalThis.document.addEventListener(
    "visibilitychange",
    handleBackgroundPlaybackLifecycle,
  );
}

if (
  globalThis.addEventListener
) {
  globalThis.addEventListener(
    "pagehide",
    handleBackgroundPlaybackLifecycle,
  );

  globalThis.addEventListener(
    "pageshow",
    handleBackgroundPlaybackLifecycle,
  );
}


function warmCurrentTrackForResume(positionOverride = null) {
  if (
    !currentTrackId ||
    !currentTrackMeta
  ) {
    return null;
  }

  const mediaVersion =
    currentTrackMeta
      .mediaVersion ??
    currentTrackMeta
      .media_version ??
    null;

  if (!mediaVersion) {
    return null;
  }

  const position =
    positionOverride === null || positionOverride === undefined
      ? getSafeCurrentTime()
      : Math.max(0, Number(positionOverride) || 0);

  const duration =
    Number.isFinite(
      audio.duration,
    ) &&
    audio.duration > 0
      ? audio.duration
      : Number(
          currentTrackMeta
            .durationSeconds ??
          currentTrackMeta
            .duration_seconds ??
          0,
        );

  const taskKey = [
    currentTrackId,
    mediaVersion,
    Math.floor(
      position /
      20,
    ),
  ].join(
    ":",
  );

  if (
    warmPlaybackTask &&
    warmPlaybackTaskKey ===
      taskKey
  ) {
    return warmPlaybackTask;
  }

  const useStableMediaRoute =
    Boolean(
      globalThis.navigator
        ?.serviceWorker
        ?.controller,
    );

  warmPlaybackTaskKey =
    taskKey;

  warmPlaybackTask =
    warmTrackPlayback(
      currentTrackId,
      currentTrackMeta,
      {
        positionSeconds:
          position,

        durationSeconds:
          duration,

        useStableMediaRoute,
      },
    )
      .catch(
        () => null,
      )
      .finally(
        () => {
          if (
            warmPlaybackTaskKey ===
              taskKey
          ) {
            warmPlaybackTask =
              null;

            warmPlaybackTaskKey =
              null;
          }
        },
      );

  return warmPlaybackTask;
}


function loadAudioSource(
  url,
  trackId =
    currentTrackId,
) {
  if (
    activeObjectUrl &&
    activeObjectUrl !==
      url &&
    typeof globalThis.URL
      ?.revokeObjectURL ===
      "function"
  ) {
    globalThis.URL
      .revokeObjectURL(
        activeObjectUrl,
      );
  }

  activeObjectUrl =
    typeof url ===
      "string" &&
    url.startsWith(
      "blob:",
    )
      ? url
      : null;

  loadedAudioTrackId =
    trackId === null ||
    trackId === undefined
      ? null
      : (
          String(
            trackId,
          ).trim()
          || null
        );

  // Replacing the source pauses the previous media element by design.
  if (!audio.paused) requestedPauseCause = "source-transition";
  audio.src =
    url;
}


async function ensureCurrentTrackSource() {
  /*
   * If a restore is already preparing
   * the source, a fast Play click should
   * wait for that same operation.
   */
  const currentId =
    currentTrackId === null ||
    currentTrackId === undefined
      ? null
      : String(
          currentTrackId,
        );

  if (
    sourcePreparationPromise &&
    sourcePreparationTrackId ===
      currentId
  ) {
    return sourcePreparationPromise;
  }

  if (
    sourcePreparationPromise &&
    sourcePreparationTrackId !==
      currentId
  ) {
    cancelActivePlaybackSession();

    sourcePreparationPromise =
      null;

    sourcePreparationTrackId =
      null;
  }

  if (
    canReuseLoadedAudioSource({
      logicalTrackId:
        currentTrackId,
      loadedTrackId:
        loadedAudioTrackId,
      hasSource:
        hasAudioSource(),
    }) ||
    !currentTrackId ||
    !currentTrackMeta
  ) {
    return null;
  }


  const requestedTrackId =
    currentTrackId;

  const requestedMeta =
    currentTrackMeta;

  const requestedTime =
    restoredTimeSeconds;


  const session =
    beginPlaybackSession(
      requestedTrackId,
    );


  sourcePreparationPromise =
    (async () => {
      const useStableMediaRoute =
        Boolean(
          globalThis.navigator
            ?.serviceWorker
            ?.controller,
        );


      const audioSource =
        await prepareTrackAudioSource(
          requestedTrackId,
          requestedMeta,
          {
            useStableMediaRoute,
            preferCachedBlob:
              !useStableMediaRoute &&
              globalThis.navigator
                ?.onLine ===
                false,
          },
        );


      if (
        !isPlaybackSessionCurrent(
          session,
        ) ||
        currentTrackId !==
          requestedTrackId
      ) {
        return null;
      }


      const url =
        resolveMediaUrl(
          audioSource,
        );


      if (!url) {
        throw new Error(
          "Unable to restore the track audio source.",
        );
      }


      loadAudioSource(
        url,
        requestedTrackId,
      );


      /*
       * If we have a saved position,
       * wait until seeking is legal before
       * resolving. That prevents a very
       * quick Play click from briefly
       * starting at 0:00.
       */
      if (
        requestedTime >
        0
      ) {
        await new Promise(
          (
            resolve,
            reject,
          ) => {
            const cleanup =
              () => {
                audio.removeEventListener(
                  "loadedmetadata",
                  handleLoaded,
                );

                audio.removeEventListener(
                  "error",
                  handleError,
                );
              };


            const handleLoaded =
              () => {
                cleanup();

                if (
                  !isPlaybackSessionCurrent(
                    session,
                  )
                ) {
                  resolve();
                  return;
                }

                const maximum =
                  Number.isFinite(
                    audio.duration,
                  )
                    ? audio.duration
                    : requestedTime;

                try {
                  audio.currentTime =
                    Math.max(
                      0,
                      Math.min(
                        requestedTime,
                        maximum,
                      ),
                    );
                } catch {
                  // Some browsers may reject
                  // an early seek. Playback
                  // can still continue.
                }

                resolve();
              };


            const handleError =
              () => {
                cleanup();

                reject(
                  new Error(
                    "Unable to preload the restored track.",
                  ),
                );
              };


            audio.addEventListener(
              "loadedmetadata",
              handleLoaded,
              {
                once:
                  true,
              },
            );

            audio.addEventListener(
              "error",
              handleError,
              {
                once:
                  true,
              },
            );


            audio.load();


            if (
              audio.readyState >=
              1
            ) {
              handleLoaded();
            }
          },
        );

      } else {
        audio.load();
      }


      if (
        !isPlaybackSessionCurrent(
          session,
        ) ||
        currentTrackId !==
          requestedTrackId
      ) {
        return null;
      }


      setPlaybackPhase(
        "paused",
      );

      notify();

      return getState();
    })();

  sourcePreparationTrackId =
    requestedTrackId;

  const trackedPromise =
    sourcePreparationPromise;

  sourcePreparationPromise =
    trackedPromise.finally(
      () => {
        if (
          sourcePreparationTrackId ===
            requestedTrackId
        ) {
          sourcePreparationPromise =
            null;

          sourcePreparationTrackId =
            null;
        }
      },
    );


  return sourcePreparationPromise;
}


function applyTrackMetadata(
  trackId,
  meta,
) {
  const normalizedMeta =
    normalizeTrackMeta(
      meta,
    );

  const nextTrackId = String(trackId);
  if (unexpectedPauseRecoveryTrackId !== nextTrackId) {
    unexpectedPauseRecoveryTrackId = nextTrackId;
    unexpectedPauseRecoveryAttempts = 0;
    if (unexpectedPauseRecoveryTimer) {
      globalThis.clearTimeout(unexpectedPauseRecoveryTimer);
      unexpectedPauseRecoveryTimer = null;
    }
  }
  currentTrackId = nextTrackId;

  currentTrackMeta =
    normalizedMeta;

  currentArtworkUrl =
    normalizedMeta.artworkUrl;

  currentTrackTitle =
    normalizedMeta.title;

  currentTrackArtist =
    normalizedMeta.artist;

  restoredTimeSeconds =
    0;

  setPlaybackPhase(
    "loading",
  );

  /*
   * Save the selected track immediately.
   * This means even an immediate refresh
   * still restores the player bar.
   */

  notify();
}


async function playTrackInternal(
  trackId,
  meta = {},
  keepQueue = false,
) {
  if (!trackId) {
    return null;
  }


  const session =
    beginPlaybackSession(
      trackId,
    );


  if (!keepQueue) {
    clearQueue();
  }


  /*
   * Updating the metadata immediately
   * gives the UI instant feedback after
   * the user selects a song.
   *
   * The playback session prevents an
   * older async request from later
   * taking ownership of the player.
   */
  applyTrackMetadata(
    trackId,
    meta,
  );

  if (!keepQueue) {
    ensureCurrentTrackInQueue();
  } else if (currentQueue[currentQueueIndex]) {
    currentQueue[currentQueueIndex] = {
      ...currentQueue[currentQueueIndex],
      meta: normalizeTrackMeta(meta),
    };
    persistQueueSnapshot();
  }

  // A source transition pauses the old Audio source as part of loading.
  // Keep the state in "loading" so that expected source-change pause events
  // don't appear as an unsolicited user pause.
  setPlaybackPhase("loading");

  // Publish the current row immediately, before media preparation or
  // recommendation requests have completed.
  notify();

  let playbackMeta =
    normalizeTrackMeta(
      meta,
    );

  const useStableMediaRoute =
    Boolean(
      globalThis.navigator
        ?.serviceWorker
        ?.controller,
    );


  let audioSource;

  try {
    audioSource =
      await prepareTrackAudioSource(
        trackId,
        playbackMeta,
        {
          useStableMediaRoute,
          preferCachedBlob:
            !useStableMediaRoute &&
            globalThis.navigator
              ?.onLine ===
              false,
        },
      );
  } catch (error) {
    if (
      !isPlaybackSessionCurrent(
        session,
      )
    ) {
      return null;
    }

    setPlaybackPhase(
      "error",
      error instanceof Error
        ? error.message
        : "Unable to prepare playback.",
    );

    notify();

    throw error;
  }


  /*
   * A newer song was selected while
   * this one was preparing.
   *
   * From this point onward the stale
   * request is not allowed to touch the
   * shared Audio element.
   */
  if (
    !isPlaybackSessionCurrent(
      session,
    )
  ) {
    return null;
  }


  const url =
    resolveMediaUrl(
      audioSource,
    );


  if (!url) {
    const error =
      new Error(
        "Unable to resolve the track audio source.",
      );

    setPlaybackPhase(
      "error",
      error.message,
    );

    notify();

    throw error;
  }


  loadAudioSource(
    url,
    trackId,
  );

  audio.load();


  try {
    await audio.play();
  } catch (error) {
    /*
     * Changing audio.src for a newer playback request can reject a stale
     * play() promise. Ignore that expected interruption. For a current track,
     * reset the media element once and retry before exposing a playback error.
     */
    if (
      !isPlaybackSessionCurrent(session) ||
      isExpectedPlayInterruption(error)
    ) {
      return null;
    }

    try {
      audio.load();
      await audio.play();
    } catch (retryError) {
      if (
        !isPlaybackSessionCurrent(session) ||
        isExpectedPlayInterruption(retryError)
      ) {
        return null;
      }

      const message = retryError instanceof Error
        ? retryError.message
        : error instanceof Error
          ? error.message
          : "Unable to start playback.";
      setPlaybackPhase("error", message);
      notify();
      throw retryError;
    }
  }


  if (
    !isPlaybackSessionCurrent(
      session,
    )
  ) {
    return null;
  }

rememberAutoplayTrack(
  trackId,
);

return getState();
}


export async function playTrack(
  trackId,
  meta = {},
) {


  finishListeningEvent(
  "skipped",
  getSafeCurrentTime(),
);
  const state =
    await playTrackInternal(
      trackId,
      meta,
      false,
    );


  void ensureAutoplayQueue({
    force:
      true,
  }).catch(
    () => {},
  );


  return state;
}

// Seed an idle queue from the Home recommendations without auto-playing.
export function seedQueueFromSuggestions(tracks) {
  if (currentTrackId || currentQueue.length || !Array.isArray(tracks)) return false;
  const seededQueue = buildTrackQueue(tracks);
  if (!seededQueue.length) return false;
  currentQueue = seededQueue;
  currentQueueIndex = -1;
  queueRevision += 1;
  persistQueueSnapshot();
  notify();
  return true;
}

export async function playQueueIndex(
  index,
) {
  const track =
    getQueueTrackAtIndex(
      currentQueue,
      index,
    );

  if (!track) {
    return false;
  }


  finishListeningEvent(
  "skipped",
  getSafeCurrentTime(),
);


  currentQueueIndex =
    index;

  persistQueueSnapshot();

  try {
    const state =
      await playTrackInternal(
        track.id,
        track.meta,
        true,
      );


    notify();


    void ensureAutoplayQueue()
      .catch(
        () => {},
      );


    return state ??
      false;

  } catch (error) {
    notify();

    throw error;
  }
}

export async function playTrackQueue(
  tracks,
  startIndex = 0,
) {
  const queue =
    buildTrackQueue(
      tracks,
    );


  if (
    queue.length ===
    0
  ) {
    cancelActivePlaybackSession();

    clearQueue();
    persistQueueSnapshot();

    return null;
  }


  const requestedIndex =
    Number.isInteger(
      startIndex,
    )
      ? startIndex
      : 0;


  const safeIndex =
    Math.min(
      Math.max(
        requestedIndex,
        0,
      ),
      queue.length - 1,
    );


  queueRevision +=
    1;


  currentQueue =
    queue;

  currentQueueIndex =
    safeIndex;

  persistQueueSnapshot();

  const track =
    currentQueue[
      currentQueueIndex
    ];


  finishListeningEvent(
    "skipped",
    getSafeCurrentTime(),
  );


  const state =
    await playTrackInternal(
      track.id,
      track.meta,
      true,
    );


  void ensureAutoplayQueue()
    .catch(
      () => {},
    );


  return state;
}

export function playTrackNext(
  track,
) {
  const entries =
    buildTrackQueue([
      track,
    ]);

  const entry =
    entries[0];

  if (!entry) {
    return false;
  }

  /*
   * Manual queue choices always win over
   * autoplay. If the current song started
   * outside a queue, materialize it first
   * so "Play next" has a stable insertion
   * point.
   */
  ensureCurrentTrackInQueue();

  currentQueue =
    insertQueueEntryAsNext(
      currentQueue,
      currentQueueIndex,
      entry,
    );

  persistQueueSnapshot();

  /*
   * Any recommendation request that began
   * before this manual edit is stale. Its
   * response will be ignored by the
   * revision guard in ensureAutoplayQueue.
   */
  queueRevision +=
    1;

  notify();

  void Promise.resolve(
    warmQueuedAudioEntry(
      entry,
    ),
  ).catch(
    () => {},
  );

  return true;
}


export function shuffleUpcomingQueue(){if(!currentQueue.length)return false;const pinned=currentQueueIndex>=0&&currentQueueIndex<currentQueue.length?currentQueue[currentQueueIndex]:null;const next=currentQueue.slice(pinned?currentQueueIndex+1:0);for(let i=next.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[next[i],next[j]]=[next[j],next[i]];}currentQueue=pinned?[pinned,...next]:next;currentQueueIndex=pinned?0:-1;queueRevision+=1;persistQueueSnapshot();notify();return next.length>1;}
export function toggleUpcomingQueueShuffle(){if(!currentQueue.length)return false;if(shuffleModeEnabled){shuffleModeEnabled=false;queueRevision+=1;persistQueueSnapshot();notify();return false;}if(currentQueue.length-(currentQueueIndex>=0?currentQueueIndex+1:0)<2)return false;shuffleModeEnabled=true;shuffleUpcomingQueue();return true;}
export function reorderQueueFromCollection(
  tracks,
  currentTrackId,
) {
  const sortedEntries = buildTrackQueue(tracks);
  const activeId = String(currentTrackId ?? "");
  if (!activeId || !sortedEntries.some((entry) => String(entry.id) === activeId)) {
    return false;
  }
  currentQueue = sortedEntries;
  currentQueueIndex = sortedEntries.findIndex((entry) => String(entry.id) === activeId);
  queueRevision += 1;
  persistQueueSnapshot();
  notify();
  return true;
}

export function clearUpcomingQueue(){if(!currentQueue.length)return false;if(currentQueueIndex>=0&&currentQueueIndex<currentQueue.length){currentQueue=[currentQueue[currentQueueIndex]];currentQueueIndex=0;}else{currentQueue=[];currentQueueIndex=-1;}queueRevision+=1;persistQueueSnapshot();notify();return true;}
export function addTrackToQueue(
  track,
) {
  const entries =
    buildTrackQueue([
      track,
    ]);

  const entry =
    entries[0];

  if (!entry) {
    return false;
  }

  ensureCurrentTrackInQueue();

  currentQueue =
    appendQueueEntry(
      currentQueue,
      currentQueueIndex,
      entry,
    );

  persistQueueSnapshot();

  queueRevision +=
    1;

  notify();

  void Promise.resolve(
    warmQueuedAudioEntry(
      entry,
    ),
  ).catch(
    () => {},
  );

  return true;
}

export async function playUrl(
  url,
  meta = {},
) {


  if (!url) {
    return null;
  }


  const session =
    beginPlaybackSession(
      null,
    );


  clearQueue();
  persistQueueSnapshot();


  const {
    artworkUrl = null,
    title = "",
    artist = "",
  } = meta;


  currentTrackId =
    null;

  currentTrackMeta =
  null;

  restoredTimeSeconds =
  0;
currentArtworkUrl =
    artworkUrl;

  currentTrackTitle =
    title;

  currentTrackArtist =
    artist;


  setPlaybackPhase(
    "loading",
  );

  notify();


  const mediaUrl =
    resolveMediaUrl(
      url,
    );


  if (
    !isPlaybackSessionCurrent(
      session,
    )
  ) {
    return null;
  }


  loadAudioSource(
    mediaUrl,
    null,
  );

  audio.load();


  try {
    await audio.play();
  } catch (error) {
    if (
      !isPlaybackSessionCurrent(
        session,
      ) ||
      isExpectedPlayInterruption(
        error,
      )
    ) {
      return null;
    }

    setPlaybackPhase(
      "error",
      error instanceof Error
        ? error.message
        : "Unable to start playback.",
    );

    notify();

    throw error;
  }


  if (
    !isPlaybackSessionCurrent(
      session,
    )
  ) {
    return null;
  }


  return getState();
}


export async function togglePlay() {


  if (audio.paused) {
    /*
     * Normally this has already been
     * preloaded during restoration.
     *
     * If the user clicks extremely fast,
     * or preload previously failed,
     * prepare it now.
     */
    await ensureCurrentTrackSource();

    // A restored saved position must be applied to the real media clock
    // before play() is invoked. Otherwise browsers can start at a stale
    // duration/end position while the UI temporarily shows the saved time.
    if (restoredTimeSeconds > 0 && currentTrackId && loadedAudioTrackId === currentTrackId) {
      const restoredPositionApplied = await applyRestoredPlaybackPosition(
        currentTrackId,
        restoredTimeSeconds,
      );
      if (!restoredPositionApplied) {
        // Keep the saved position as the UI source of truth; don't let a
        // stale media clock jump to the end before a successful restore seek.
        notify();
      }
    }

    if (
      !hasAudioSource()
    ) {
      return getState();
    }


    setPlaybackPhase(
      "loading",
    );

    notify();

    try {
      await audio.play();
    } catch (error) {
      if (
        !isExpectedPlayInterruption(
          error,
        )
      ) {
        throw error;
      }

      return getState();
    }

  } else {
    pauseAudioWithCause("player-toggle");

    /*
     * Do not make pause wait on network.
     * Warm the resume window in the
     * background for the next Play tap.
     */
    void warmCurrentTrackForResume();
  }


  return getState();
}


export function pausePlayback(cause = "pause-playback-api") {
  return silenceLocalPlayback(cause);
}


export function silenceLocalPlayback(cause = "pause-playback-api") {
  pauseAudioWithCause(cause);

  /*
   * Keep this exact pause point hot for
   * two hours. The Audio element remains
   * attached, and the nearby media bytes
   * are also persisted through the
   * service worker cache.
   */
  void warmCurrentTrackForResume();


  if (
    currentTrackId ||
    hasAudioSource()
  ) {
    setPlaybackPhase(
      "paused",
    );
  }
notify();

  return getState();
}




export function setPlaybackPersistenceOwner(userId) {
  const nextOwner = String(userId ?? "").trim() || null;
  if (activePlaybackOwnerId === nextOwner) return;

  // Never let the previous account's in-memory player leak into the next
  // account while its own database state is being restored.
  if (activePlaybackOwnerId !== nextOwner) {
    cancelActivePlaybackSession();
    pauseAudioWithCause("account-owner-change");
    clearQueue();
    audio.removeAttribute("src");
    audio.load();
    currentTrackId = null;
    currentTrackMeta = null;
    currentArtworkUrl = null;
    currentTrackTitle = "";
    currentTrackArtist = "";
    restoredTimeSeconds = 0;
    setPlaybackPhase("idle");
    notify();
  }

  // Playback restoration is driven by this device's local playback snapshot.
  activePlaybackOwnerId = nextOwner;
  setOfflineListeningOwner(nextOwner);

  const cachedQueue = readPlayerQueueSnapshot(nextOwner);
  if (cachedQueue) {
    currentQueue = cachedQueue.queue;
    currentQueueIndex = cachedQueue.queueIndex;
  }

  notify();
}


async function applyRestoredPlaybackPosition(trackId, positionSeconds) {
  if (currentTrackId !== trackId || loadedAudioTrackId !== trackId || !hasAudioSource()) {
    return false;
  }

  if (audio.readyState < 1) {
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener("loadedmetadata", handleLoaded);
        audio.removeEventListener("error", handleError);
      };
      const handleLoaded = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("Unable to load the restored track metadata."));
      };
      audio.addEventListener("loadedmetadata", handleLoaded, { once: true });
      audio.addEventListener("error", handleError, { once: true });
      if (audio.readyState >= 1) handleLoaded();
    });
  }

  if (currentTrackId !== trackId || loadedAudioTrackId !== trackId || !hasAudioSource()) {
    return false;
  }

  const requestedTime = Math.max(0, Number(positionSeconds) || 0);
  const maximum = Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : requestedTime;
  const targetTime = Math.max(0, Math.min(requestedTime, maximum));

  // Keep the saved position authoritative in the UI until the browser has
  // completed the seek. Some browsers briefly expose the previous/end position
  // after metadata loads, even though the seek assignment is accepted.
  if (Math.abs((Number(audio.currentTime) || 0) - targetTime) > 0.25) {
    try {
      audio.currentTime = targetTime;
    } catch {
      return false;
    }

    if (audio.seeking) {
      await new Promise((resolve) => {
        let timeoutId;
        const finish = () => {
          if (timeoutId) globalThis.clearTimeout(timeoutId);
          audio.removeEventListener("seeked", finish);
          audio.removeEventListener("error", finish);
          resolve();
        };
        audio.addEventListener("seeked", finish, { once: true });
        audio.addEventListener("error", finish, { once: true });
        timeoutId = globalThis.setTimeout(finish, 1500);
        // Close the race where the seek finishes between the check and listener.
        if (!audio.seeking || Math.abs((Number(audio.currentTime) || 0) - targetTime) <= 0.25) finish();
      });
    }
  }

  if (currentTrackId !== trackId || loadedAudioTrackId !== trackId) return false;
  if (Math.abs((Number(audio.currentTime) || 0) - targetTime) > 1) return false;
  // Keep the restored position authoritative while paused. Some browsers can
  // report a stale/end currentTime again after a successful seek during refresh.
  // The live audio clock becomes authoritative only after playback resumes.
  return true;
}

export function restoreCachedTrackMetadata(track, positionSeconds = 0) {
  if (!track?.id) return null;

  const restoringTrackId = String(track.id);
  pauseAudioWithCause("restore-cached-metadata");
  cancelActivePlaybackSession();

  // Restore the cached queue immediately when it belongs to this track.
  // Otherwise start with the current track and refill recommendations quietly.
  restoreQueueForTrack(restoringTrackId, track);

  // Restore only display metadata and the saved position. No stale or
  // expiring audio URL is persisted in the browser snapshot.
  applyTrackMetadata(restoringTrackId, track);
  restoredTimeSeconds = Math.max(0, Number(positionSeconds) || 0);
  restoredClockPreviousSeconds = null;
  restoredClockProgressTicks = 0;
  setPlaybackPhase("paused");
  notify();
  return getState();
}


export async function restoreTrackPaused(track, positionSeconds = 0) {
  if (!track?.id) return null;
  const restoringTrackId = String(track.id);
  cancelActivePlaybackSession();

  // Keep the cached upcoming queue when it contains the authoritative track.
  // A different remote track rebases the queue without showing stale entries.
  restoreQueueForTrack(restoringTrackId, track);

  // A database restore is authoritative even when this tab already has the
  // same track loaded. Pause first so a remote restore can never keep playing.
  pauseAudioWithCause("restore-track-paused");
  applyTrackMetadata(restoringTrackId, track);
  restoredTimeSeconds = Math.max(0, Number(positionSeconds) || 0);

  // Refill a short or newly rebased queue in the background. The current
  // track is already visible and this request never delays paused restore.
  void ensureAutoplayQueue({ force: true }).catch(() => {});

  // Start fetching the saved-position audio window immediately, in parallel
  // with source setup. This gives the cache a head start before the user taps Play.
  void Promise.resolve(
    warmCurrentTrackForResume(positionSeconds),
  ).catch(() => {});

  try {
    await ensureCurrentTrackSource();
    await applyRestoredPlaybackPosition(
      restoringTrackId,
      positionSeconds,
    );

    // Audio source restoration gets priority; queue recommendations refresh
    // only after the saved track is ready.
    void ensureAutoplayQueue({ force: true }).catch(() => {});

    if (currentTrackId === restoringTrackId) {
      setPlaybackPhase("paused");
      // Recheck after source setup; this is cheap when the requested chunks
      // were already persisted by the parallel warmup.
      void Promise.resolve(warmCurrentTrackForResume(positionSeconds)).catch(() => {});
    }
  } catch (error) {
    if (currentTrackId === restoringTrackId) {
      setPlaybackPhase(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to restore the track audio source.",
      );
      notify();
    }
  }

  notify();
  return getState();
}


export function stopTrack(
  trackId = null,
) {


  if (
    trackId &&
    String(trackId) !==
      currentTrackId
  ) {
    return false;
  }


  cancelActivePlaybackSession();

  warmPlaybackTask =
    null;

  warmPlaybackTaskKey =
    null;


  // Explicit Stop ends the current play; a later selection of the same
  // track is a new start and should create a fresh listening event.
  finishListeningEvent("paused");

  pauseAudioWithCause("stop-track");


  clearQueue();
  persistQueueSnapshot();


  audio.removeAttribute(
    "src",
  );

  loadedAudioTrackId =
    null;

  sourcePreparationPromise =
    null;

  sourcePreparationTrackId =
    null;

  audio.load();


currentTrackId =
  null;

currentTrackMeta =
  null;

currentArtworkUrl =
  null;

currentTrackTitle =
  "";

currentTrackArtist =
  "";

restoredTimeSeconds =
  0;

  setPlaybackPhase(
    "idle",
  );


  notify();


  return true;
}


export function seekTo(
  timeSeconds,
) {
  if (
    typeof timeSeconds !==
      "number" ||
    !Number.isFinite(
      timeSeconds,
    )
  ) {
    return;
  }


  audio.currentTime =
    Math.max(
      0,
      Math.min(
        timeSeconds,
        audio.duration ||
          timeSeconds,
      ),
    );

  // A user seek supersedes any pending restored-position fallback.
  restoredTimeSeconds = 0;
  restoredClockPreviousSeconds = null;
  restoredClockProgressTicks = 0;

  notify();
}


export function setVolume(
  value,
) {


  audio.volume =
    Math.max(
      0,
      Math.min(
        1,
        value,
      ),
    );

  notify();
}


export function _getAudioElement() {
  return audio;
}


if (
  typeof window !==
  "undefined" &&
  !window.__HYPERSYNC_PLAYER
) {
  window.__HYPERSYNC_PLAYER = {
    playTrack,


    silenceLocalPlayback,
    playTrackQueue,
    playTrackNext,
    addTrackToQueue,
    playQueueIndex,
    playUrl,
    pausePlayback,
    togglePlay,
    stopTrack,
    seekTo,
    setVolume,
    getState,
    subscribe,
    _getAudioElement,
    skipToNext,
    skipToPrevious,
  };
}

export async function skipToNext() {


  if (!currentTrackId) {
    return false;
  }


  finishListeningEvent(
    "skipped",
    getSafeCurrentTime(),
  );


  await ensureAutoplayQueue();


  await playNextQueueTrack();

  return true;
}


export async function skipToPrevious() {


  if (!currentTrackId) {
    return false;
  }

  if (
    getSafeCurrentTime() >
      5 ||
    currentQueueIndex <= 0
  ) {
    seekTo(
      0,
    );

    return true;
  }

  finishListeningEvent(
    "skipped",
    getSafeCurrentTime(),
  );

  await playQueueIndex(
    currentQueueIndex - 1,
  );

  return true;
}


function configureMediaSessionActions() {
  const mediaSession =
    globalThis.navigator
      ?.mediaSession;

  if (
    !mediaSession ||
    typeof mediaSession
      .setActionHandler !==
      "function"
  ) {
    return;
  }

  const setHandler =
    (
      action,
      handler,
    ) => {
      try {
        mediaSession.setActionHandler(
          action,
          handler,
        );
      } catch {
        // Some browsers expose only a subset.
      }
    };

  setHandler(
    "play",
    () => {
      if (audio.paused) {
        void togglePlay();
      }
    },
  );

  setHandler(
    "pause",
    () => {
      pausePlayback("media-session");
    },
  );

  setHandler(
    "nexttrack",
    () => {
      void skipToNext();
    },
  );

  setHandler(
    "previoustrack",
    () => {
      void skipToPrevious();
    },
  );

  setHandler(
    "seekbackward",
    (details) => {
      seekTo(
        Math.max(
          0,
          getSafeCurrentTime() -
            (
              details?.seekOffset ??
              10
            ),
        ),
      );
    },
  );

  setHandler(
    "seekforward",
    (details) => {
      seekTo(
        getSafeCurrentTime() +
          (
            details?.seekOffset ??
            10
          ),
      );
    },
  );

  setHandler(
    "seekto",
    (details) => {
      if (
        Number.isFinite(
          details?.seekTime,
        )
      ) {
        seekTo(
          details.seekTime,
        );
      }
    },
  );
}


configureMediaSessionActions();
