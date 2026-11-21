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
  4;

const AUTOPLAY_BATCH_SIZE =
  12;

const AUTOPLAY_CONTEXT_SIZE =
  12;

let queueRevision =
  0;

let autoplayFill =
  null;

let nextTrackTransitionPromise =
  null;

let playbackPhase =
  "idle";

let playbackError =
  null;


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
  if (remaining > 5 || remaining < 0) return;

  const key = `${String(entry.id)}|${String(mediaVersion)}`;
  if (nextTrackFirstChunkWarmKey === key) return;
  nextTrackFirstChunkWarmKey = key;

  void warmQueuedAudioEntry(entry, { warmBytes: 256 * 1024 }).catch(() => {});
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
  if (!canRecordListeningHistory(getAccessToken(), hasStoredSession())) {
    activeListeningEvent =
      null;

    return;
  }

  const event = {
    trackId: String(trackId),
    eventId: null,
    request: null,
    listenedSeconds: 0,
    lastMediaTime: getSafeCurrentTime(),
    lastSampleAt: globalThis.performance?.now?.() ?? Date.now(),
    lastProgressSentAt: 0,
    progressPromise: null,
    historyNotified: false,
  };


  event.request =
    apiRequest(
      "/users/me/listening",
      {
        method:
          "POST",

        body:
          JSON.stringify({
            track_id:
              String(
                trackId,
              ),
          }),
      },
    )
      .then(
        (data) => {
          const eventId =
            data?.event_id ??
            null;

          if (eventId) {
            event.historyNotified = true;
            notifyListeningHistoryChanged({
              type: "confirmed-play",
              trackId: String(trackId),
            });
          }

          return eventId;
        },
      )
      .catch(
        (error) => {
          console.error(
            "[HyperSynced] Listening history event was not saved.",
            error,
          );
          // Reconcile any optimistic UI update if the authoritative write failed.
          notifyListeningHistoryChanged({ type: "write-failed" });
          return null;
        },
      );


  activeListeningEvent =
    event;

  // Add the track to the shared owner-scoped recent cache immediately,
  // then notify mounted Home/Profile pages. The Neon write remains authoritative.
  const owner = activePlaybackOwnerId;
  if (owner) {
    const cachedRecent = readCachedHomeRecentlyPlayed(owner);
    writeCachedHomeRecentlyPlayed(
      owner,
      applyOptimisticRecentlyPlayed(cachedRecent, { id: String(trackId), ...meta }, 12, {
        incrementPlayCount: false,
      }),
    );
  }
  notifyListeningHistoryChanged({
    type: "optimistic-play",
    track: { id: String(trackId), ...meta },
  });

  void event.request.then(
    (eventId) => {
      if (
        activeListeningEvent
        === event
      ) {
        event.eventId =
          eventId;
      }
    },
  );
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

  if (
    event.listenedSeconds >= 2 &&
    event.listenedSeconds - event.lastProgressSentAt >= 5
  ) {
    void saveListeningProgress();
  }
}

function saveListeningProgress(keepalive = false) {
  const event = activeListeningEvent;
  if (!event || event.progressPromise) return event?.progressPromise ?? Promise.resolve();
  const elapsed = Math.floor(event.listenedSeconds);
  if (elapsed <= event.lastProgressSentAt) return Promise.resolve();

  const request = (async () => {
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
    event.lastProgressSentAt = elapsed;
    if (!event.historyNotified && elapsed >= 2) {
      event.historyNotified = true;
      notifyListeningHistoryChanged({ type: "confirmed-progress" });
    }
  })().catch((error) => {
    console.error("[HyperSynced] Listening progress was not saved.", error);
  }).finally(() => {
    event.progressPromise = null;
  });

  event.progressPromise = request;
  return request;
}

function finishListeningEvent(outcome) {
  const event = activeListeningEvent;
  if (!event) return;

  sampleListeningProgress();
  activeListeningEvent = null;

  void (async () => {
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
  const incoming =
    buildTrackQueue(
      tracks,
    );

  if (!incoming.length) {
    return 0;
  }

  const existing =
    new Set(
      currentQueue.map(
        (entry) =>
          String(
            entry.id,
          ),
      ),
    );


  const unique =
    incoming.filter(
      (entry) => {
        const id =
          String(
            entry.id,
          );

        if (
          existing.has(
            id,
          )
        ) {
          return false;
        }

        existing.add(
          id,
        );

        return true;
      },
    );


  if (!unique.length) {
    return 0;
  }


  currentQueue = [
    ...currentQueue,
    ...unique,
  ];

  persistQueueSnapshot();
  notify();

  return unique.length;
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

    phase:
      playbackPhase,

    error:
      playbackError,

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

    title:
      currentTrackTitle,

    artist:
      currentTrackArtist,

    album:
      currentTrackMeta?.album ??
      "",

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
    sampleListeningProgress();
    // Pause is not a new play. Keep the current event open so resuming this
    // same track does not create another Recently Played or play-count entry.
    void saveListeningProgress(true);
    if (
      currentTrackId ||
      audio.currentSrc
    ) {
      setPlaybackPhase(
        "paused",
      );
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
    void saveListeningProgress(true);
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

  currentTrackId =
    String(
      trackId,
    );

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
     * Changing audio.src for a newer
     * playback request may reject the
     * previous play() promise.
     *
     * That is expected. A stale request
     * must quietly disappear rather than
     * turning into a visible player error.
     */
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
    audio.pause();

    /*
     * Do not make pause wait on network.
     * Warm the resume window in the
     * background for the next Play tap.
     */
    void warmCurrentTrackForResume();
  }


  return getState();
}


export function pausePlayback() {


  return silenceLocalPlayback();
}


export function silenceLocalPlayback() {
  if (
    !audio.paused
  ) {
    audio.pause();
  }

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
    audio.pause();
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

  // Playback restoration is exclusively driven by the account's Neon state.
  activePlaybackOwnerId = nextOwner;

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
  audio.pause();
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
  audio.pause();
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

  audio.pause();


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
      pausePlayback();
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
