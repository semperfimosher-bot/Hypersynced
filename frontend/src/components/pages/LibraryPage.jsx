import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  API_BASE,
} from "../../api/client.js";

import {
  resolveArtworkUrl,
} from "../../artworkUrl.js";

import {
  warmPlaylistArtwork,
} from "../../artworkWarmCache.js";

import * as player from
  "../../audioPlayer.js";

import {
  createPlaylist,
  deletePlaylist,
  getLibraryChanges,
  getLibraryTracks,
  LIBRARY_TRACKS_PAGE_SIZE,
  getMyPlaylists,
  getPlaylist,
  getSavedPlaylists,
  removeTrackFromPlaylist,
  savePlaylist,
  unsavePlaylist,
} from "../../playlistApi.js";

import {
  LIBRARY_TABS,
} from "../../constants.js";

import Icon from
  "../ui/Icon.jsx";

import useOnlineStatus from
  "../../hooks/useOnlineStatus.js";

import OfflineNotice from
  "../ui/OfflineNotice.jsx";

import PlaylistArtwork from
  "../ui/PlaylistArtwork.jsx";

import DownloadRemovalConfirm from
  "../ui/DownloadRemovalConfirm.jsx";

import TrackActionMenu from
  "../music/TrackActionMenu.jsx";

import CollectionActionMenu from
  "../music/CollectionActionMenu.jsx";

import ResultsSortMenu from
  "../music/ResultsSortMenu.jsx";

import useTrackActionMenu from
  "../../hooks/useTrackActionMenu.js";

import useCollectionActionMenu from
  "../../hooks/useCollectionActionMenu.js";

import useResultsSortMenu from
  "../../hooks/useResultsSortMenu.js";

import useQuietRefresh from
  "../../hooks/useQuietRefresh.js";

import {
  sortResultItems,
} from "../../sortResults.js";

import {
  readPinnedPlaylistIds,
  sortPinnedPlaylists,
  togglePinnedPlaylistId,
  writePinnedPlaylistIds,
} from "../../playlistPins.js";

import {
  filterPlaylistTracks,
} from "../../playlistTrackSearch.js";

import {
  downloadPlaylistByIdForOffline,
} from "../../playlistOfflineAction.js";

import {
  getDownloadedPlaylists,
  getDownloadedTracks,
  getOfflineOwnerKey,
  getOfflineArtworkUrl,
  getPlaylistDownloadJob,
  getPlaylistDownloadJobId,
  reconcileDownloadedPlaylistMembership,
  removePlaylistFromOffline,
  removeTrackFromOffline,
  startPlaylistDownloadForOffline,
} from "../../offlineDownloads.js";

import {
  getCachedLibrary,
  getCachedLibraryAsync,
  getCachedPlaylist,
  getCachedLibraryPageAsync,
  getCachedPlaylistAsync,
  clearCachedLibraryPages,
  applySavedPlaylistMembership,
  settleSavedPlaylistMembership,
  setCachedLibrary,
  setCachedLibraryPageAsync,
  setCachedPlaylist,
} from "../../libraryCache.js";

import {
  buildLibraryAlbums,
  buildLibraryArtists,
  mergeLibraryTracks,
} from "../../libraryEntities.js";

import {
  filterOfflinePlayableTracks,
  isOfflineUnavailableTrack,
} from "../../offlinePlayability.js";

import {
  getLibraryRenderItems,
  getNextLibraryRenderCount,
  LIBRARY_RENDER_BATCH_SIZE,
} from "../../libraryRenderWindow.js";

function LibraryLoadMore({
  label,
  visibleCount,
  totalCount,
  onClick,
}) {
  if (
    visibleCount >=
    totalCount
  ) {
    return null;
  }

  return (
    <div className="hs-library-load-more-wrap hs-library-load-more-wrap--span">
      <button
        type="button"
        className="hs-search-primary-action hs-library-load-more"
        onClick={onClick}
      >
        Show more {label}
        {" · "}
        {visibleCount.toLocaleString()}
        {" / "}
        {totalCount.toLocaleString()}
      </button>
    </div>
  );
}


function formatDuration(
  seconds,
) {
  const total =
    Number(
      seconds ?? 0,
    );

  if (
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return "0 min";
  }

  const minutes =
    Math.floor(
      total / 60,
    );

  const hours =
    Math.floor(
      minutes / 60,
    );

  if (hours > 0) {
    return (
      `${hours} hr ${minutes % 60} min`
    );
  }

  return `${minutes} min`;
}


function playlistPresentation(
  playlist,
) {
  const title =
    String(
      playlist?.title ??
      "",
    ).trim();

  const liked =
    title.toLocaleLowerCase()
    === "liked songs";

  const generated =
    playlist?.visibility ===
    "generated";

  return {
    kind:
      liked
        ? "liked"
        : generated
          ? "generated"
          : "custom",

    label:
      liked
        ? "LIKED SONGS"
        : generated
          ? "GENERATED PLAYLIST"
          : "CUSTOM PLAYLIST",

    owner:
      generated
        ? "HyperSynced"
        : (
            playlist?.owner_username ||
            "HyperSynced"
          ),
  };
}


function formatTrackDuration(
  seconds,
) {
  const value =
    Number(
      seconds,
    );

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return "--:--";
  }

  const minutes =
    Math.floor(
      value / 60,
    );

  const remainder =
    Math.floor(
      value % 60,
    )
      .toString()
      .padStart(
        2,
        "0",
      );

  return (
    `${minutes}:${remainder}`
  );
}


function LibraryPage({
  currentUser,
  onOpenAuth,
  initialPlaylistId = null,
  onInitialPlaylistHandled,
  initialSharedMusicTarget = null,
  onInitialSharedMusicHandled,
  resetToken = 0,
  activePlaylistDownloads = [],
}) {
  const trackActionMenu =
  useTrackActionMenu();

  const collectionActionMenu =
    useCollectionActionMenu();

  const resultsSortMenu =
    useResultsSortMenu();

  const [
    sortMode,
    setSortMode,
  ] = useState(
    "smart",
  );

  const [
    visibleDownloadedTrackCount,
    setVisibleDownloadedTrackCount,
  ] = useState(
    LIBRARY_RENDER_BATCH_SIZE,
  );

  const [
    visibleEntityTrackCount,
    setVisibleEntityTrackCount,
  ] = useState(
    LIBRARY_RENDER_BATCH_SIZE,
  );

  const [
    visibleEntityCardCount,
    setVisibleEntityCardCount,
  ] = useState(
    LIBRARY_RENDER_BATCH_SIZE,
  );

  const [
  currentTrackId,
  setCurrentTrackId,
] = useState(
  () =>
    player.getState()?.trackId
      ? String(
          player.getState().trackId,
        )
      : null,
);


useEffect(() => {
  return player.subscribe(
    (nextState) => {
      setCurrentTrackId(
        nextState?.trackId
          ? String(
              nextState.trackId,
            )
          : null,
      );
    },
  );
}, []);
  const [
    activeTab,
    setActiveTab,
  ] = useState(
    "Playlists",
  );

  const libraryCacheKey =
  currentUser?.id ??
  currentUser?.username ??
  "anonymous";

  const offlineOwnerKey =
  getOfflineOwnerKey(
    currentUser,
  );

  const cachedLibrary =
  getCachedLibrary(
    libraryCacheKey,
  );

const [
  ownedPlaylists,
  setOwnedPlaylists,
] = useState(
  () =>
    cachedLibrary?.owned ??
    [],
);

const [
  savedPlaylists,
  setSavedPlaylists,
] = useState(
  () =>
    cachedLibrary?.saved ??
    [],
);

const [
  libraryTracks,
  setLibraryTracks,
] = useState(
  () =>
    Array.isArray(
      cachedLibrary?.tracks,
    )
      ? cachedLibrary.tracks
      : [],
);

const libraryTracksRef = useRef(libraryTracks);
const libraryLoadInFlightRef = useRef(false);
const libraryChangeTokenRef = useRef(cachedLibrary?.changeToken ?? null);
const hydratedLibraryOwnerRef = useRef(cachedLibrary ? libraryCacheKey : null);
const libraryNextOffsetRef = useRef(
  cachedLibrary?.libraryNextOffset ?? libraryTracks.length,
);

const [
  hasMoreLibraryTracks,
  setHasMoreLibraryTracks,
] = useState(
  () =>
    cachedLibrary?.hasMoreLibraryTracks ??
    (Array.isArray(cachedLibrary?.tracks) &&
      cachedLibrary.tracks.length >= LIBRARY_TRACKS_PAGE_SIZE),
);

const [
  loadingMoreLibraryTracks,
  setLoadingMoreLibraryTracks,
] = useState(false);

useEffect(() => {
  libraryTracksRef.current = libraryTracks;
}, [libraryTracks]);

const [
  selectedLibraryEntity,
  setSelectedLibraryEntity,
] = useState(null);

const [
  focusedLibraryTrack,
  setFocusedLibraryTrack,
] = useState(null);

  const [
    selectedPlaylist,
    setSelectedPlaylist,
  ] = useState(
    null,
  );

  const selectedPlaylistIdRef = useRef(null);

  const [
    playlistSearchQuery,
    setPlaylistSearchQuery,
  ] = useState("");

  const [
    likedGenreFilter,
    setLikedGenreFilter,
  ] = useState(
    "all",
  );

  const [
    pinnedPlaylistIds,
    setPinnedPlaylistIds,
  ] = useState(
    () =>
      readPinnedPlaylistIds(
        libraryCacheKey,
      ),
  );

  useEffect(() => {
    setPinnedPlaylistIds(
      readPinnedPlaylistIds(
        libraryCacheKey,
      ),
    );
  }, [
    libraryCacheKey,
  ]);

  const togglePlaylistPinned =
    useCallback(
      (
        playlistId,
      ) => {
        setPinnedPlaylistIds(
          (current) => {
            const next =
              togglePinnedPlaylistId(
                current,
                playlistId,
              );

            writePinnedPlaylistIds(
              libraryCacheKey,
              next,
            );

            return next;
          },
        );
      },
      [
        libraryCacheKey,
      ],
    );

  useEffect(() => {
  selectedPlaylistIdRef.current = null;
  setSelectedPlaylist(
    null,
  );

  setPlaylistSearchQuery(
    "",
  );

  setSelectedLibraryEntity(
    null,
  );

  setFocusedLibraryTrack(
    null,
  );

  setOpeningPlaylistId(
    null,
  );

  setError("");

  setPlaylistDownload({
    status: "idle",
    progress: 0,
    trackProgress: {},
  });
}, [
  resetToken,
]);

  const [
    loading,
    setLoading,
  ] = useState(
    false,
  );

  const [
    openingPlaylistId,
    setOpeningPlaylistId,
  ] = useState(
    null,
  );

  const [
    error,
    setError,
  ] = useState(
    "",
  );

  const [
    createOpen,
    setCreateOpen,
  ] = useState(
    false,
  );

  const [
    createTitle,
    setCreateTitle,
  ] = useState(
    "",
  );

  const [
    createDescription,
    setCreateDescription,
  ] = useState(
    "",
  );

  const [
    createVisibility,
    setCreateVisibility,
  ] = useState(
    "private",
  );

  const [
    creating,
    setCreating,
  ] = useState(
    false,
  );

  const [
    actionBusy,
    setActionBusy,
  ] = useState(
    false,
  );

  const [
  playlistDownload,
  setPlaylistDownload,
] = useState({
  status: "idle",
  progress: 0,
  trackProgress: {},
});

  const playlistRowDownloads =
    useMemo(
      () =>
        Object.fromEntries(
          activePlaylistDownloads.map(
            (download) => [
              String(
                download.playlistId,
              ),
              {
                status:
                  download.state,
                progress:
                  download.progress,
              },
            ],
          ),
        ),
      [
        activePlaylistDownloads,
      ],
    );

  const [
    downloadedPlaylists,
    setDownloadedPlaylists,
  ] = useState([]);


  useEffect(() => {
    const activeSelectedDownload =
      activePlaylistDownloads.find(
        (download) =>
          String(
            download.playlistId,
          ) ===
          String(
            selectedPlaylist?.id ??
            "",
          ),
      ) ??
      null;

    if (activeSelectedDownload) {
      setPlaylistDownload({
        status:
          "downloading",
        progress:
          activeSelectedDownload
            .progress,
        trackProgress:
          activeSelectedDownload
            .trackProgress ??
          {},
      });
    }
  }, [
    activePlaylistDownloads,
    selectedPlaylist?.id,
  ]);

  const [
    downloadedTracks,
    setDownloadedTracks,
  ] = useState([]);

  const [
    allDownloadedTracks,
    setAllDownloadedTracks,
  ] = useState([]);

  const [
    removeDownloadTarget,
    setRemoveDownloadTarget,
  ] = useState(null);

  const [
    removingDownload,
    setRemovingDownload,
  ] = useState(false);

  const [
    removingDownloadedTrackKey,
    setRemovingDownloadedTrackKey,
  ] = useState(null);

  const [
    removeDownloadedSongTarget,
    setRemoveDownloadedSongTarget,
  ] = useState(null);

  useEffect(() => {
    setVisibleDownloadedTrackCount(
      LIBRARY_RENDER_BATCH_SIZE,
    );
    setVisibleEntityTrackCount(
      LIBRARY_RENDER_BATCH_SIZE,
    );
    setVisibleEntityCardCount(
      LIBRARY_RENDER_BATCH_SIZE,
    );
  }, [
    activeTab,
    focusedLibraryTrack?.id,
    likedGenreFilter,
    playlistSearchQuery,
    selectedLibraryEntity?.key,
    selectedPlaylist?.id,
    sortMode,
  ]);

  useEffect(() => {
    let cancelled =
      false;

    let retryTimer = null;

    const refreshDownloads =
      async () => {
        try {
          const [
            playlists,
            tracks,
            allTracks,
          ] =
            await Promise.all([
              getDownloadedPlaylists(
                offlineOwnerKey,
              ),
              getDownloadedTracks(
                offlineOwnerKey,
                {
                  manualOnly:
                    true,
                },
              ),
              getDownloadedTracks(
                offlineOwnerKey,
              ),
            ]);

          if (!cancelled) {
            setDownloadedPlaylists(
              playlists,
            );

            setDownloadedTracks(
              tracks,
            );

            setAllDownloadedTracks(
              allTracks,
            );
          }
        } catch (error) {
          /*
           * A transient IndexedDB read or artwork-repair
           * failure must never make completed downloads
           * disappear from the Library. Keep the last
           * known state and retry shortly.
           */
          if (!cancelled) {
            console.warn(
              "Unable to refresh offline downloads; preserving current state.",
              error,
            );

            retryTimer = window.setTimeout(
              () => {
                void refreshDownloads();
              },
              1500,
            );
          }
        }
      };

    void refreshDownloads();

    const handleDownloadsChanged =
      () => {
        void refreshDownloads();
      };

    window.addEventListener(
      "hypersync:offline-downloads-changed",
      handleDownloadsChanged,
    );

    return () => {
      cancelled = true;

      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }

      window.removeEventListener(
        "hypersync:offline-downloads-changed",
        handleDownloadsChanged,
      );
    };
  }, [
    offlineOwnerKey,
    resetToken,
    playlistDownload.status,
  ]);

  useEffect(() => {
    const handleOfflinePlaylistUpdated =
      async (event) => {
        const playlistId =
          event?.detail
            ?.playlistId;

        if (!playlistId) {
          return;
        }

        try {
          const [
            nextDownloads,
            nextTracks,
            nextAllTracks,
          ] =
            await Promise.all([
              getDownloadedPlaylists(
                offlineOwnerKey,
              ),
              getDownloadedTracks(
                offlineOwnerKey,
                {
                  manualOnly:
                    true,
                },
              ),
              getDownloadedTracks(
                offlineOwnerKey,
              ),
            ]);

          setDownloadedPlaylists(
            nextDownloads,
          );

          setDownloadedTracks(
            nextTracks,
          );

          setAllDownloadedTracks(
            nextAllTracks,
          );

          if (
            String(
              selectedPlaylist?.id ??
              "",
            ) !==
              String(
                playlistId,
              )
          ) {
            return;
          }

          const downloaded =
            nextDownloads.find(
              (playlist) =>
                String(
                  playlist.id,
                ) ===
                String(
                  playlistId,
                ),
            );

          if (!downloaded) {
            return;
          }

          setPlaylistDownload({
            status:
              "downloaded",
            progress:
              1,
            trackProgress:
              Object.fromEntries(
                downloaded.tracks.map(
                  (track) => [
                    String(
                      track.id,
                    ),
                    {
                      status:
                        "downloaded",
                      progress:
                        1,
                    },
                  ],
                ),
              ),
          });

          if (
            globalThis.navigator
              ?.onLine !==
              false
          ) {
            const refreshed =
              await getPlaylist(
                playlistId,
              );

            await setCachedPlaylist(
              libraryCacheKey,
              refreshed,
            );

            setSelectedPlaylist(
              refreshed,
            );
          }
        } catch {
          // The underlying offline job is already
          // complete even if this UI refresh fails.
        }
      };

    window.addEventListener(
      "hypersync:offline-playlist-updated",
      handleOfflinePlaylistUpdated,
    );

    return () => {
      window.removeEventListener(
        "hypersync:offline-playlist-updated",
        handleOfflinePlaylistUpdated,
      );
    };
  }, [
    libraryCacheKey,
    offlineOwnerKey,
    selectedPlaylist?.id,
  ]);


  const isRegistered =
    currentUser?.account_type ===
    "registered";


  const loadLibrary =
  useCallback(
    async ({
      quiet = false,
      force = false,
    } = {}) => {
      if (!isRegistered) {
        setOwnedPlaylists([]);
        setSavedPlaylists([]);
        setLibraryTracks([]);
        libraryTracksRef.current = [];
        libraryNextOffsetRef.current = 0;
        setHasMoreLibraryTracks(false);

        return;
      }

      const offline =
        typeof navigator !==
          "undefined" &&
        navigator.onLine ===
          false;

      // Show a loading state immediately only when no in-memory snapshot
      // is available; IndexedDB hydration then restores the persisted copy.
      if (!getCachedLibrary(libraryCacheKey) && !quiet) {
        setLoading(true);
      }

      const cached = await getCachedLibraryAsync(
        libraryCacheKey,
      );

      // Recover pending optimistic mutations after refresh/restart. The save
      // and unsave endpoints are idempotent membership operations; replaying
      // the desired state prevents a click from being lost mid-request.
      if (
        !offline &&
        cached?.pendingSavedPlaylistChanges &&
        Object.keys(cached.pendingSavedPlaylistChanges).length
      ) {
        const pendingChanges = Object.entries(
          cached.pendingSavedPlaylistChanges,
        );
        await Promise.allSettled(
          pendingChanges.map(async ([playlistId, desiredSaved]) => {
            if (desiredSaved) {
              await savePlaylist(playlistId);
            } else {
              await unsavePlaylist(playlistId);
            }
            settleSavedPlaylistMembership(
              libraryCacheKey,
              playlistId,
            );
          }),
        );
      }

      // Restore IndexedDB-only snapshots before checking the server. This is
      // essential for large libraries whose localStorage mirror is a marker.
      if (
        cached &&
        hydratedLibraryOwnerRef.current !== libraryCacheKey
      ) {
        const cachedOwned = Array.isArray(cached.owned) ? cached.owned : [];
        const cachedSaved = Array.isArray(cached.saved) ? cached.saved : [];
        const cachedTracks = Array.isArray(cached.tracks) ? cached.tracks : [];
        warmPlaylistArtwork([...cachedOwned, ...cachedSaved]);
        setOwnedPlaylists(cachedOwned);
        setSavedPlaylists(cachedSaved);
        setLibraryTracks(cachedTracks);
        libraryTracksRef.current = cachedTracks;
        libraryNextOffsetRef.current =
          cached.libraryNextOffset ?? cachedTracks.length;
        setHasMoreLibraryTracks(
          cached.hasMoreLibraryTracks ??
          cachedTracks.length >= LIBRARY_TRACKS_PAGE_SIZE,
        );
        libraryChangeTokenRef.current = cached.changeToken ?? null;
        hydratedLibraryOwnerRef.current = libraryCacheKey;
      }


      /*
       * OFFLINE:
       *
       * Never attempt the API.
       * Restore the last saved Library
       * snapshot immediately.
       */
      if (offline) {
        if (cached) {
          setOwnedPlaylists(
            Array.isArray(
              cached.owned,
            )
              ? cached.owned
              : [],
          );

          setSavedPlaylists(
            Array.isArray(
              cached.saved,
            )
              ? cached.saved
              : [],
          );

          const cachedTracks = Array.isArray(cached.tracks)
            ? cached.tracks
            : [];
          setLibraryTracks(cachedTracks);
          libraryTracksRef.current = cachedTracks;
          libraryNextOffsetRef.current =
            cached.libraryNextOffset ?? cachedTracks.length;
          setHasMoreLibraryTracks(
            cached.hasMoreLibraryTracks ??
            cachedTracks.length >= LIBRARY_TRACKS_PAGE_SIZE,
          );

          setError("");
        } else {
          setOwnedPlaylists([]);
          setSavedPlaylists([]);
          setLibraryTracks([]);
          libraryTracksRef.current = [];
          libraryNextOffsetRef.current = 0;
          setHasMoreLibraryTracks(false);

          setError(
            allDownloadedTracks.length > 0 || downloadedPlaylists.length > 0
              ? ""
              : "This Library has not been cached on this device yet.",
          );
        }

        setLoading(false);

        return;
      }


      if (
        !cached &&
        !quiet
      ) {
        setLoading(true);
      }

      if (!quiet) {
        setError("");
      }

      if (libraryLoadInFlightRef.current) {
        return;
      }
      libraryLoadInFlightRef.current = true;

      try {
        let changeToken = null;
        let mine;
        let saved;
        let tracks;

        if (!cached) {
          // First visit has no snapshot to validate. Fetch the version and
          // visible Library data together so startup pays only one network
          // round trip instead of serializing the version check first.
          const [changes, mineResult, savedResult, tracksResult] =
            await Promise.all([
              getLibraryChanges().catch(() => null),
              getMyPlaylists(),
              getSavedPlaylists(),
              getLibraryTracks({
                limit: LIBRARY_TRACKS_PAGE_SIZE,
                offset: 0,
              }),
            ]);
          changeToken = changes?.version ?? null;
          mine = mineResult;
          saved = savedResult;
          tracks = tracksResult;
        } else {
          try {
            const changes = await getLibraryChanges();
            changeToken = changes?.version ?? null;
          } catch {
            // A failed background check must never blank or reload a usable cache.
            if (quiet) return;
          }

          if (
            !force &&
            changeToken &&
            cached.changeToken === changeToken
          ) {
            return;
          }

          if (quiet && !changeToken) {
            return;
          }

          const serverVersionChanged = Boolean(
            changeToken && cached.changeToken !== changeToken,
          );
          if (serverVersionChanged) {
            // Loaded pages beyond page zero belong to the old account-library
            // version. Drop them instead of merging stale membership into the
            // refreshed first page after another device changes the Library.
            await clearCachedLibraryPages(libraryCacheKey);
          }

          [mine, saved, tracks] = await Promise.all([
            getMyPlaylists(),
            getSavedPlaylists(),
            getLibraryTracks({
              limit: LIBRARY_TRACKS_PAGE_SIZE,
              offset: 0,
            }),
          ]);
        }

        const nextOwned =
          Array.isArray(mine)
            ? mine
            : [];

        let nextSaved =
          Array.isArray(saved)
            ? saved
            : [];
        warmPlaylistArtwork([...nextOwned, ...nextSaved]);

        // Preserve local optimistic mutations while requests are in flight,
        // so a background refresh cannot briefly undo the user's click.
        const pendingSavedChanges =
          cached?.pendingSavedPlaylistChanges ?? {};
        for (const [pendingId, pendingSaved] of Object.entries(pendingSavedChanges)) {
          const id = String(pendingId);
          const existing = nextSaved.find(item => String(item?.id) === id);
          if (pendingSaved) {
            const pendingPlaylist = existing ??
              cached?.saved?.find(item => String(item?.id) === id) ??
              cached?.owned?.find(item => String(item?.id) === id);
            if (pendingPlaylist) {
              nextSaved = [
                { ...pendingPlaylist, is_saved: true },
                ...nextSaved.filter(item => String(item?.id) !== id),
              ];
            }
          } else {
            nextSaved = nextSaved.filter(item => String(item?.id) !== id);
          }
        }

        const fetchedTracks = Array.isArray(tracks)
          ? tracks
          : [];
        const existingTracks = libraryTracksRef.current;
        const serverVersionChanged = Boolean(
          cached && changeToken && cached.changeToken !== changeToken,
        );
        let nextTracks = fetchedTracks;
        if (quiet && existingTracks.length && !serverVersionChanged) {
          const fetchedIds = new Set(
            fetchedTracks.map((track) => String(track.id)),
          );
          const byId = new Map(
            existingTracks.map((track) => [String(track.id), track]),
          );
          for (const track of fetchedTracks) {
            byId.set(String(track.id), track);
          }
          nextTracks = [
            ...fetchedTracks,
            ...existingTracks.filter(
              (track) => !fetchedIds.has(String(track.id)),
            ),
          ].map((track) => byId.get(String(track.id)) ?? track);
        }
        if (!quiet || serverVersionChanged) {
          libraryNextOffsetRef.current = fetchedTracks.length;
        }
        const nextHasMore =
          fetchedTracks.length >= LIBRARY_TRACKS_PAGE_SIZE ||
          (!serverVersionChanged && quiet && existingTracks.length > fetchedTracks.length);

        setOwnedPlaylists(
          nextOwned,
        );

        setSavedPlaylists(
          nextSaved,
        );

        setLibraryTracks(nextTracks);
        libraryTracksRef.current = nextTracks;
        setHasMoreLibraryTracks(nextHasMore);

        libraryChangeTokenRef.current = changeToken;
        await setCachedLibrary(
          libraryCacheKey,
          {
            owned:
              nextOwned,

            saved:
              nextSaved,

            tracks:
              nextTracks,

            hasMoreLibraryTracks:
              nextHasMore,

            libraryNextOffset:
              libraryNextOffsetRef.current,

            changeToken,
            pendingSavedPlaylistIds:
              cached?.pendingSavedPlaylistIds ?? [],
            pendingSavedPlaylistChanges:
              cached?.pendingSavedPlaylistChanges ?? {},
          },
        );
        await setCachedLibraryPageAsync(
          libraryCacheKey,
          0,
          fetchedTracks,
        );
      } catch (requestError) {
        /*
         * If the connection disappeared
         * during the request, fall back
         * to the persisted snapshot.
         */
        const fallback =
          await getCachedLibraryAsync(
            libraryCacheKey,
          );

        if (fallback) {
          warmPlaylistArtwork([
            ...(Array.isArray(fallback.owned) ? fallback.owned : []),
            ...(Array.isArray(fallback.saved) ? fallback.saved : []),
          ]);
          setOwnedPlaylists(
            Array.isArray(
              fallback.owned,
            )
              ? fallback.owned
              : [],
          );

          setSavedPlaylists(
            Array.isArray(
              fallback.saved,
            )
              ? fallback.saved
              : [],
          );

          const fallbackTracks = Array.isArray(fallback.tracks)
            ? fallback.tracks
            : [];
          setLibraryTracks(fallbackTracks);
          libraryTracksRef.current = fallbackTracks;
          libraryNextOffsetRef.current =
            fallback.libraryNextOffset ?? fallbackTracks.length;
          setHasMoreLibraryTracks(
            fallback.hasMoreLibraryTracks ??
            fallbackTracks.length >= LIBRARY_TRACKS_PAGE_SIZE,
          );

          setError("");
        } else if (!quiet) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load your library.",
          );
        }
      } finally {
        libraryLoadInFlightRef.current = false;
        if (!quiet) {
          setLoading(false);
        }
      }
    },
    [
      isRegistered,
      libraryCacheKey,
      allDownloadedTracks.length,
      downloadedPlaylists.length,
    ],
  );

  const loadMoreLibraryTracks = useCallback(async () => {
    if (
      loadingMoreLibraryTracks ||
      !hasMoreLibraryTracks
    ) {
      return;
    }

    setLoadingMoreLibraryTracks(true);
    setError("");

    try {
      const offset = libraryNextOffsetRef.current;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      let nextPage = null;

      if (offline) {
        nextPage = await getCachedLibraryPageAsync(libraryCacheKey, offset);
        if (!Array.isArray(nextPage)) {
          throw new Error("That library page is not available offline yet.");
        }
      } else {
        const page = await getLibraryTracks({
          limit: LIBRARY_TRACKS_PAGE_SIZE,
          offset,
        });
        nextPage = Array.isArray(page) ? page : [];
        await setCachedLibraryPageAsync(libraryCacheKey, offset, nextPage);
      }
      const current = libraryTracksRef.current;
      const knownIds = new Set(current.map((track) => String(track.id)));
      const additions = nextPage.filter(
        (track) => !knownIds.has(String(track.id)),
      );
      const nextTracks = [...current, ...additions];
      const nextHasMore =
        nextPage.length >= LIBRARY_TRACKS_PAGE_SIZE &&
        additions.length > 0;

      libraryTracksRef.current = nextTracks;
      libraryNextOffsetRef.current = offset + nextPage.length;
      setLibraryTracks(nextTracks);
      setHasMoreLibraryTracks(nextHasMore);

      await setCachedLibrary(libraryCacheKey, {
        owned: ownedPlaylists,
        saved: savedPlaylists,
        tracks: nextTracks,
        hasMoreLibraryTracks: nextHasMore,
        libraryNextOffset: libraryNextOffsetRef.current,
        changeToken: libraryChangeTokenRef.current,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load more library tracks.",
      );
    } finally {
      setLoadingMoreLibraryTracks(false);
    }
  }, [
    hasMoreLibraryTracks,
    libraryCacheKey,
    loadingMoreLibraryTracks,
    ownedPlaylists,
    savedPlaylists,
  ]);

  useEffect(() => {
    void loadLibrary();
  }, [
    loadLibrary,
  ]);


  useQuietRefresh(
    () =>
      loadLibrary({
        quiet:
          true,
      }),
    {
      enabled:
        isRegistered,
      intervalMs:
        30_000,
    },
  );


  useQuietRefresh(
    async () => {
      const playlistId =
        selectedPlaylist?.id;

      if (!playlistId) {
        return;
      }

      try {
        const refreshed =
          await getPlaylist(
            playlistId,
          );

        await reconcileDownloadedPlaylistMembership(
          refreshed,
          offlineOwnerKey,
        );

        setSelectedPlaylist(
          refreshed,
        );

        await setCachedPlaylist(
          libraryCacheKey,
          refreshed,
        );
      } catch (requestError) {
        if (
          requestError?.status ===
            404
        ) {
          setSelectedPlaylist(
            null,
          );

          void loadLibrary({
            quiet:
              true,
          });
        }
      }
    },
    {
      enabled:
        Boolean(
          selectedPlaylist?.id,
        ),
      intervalMs:
        60_000,
    },
  );


  useEffect(() => {
    const handleLibraryChanged =
      (event) => {
        const detail = event?.detail;
        const playlist = detail?.playlist;
        const phase = detail?.phase;

        if (
          playlist?.id &&
          detail?.ownerKey &&
          String(detail.ownerKey) === String(libraryCacheKey) &&
          (phase === "optimistic" || phase === "rollback")
        ) {
          const playlistId = String(playlist.id);
          const shouldBeSaved = Boolean(detail.saved);
          setSavedPlaylists(current =>
            shouldBeSaved
              ? [playlist, ...current.filter(item => String(item?.id) !== playlistId)]
              : current.filter(item => String(item?.id) !== playlistId),
          );
          setSelectedPlaylist(current =>
            String(current?.id) === playlistId
              ? { ...current, is_saved: shouldBeSaved }
              : current,
          );
          applySavedPlaylistMembership(
            libraryCacheKey,
            playlist,
            shouldBeSaved,
          );
          return;
        }

        if (phase === "confirmed" && playlist?.id) {
          const playlistId = String(playlist.id);
          const shouldBeSaved = Boolean(saved);
          setSavedPlaylists(current =>
            shouldBeSaved
              ? [playlist, ...current.filter(item => String(item?.id) !== playlistId)]
              : current.filter(item => String(item?.id) !== playlistId),
          );
          setSelectedPlaylist(current =>
            String(current?.id) === playlistId
              ? { ...current, is_saved: shouldBeSaved }
              : current,
          );
          applySavedPlaylistMembership(
            libraryCacheKey,
            playlist,
            shouldBeSaved,
          );
          settleSavedPlaylistMembership(
            libraryCacheKey,
            playlist.id,
          );
          // The optimistic update already changed the Library UI. Avoid a
          // stale server snapshot overwriting it immediately after confirmation.
          return;
        }

        void loadLibrary({ force: true });
      };

    window.addEventListener(
      "hypersync:library-changed",
      handleLibraryChanged,
    );

    return () => {
      window.removeEventListener(
        "hypersync:library-changed",
        handleLibraryChanged,
      );
    };
  }, [
    loadLibrary,
  ]);


  useEffect(() => {
    if (
      !initialSharedMusicTarget
    ) {
      return;
    }

    setSelectedPlaylist(
      null,
    );

    setPlaylistSearchQuery(
      "",
    );

    if (
      initialSharedMusicTarget.kind ===
        "track" &&
      initialSharedMusicTarget.track
    ) {
      setActiveTab(
        "Songs",
      );

      setSelectedLibraryEntity(
        null,
      );

      setFocusedLibraryTrack(
        initialSharedMusicTarget.track,
      );
    } else if (
      (
        initialSharedMusicTarget.kind ===
          "artist" ||
        initialSharedMusicTarget.kind ===
          "album"
      ) &&
      initialSharedMusicTarget.key
    ) {
      setActiveTab(
        initialSharedMusicTarget.kind ===
          "artist"
          ? "Artists"
          : "Albums",
      );

      setFocusedLibraryTrack(
        null,
      );

      setSelectedLibraryEntity({
        kind:
          initialSharedMusicTarget.kind,
        key:
          initialSharedMusicTarget.key,
      });
    }

    onInitialSharedMusicHandled?.();
  }, [
    initialSharedMusicTarget,
    onInitialSharedMusicHandled,
  ]);


  useEffect(() => {
  if (
    !initialPlaylistId
  ) {
    return undefined;
  }

  let cancelled =
    false;

  async function loadInitialPlaylist() {
    const downloaded =
      (
        await getDownloadedPlaylists(
          offlineOwnerKey,
        ).catch(
          () => [],
        )
      ).find(
        (playlist) =>
          String(
            playlist.id,
          ) ===
          String(
            initialPlaylistId,
          ),
      ) ??
      null;

    const cached =
      downloaded ??
      await getCachedPlaylistAsync(
        libraryCacheKey,
        initialPlaylistId,
      );

    if (downloaded) {
      setPlaylistDownload({
        status:
          "downloaded",
        progress:
          1,
        trackProgress:
          Object.fromEntries(
            downloaded.tracks.map(
              (track) => [
                String(
                  track.id,
                ),
                {
                  status:
                    "downloaded",
                  progress:
                    1,
                },
              ],
            ),
          ),
      });
    }

    if (cached) {
      setSelectedPlaylist(
        cached,
      );
    } else {
      setOpeningPlaylistId(
        initialPlaylistId,
      );
    }

    setError("");

    const offline =
      typeof navigator !==
        "undefined" &&
      navigator.onLine ===
        false;

    if (offline) {
      if (!cached) {
        setError(
          "This playlist is not available offline yet.",
        );
      }

      setOpeningPlaylistId(
        null,
      );

      onInitialPlaylistHandled?.();

      return;
    }

    try {
      const playlist =
        await getPlaylist(
          initialPlaylistId,
        );

      if (cancelled) {
        return;
      }

      // Do not hold initial navigation behind IndexedDB reconciliation.
      setSelectedPlaylist(playlist);
      window.scrollTo({ top: 0, behavior: "smooth" });

      void Promise.allSettled([
        reconcileDownloadedPlaylistMembership(
          playlist,
          offlineOwnerKey,
        ),
        setCachedPlaylist(
          libraryCacheKey,
          playlist,
        ),
      ]);
    } catch (requestError) {
      if (
        cancelled ||
        cached
      ) {
        return;
      }

      setError(
        requestError
          instanceof Error
          ? requestError.message
          : "Unable to open playlist.",
      );
    } finally {
      if (!cancelled) {
        setOpeningPlaylistId(
          null,
        );

        onInitialPlaylistHandled?.();
      }
    }
  }

  void loadInitialPlaylist();

  return () => {
    cancelled =
      true;
  };
}, [
  initialPlaylistId,
  libraryCacheKey,
  offlineOwnerKey,
  onInitialPlaylistHandled,
]);


useEffect(() => {
  if (!createOpen) {
    return undefined;
  }

  const previousOverflow =
    document.body.style.overflow;

  document.body.style.overflow =
    "hidden";

  function handleKeyDown(
    event,
  ) {
    if (
      event.key === "Escape" &&
      !creating
    ) {
      setCreateOpen(
        false,
      );
    }
  }

  window.addEventListener(
    "keydown",
    handleKeyDown,
  );

  return () => {
    document.body.style.overflow =
      previousOverflow;

    window.removeEventListener(
      "keydown",
      handleKeyDown,
    );
  };
}, [
  createOpen,
  creating,
]);


  const playlistPrefetchRequestsRef = useRef(new Map());

  function requestPlaylistDetails(playlistId) {
    const key = String(playlistId);
    const existing = playlistPrefetchRequestsRef.current.get(key);
    if (existing) return existing;

    const request = getPlaylist(playlistId)
      .then(async (playlist) => {
        await setCachedPlaylist(libraryCacheKey, playlist);
        warmPlaylistArtwork([playlist]);
        return playlist;
      })
      .finally(() => {
        playlistPrefetchRequestsRef.current.delete(key);
      });

    playlistPrefetchRequestsRef.current.set(key, request);
    return request;
  }

  async function prefetchPlaylistDetails(playlistId) {
    if (!playlistId || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    const key = String(playlistId);
    if (playlistPrefetchRequestsRef.current.has(key)) return;
    // Requests are deduplicated per playlist. The background queue below
    // limits concurrent warming to two while covering every playlist.
    const cached = await getCachedPlaylistAsync(libraryCacheKey, playlistId).catch(() => null);
    if (cached?.tracks?.length) {
      warmPlaylistArtwork([cached]);
      return;
    }
    await requestPlaylistDetails(playlistId).catch(() => null);
  }

  useEffect(() => {
    if (!isRegistered || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      return;
    }
    const targets = [...ownedPlaylists, ...savedPlaylists];
    const unique = [...new Map(
      targets.filter((playlist) => playlist?.id)
        .map((playlist) => [String(playlist.id), playlist]),
    ).values()];
    let cancelled = false;
    let nextIndex = 0;

    // Warm all playlist details in the background. Two workers provide useful
    // ahead-of-click coverage without flooding the API. Cache hits are skipped.
    async function worker() {
      while (!cancelled && nextIndex < unique.length) {
        const playlist = unique[nextIndex++];
        await prefetchPlaylistDetails(playlist.id);
      }
    }

    void Promise.all([worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [isRegistered, ownedPlaylists, savedPlaylists]);

  async function openPlaylist(
  playlistId,
) {
  if (openingPlaylistId && String(openingPlaylistId) !== String(playlistId)) {
    return;
  }

  selectedPlaylistIdRef.current = String(playlistId);
  const memoryCachedPlaylist = getCachedPlaylist(libraryCacheKey, playlistId);
  if (memoryCachedPlaylist?.tracks?.length) {
    // Render the in-memory playlist snapshot synchronously before any IndexedDB
    // or network awaits. The server refresh below remains background work.
    setSelectedPlaylist(memoryCachedPlaylist);
    setOpeningPlaylistId(null);
  } else {
    setOpeningPlaylistId(playlistId);
  }
  setError("");

  const offline =
    typeof navigator !== "undefined" &&
    navigator.onLine === false;

  const activeDownload =
    activePlaylistDownloads.find(
      (item) =>
        String(item.playlistId) === String(playlistId),
    ) ?? null;

  const knownDownloaded =
    downloadedPlaylists.find(
      (item) => String(item.id) === String(playlistId),
    ) ?? null;

  if (activeDownload) {
    setPlaylistDownload({
      status: "downloading",
      progress: activeDownload.progress,
      trackProgress: activeDownload.trackProgress ?? {},
    });
  } else if (knownDownloaded) {
    setPlaylistDownload({
      status: "downloaded",
      progress: 1,
      trackProgress: Object.fromEntries(
        knownDownloaded.tracks.map((track) => [
          String(track.id),
          { status: "downloaded", progress: 1 },
        ]),
      ),
    });
  } else {
    setPlaylistDownload({
      status: "idle",
      progress: 0,
      trackProgress: {},
    });
  }

  if (offline) {
    try {
      const currentDownloads =
        knownDownloaded || !offlineOwnerKey
          ? downloadedPlaylists
          : await getDownloadedPlaylists(offlineOwnerKey).catch(() => []);

      const downloaded =
        currentDownloads.find(
          (item) => String(item.id) === String(playlistId),
        ) ?? null;

      if (downloaded && currentDownloads !== downloadedPlaylists) {
        setDownloadedPlaylists(currentDownloads);
      }

      const cached =
        downloaded ??
        await getCachedPlaylistAsync(libraryCacheKey, playlistId);

      const downloadJob = downloaded
        ? null
        : await getPlaylistDownloadJob(offlineOwnerKey, playlistId).catch(() => null);

      if (cached) {
        setSelectedPlaylist(cached);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError("This playlist is not available offline yet.");
      }

      if (downloaded && !activeDownload) {
        setPlaylistDownload({
          status: "downloaded",
          progress: 1,
          trackProgress: Object.fromEntries(
            downloaded.tracks.map((track) => [
              String(track.id),
              { status: "downloaded", progress: 1 },
            ]),
          ),
        });
      }

      if (!activeDownload && !downloaded &&
          (downloadJob?.state === "paused" || downloadJob?.state === "downloading")) {
        const totalBytes = Number(downloadJob.totalBytes ?? 0);
        const downloadedBytes = Number(downloadJob.downloadedBytes ?? 0);
        setPlaylistDownload({
          status: "paused",
          progress: totalBytes > 0
            ? Math.max(0, Math.min(1, downloadedBytes / totalBytes))
            : 0,
          trackProgress: {},
        });
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to open playlist.",
      );
    } finally {
      setOpeningPlaylistId(null);
    }
    return;
  }

  let cachedPlaylist = null;
  const cachedPlaylistPromise = getCachedPlaylistAsync(
    libraryCacheKey,
    playlistId,
  ).catch(() => null);
  const serverPlaylistPromise = requestPlaylistDetails(playlistId);

  try {
    // Start the server refresh immediately, but render a local snapshot as
    // soon as IndexedDB returns it. The network never gates a warm playlist.
    cachedPlaylist = await cachedPlaylistPromise;
    if (selectedPlaylistIdRef.current !== String(playlistId)) return;
    if (cachedPlaylist) {
      setSelectedPlaylist(cachedPlaylist);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setOpeningPlaylistId(null);
    }

    const playlist = await serverPlaylistPromise;
    if (selectedPlaylistIdRef.current !== String(playlistId)) return;
    setSelectedPlaylist(playlist);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setOpeningPlaylistId(null);

    // These tasks are deliberately detached from the opening path.
    void Promise.allSettled([
      reconcileDownloadedPlaylistMembership(playlist, offlineOwnerKey),
      setCachedPlaylist(libraryCacheKey, playlist),
    ]);

    void (async () => {
      const [currentDownloads, downloadJob] = await Promise.all([
        getDownloadedPlaylists(offlineOwnerKey).catch(() => []),
        getPlaylistDownloadJob(offlineOwnerKey, playlistId).catch(() => null),
      ]);

      const downloaded = currentDownloads.find(
        (item) => String(item.id) === String(playlistId),
      ) ?? null;

      setDownloadedPlaylists(currentDownloads);

      // Don't let a slower metadata lookup for an earlier playlist replace
      // the download state after the user has opened a different playlist.
      if (selectedPlaylistIdRef.current !== String(playlistId)) {
        return;
      }

      if (activeDownload) {
        setPlaylistDownload({
          status: "downloading",
          progress: activeDownload.progress,
          trackProgress: activeDownload.trackProgress ?? {},
        });
      } else if (downloaded) {
        const downloadedIds = new Set(
          downloaded.tracks.map((track) => String(track.id)),
        );
        const trackProgress = Object.fromEntries(
          downloaded.tracks.map((track) => [
            String(track.id),
            { status: "downloaded", progress: 1 },
          ]),
        );
        const allCurrentTracksDownloaded =
          playlist.tracks.length > 0 &&
          playlist.tracks.every((track) => downloadedIds.has(String(track.id)));

        setPlaylistDownload({
          status: allCurrentTracksDownloaded ? "downloaded" : "idle",
          progress: playlist.tracks.length > 0
            ? Math.min(1, downloadedIds.size / playlist.tracks.length)
            : 0,
          trackProgress,
        });
      } else if (downloadJob?.state === "paused" || downloadJob?.state === "downloading") {
        const totalBytes = Number(downloadJob.totalBytes ?? 0);
        const downloadedBytes = Number(downloadJob.downloadedBytes ?? 0);
        setPlaylistDownload({
          status: "paused",
          progress: totalBytes > 0
            ? Math.max(0, Math.min(1, downloadedBytes / totalBytes))
            : 0,
          trackProgress: {},
        });
      }
    })().catch(() => {});
  } catch (requestError) {
    // Preserve the local snapshot if the server is temporarily unavailable.
    const cached = cachedPlaylist ??
      await cachedPlaylistPromise.catch(() => null);
    if (cached) {
      setSelectedPlaylist(cached);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to open playlist.",
      );
    }
  } finally {
    setOpeningPlaylistId(null);
  }
}


  async function handleCreatePlaylist(
    event,
  ) {
    event.preventDefault();

    const title =
      createTitle.trim();

    if (!title) {
      return;
    }

    setCreating(true);
    setError("");

    try {
      const playlist =
        await createPlaylist({
          title,

          description:
            createDescription.trim()
              ? createDescription.trim()
              : null,

          visibility:
            createVisibility,
        });

      setOwnedPlaylists(
        (current) => [
          playlist,
          ...current,
        ],
      );

      setCreateTitle("");
      setCreateDescription("");

      setCreateVisibility(
        "private",
      );

      setCreateOpen(false);

      setSelectedPlaylist(
        playlist,
      );
    } catch (requestError) {
      setError(
        requestError
          instanceof Error
          ? requestError.message
          : "Unable to create playlist.",
      );
    } finally {
      setCreating(false);
    }
  }


  async function handleDeletePlaylist() {
    if (
      !selectedPlaylist ||
      !selectedPlaylist.is_owner ||
      actionBusy
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${selectedPlaylist.title}"?`,
      );

    if (!confirmed) {
      return;
    }

    setActionBusy(true);
    setError("");

    try {
      await deletePlaylist(
        selectedPlaylist.id,
      );

      setOwnedPlaylists(
        (current) =>
          current.filter(
            (playlist) =>
              playlist.id !==
              selectedPlaylist.id,
          ),
      );

      setSelectedPlaylist(
        null,
      );

      await loadLibrary();
    } catch (requestError) {
      setError(
        requestError
          instanceof Error
          ? requestError.message
          : "Unable to delete playlist.",
      );
    } finally {
      setActionBusy(false);
    }
  }


  async function handleRemoveTrack(
    playlistTrackId,
  ) {
    if (
      !selectedPlaylist ||
      !selectedPlaylist.is_owner ||
      actionBusy
    ) {
      return;
    }

    setActionBusy(true);
    setError("");

    try {
      await removeTrackFromPlaylist(
        selectedPlaylist.id,
        playlistTrackId,
      );

      const refreshed =
        await getPlaylist(
          selectedPlaylist.id,
        );

      setSelectedPlaylist(
        refreshed,
      );

      await loadLibrary();
    } catch (requestError) {
      setError(
        requestError
          instanceof Error
          ? requestError.message
          : "Unable to remove track.",
      );
    } finally {
      setActionBusy(false);
    }
  }


  async function downloadPlaylist() {
    const tracks =
      selectedPlaylist?.tracks ??
      [];

    const playlistId =
      String(
        selectedPlaylist?.id ??
        "",
      );

    if (
      !playlistId ||
      tracks.length === 0 ||
      playlistDownload.status ===
        "downloading"
    ) {
      return;
    }

    setError("");

    setPlaylistDownload({
      status:
        "downloading",
      progress:
        0,
      trackProgress:
        {},
    });

    try {
      await startPlaylistDownloadForOffline(
        tracks,
        {
          jobId:
            getPlaylistDownloadJobId(
              offlineOwnerKey,
              selectedPlaylist.id,
            ),
          ownerKey:
            offlineOwnerKey,
          jobMetadata: {
            kind:
              "playlist",
            playlistId:
              selectedPlaylist.id,
            playlistTitle:
              selectedPlaylist.title,
            playlistDescription:
              selectedPlaylist.description ??
              null,
            playlistArtworkUrl:
              selectedPlaylist.artwork_url ??
              null,
            playlistOwnerUsername:
              selectedPlaylist.owner_username ??
              null,
            playlistVisibility:
              selectedPlaylist.visibility ??
              null,
          },
          onProgress: ({
            progress,
            trackProgress,
          }) => {
            const safeProgress =
              Number.isFinite(
                progress,
              )
                ? progress
                : 0;

            setPlaylistDownload({
              status:
                "downloading",
              progress:
                safeProgress,
              trackProgress:
                trackProgress ??
                {},
            });

          },
        },
      );

      setPlaylistDownload({
        status:
          "downloaded",
        progress:
          1,
        trackProgress:
          Object.fromEntries(
            tracks.map(
              (track) => [
                String(
                  track.id,
                ),
                {
                  status:
                    "downloaded",
                  progress:
                    1,
                },
              ],
            ),
          ),
      });

      setDownloadedPlaylists(
        await getDownloadedPlaylists(
            offlineOwnerKey,
          ),
      );

    } catch (requestError) {
      setPlaylistDownload({
        status:
          "error",
        progress:
          0,
        trackProgress:
          {},
      });

      setError(
        requestError
          instanceof Error
          ? requestError.message
          : "Unable to download playlist.",
      );
    }
  }

  async function removeDownloadedSong(
    track,
  ) {
    const trackKey =
      String(
        track?.id ??
        "",
      ) +
      ":" +
      String(
        track?.media_version ??
        "",
      );

    if (
      !track?.id ||
      removingDownloadedTrackKey ===
        trackKey
    ) {
      return;
    }

    setRemovingDownloadedTrackKey(
      trackKey,
    );

    setError("");

    try {
      const removed =
        await removeTrackFromOffline(
          track,
          offlineOwnerKey,
        );

      if (!removed) {
        throw new Error(
          "Unable to remove this song from downloads.",
        );
      }

      const [
        nextTracks,
        nextPlaylists,
      ] =
        await Promise.all([
          getDownloadedTracks(
            offlineOwnerKey,
            {
              manualOnly:
                true,
            },
          ),
          getDownloadedPlaylists(
            offlineOwnerKey,
          ),
        ]);

      setDownloadedTracks(
        nextTracks,
      );

      setDownloadedPlaylists(
        nextPlaylists,
      );

      setRemoveDownloadedSongTarget(
        null,
      );

      globalThis.window
        ?.dispatchEvent(
          new CustomEvent(
            "hypersync:offline-downloads-changed",
          ),
        );
    } catch (requestError) {
      setError(
        requestError
          instanceof Error
          ? requestError.message
          : "Unable to remove this song from downloads.",
      );
    } finally {
      setRemovingDownloadedTrackKey(
        null,
      );
    }
  }


  async function confirmRemoveDownload() {
    if (
      !removeDownloadTarget ||
      removingDownload
    ) {
      return;
    }

    setRemovingDownload(
      true,
    );

    setError("");

    try {
      await removePlaylistFromOffline(
        removeDownloadTarget.id,
        offlineOwnerKey,
      );

      const nextDownloads =
        await getDownloadedPlaylists(
            offlineOwnerKey,
          );

      setDownloadedPlaylists(
        nextDownloads,
      );

      if (
        selectedPlaylist &&
        String(
          selectedPlaylist.id,
        ) ===
          String(
            removeDownloadTarget.id,
          )
      ) {
        setPlaylistDownload({
          status: "idle",
          progress: 0,
          trackProgress: {},
        });

        if (
          selectedPlaylist
            .is_offline_download
        ) {
          setSelectedPlaylist(
            null,
          );
        }
      }

      setRemoveDownloadTarget(
        null,
      );
    } catch (requestError) {
      setError(
        requestError
          instanceof Error
          ? requestError.message
          : "Unable to remove playlist download.",
      );
    } finally {
      setRemovingDownload(
        false,
      );
    }
  }


  async function toggleSelectedPlaylistSaved() {
    if (
      !selectedPlaylist ||
      selectedPlaylist.is_owner ||
      actionBusy
    ) {
      return;
    }

    if (!currentUser) {
      onOpenAuth?.();
      return;
    }

    const playlist = selectedPlaylist;
    const playlistId = String(playlist.id);
    const shouldSave = !playlist.is_saved;
    const optimisticPlaylist = {
      ...playlist,
      is_saved: shouldSave,
    };

    setActionBusy(true);
    setError("");
    setSelectedPlaylist(optimisticPlaylist);
    applySavedPlaylistMembership(
      libraryCacheKey,
      optimisticPlaylist,
      shouldSave,
    );
    window.dispatchEvent(new CustomEvent("hypersync:library-changed", {
      detail: {
        phase: "optimistic",
        playlist: optimisticPlaylist,
        saved: shouldSave,
        ownerKey: libraryCacheKey,
      },
    }));

    try {
      if (shouldSave) {
        await savePlaylist(playlistId);
      } else {
        await unsavePlaylist(playlistId);
      }

      settleSavedPlaylistMembership(libraryCacheKey, playlistId);
      window.dispatchEvent(new CustomEvent("hypersync:library-changed", {
        detail: {
          phase: "confirmed",
          playlist: optimisticPlaylist,
          saved: shouldSave,
          ownerKey: libraryCacheKey,
        },
      }));
    } catch (requestError) {
      const rollbackPlaylist = {
        ...playlist,
        is_saved: !shouldSave,
      };
      setSelectedPlaylist(current =>
        String(current?.id) === playlistId
          ? rollbackPlaylist
          : current,
      );
      applySavedPlaylistMembership(
        libraryCacheKey,
        rollbackPlaylist,
        !shouldSave,
      );
      settleSavedPlaylistMembership(libraryCacheKey, playlistId);
      window.dispatchEvent(new CustomEvent("hypersync:library-changed", {
        detail: {
          phase: "rollback",
          playlist: rollbackPlaylist,
          saved: !shouldSave,
          ownerKey: libraryCacheKey,
        },
      }));
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update your Library. The change was reverted.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  function playPlaylist(
    startIndex = 0,
    tracksOverride = null,
  ) {
    const tracks =
      Array.isArray(
        tracksOverride,
      )
        ? tracksOverride
        : (
            selectedPlaylist?.tracks ??
            []
          );

    if (
      tracks.length === 0
    ) {
      return;
    }

    const onlineNow =
      typeof navigator === "undefined" ||
      navigator.onLine !== false;

    const playbackTracks =
      filterOfflinePlayableTracks(
        [...tracks].sort(
          (left, right) =>
            Number(left?.position ?? 0) - Number(right?.position ?? 0),
        ),
        onlineNow,
        downloadedTrackIds,
      );

    if (!playbackTracks.length) {
      return;
    }

    const safeStartIndex = onlineNow
      ? Math.min(Math.max(0, startIndex), playbackTracks.length - 1)
      : Math.max(
          0,
          playbackTracks.findIndex(
            (track) => String(track.id) === String(tracks[startIndex]?.id),
          ),
        );

    const queue =
      playbackTracks.map(
        (track) => ({
          id:
            track.id,

          audioUrl:
            track.audio_url,

          artworkUrl:
            resolveArtworkUrl(
              track.artwork_url,
            ),

          mimeType:
            track.mime_type ??
            null,

          fileSize:
            track.file_size ??
            null,

          mediaVersion:
            track.media_version ??
            null,

          title:
            track.title,

          artist:
            track.artist,

          album:
            track.album ??
            "",

          genre:
            track.genre ??
            "",

          releaseYear:
            track.release_year ??
            track.releaseYear ??
            null,
        }),
      );

    void player.playTrackQueue(queue, safeStartIndex).catch(() => {});
  }


  function playLibraryTrackCollection(
    tracks,
    startIndex = 0,
  ) {
    const onlineNow =
      typeof navigator === "undefined" ||
      navigator.onLine !== false;

    const playableTracks =
      filterOfflinePlayableTracks(
        Array.isArray(tracks) ? tracks : [],
        onlineNow,
        downloadedTrackIds,
      );

    if (
      playableTracks.length ===
      0
    ) {
      return;
    }

    const safeStartIndex = onlineNow
      ? Math.min(Math.max(0, startIndex), playableTracks.length - 1)
      : Math.max(
          0,
          playableTracks.findIndex(
            (track) => String(track.id) === String(tracks[startIndex]?.id),
          ),
        );

    const queue =
      playableTracks.map(
        (track) => ({
          id:
            track.id,

          audioUrl:
            track.audio_url ??
            null,

          artworkUrl:
            resolveArtworkUrl(
              track.artwork_url,
            ),

          mimeType:
            track.mime_type ??
            null,

          fileSize:
            track.file_size ??
            null,

          mediaVersion:
            track.media_version ??
            null,

          title:
            track.title ??
            "",

          artist:
            track.artist ??
            "",

          album:
            track.album ??
            "",

          genre:
            track.genre ??
            "",

          releaseYear:
            track.release_year ??
            track.releaseYear ??
            null,
        }),
      );

    void player
      .playTrackQueue(
        queue,
        safeStartIndex,
      )
      .catch(() => {});
  }


  const libraryEntityTracks =
    useMemo(
      () =>
        mergeLibraryTracks(
          libraryTracks,
          allDownloadedTracks,
        ),
      [
        libraryTracks,
        allDownloadedTracks,
      ],
    );


  const downloadedTrackIds =
    useMemo(
      () =>
        new Set(
          allDownloadedTracks
            .filter(
              (track) =>
                track.offlineComplete,
            )
            .map(
              (track) =>
                String(
                  track.id,
                ),
            ),
        ),
      [
        allDownloadedTracks,
      ],
    );


  const libraryArtists =
    useMemo(
      () =>
        buildLibraryArtists(
          libraryEntityTracks,
        ),
      [
        libraryEntityTracks,
      ],
    );


  const libraryAlbums =
    useMemo(
      () =>
        buildLibraryAlbums(
          libraryEntityTracks,
        ),
      [
        libraryEntityTracks,
      ],
    );


  const activeLibraryEntity =
    useMemo(
      () => {
        if (
          !selectedLibraryEntity
        ) {
          return null;
        }

        const collection =
          selectedLibraryEntity.kind ===
            "artist"
            ? libraryArtists
            : libraryAlbums;

        return (
          collection.find(
            (item) =>
              item.key ===
              selectedLibraryEntity.key,
          ) ??
          null
        );
      },
      [
        selectedLibraryEntity,
        libraryArtists,
        libraryAlbums,
      ],
    );


  const activeLibraryCollection =
    activeTab === "Artists"
      ? libraryArtists
      : activeTab === "Albums"
        ? libraryAlbums
        : [];


  function renderLibraryEntityTracks(
    entity,
  ) {
    const tracks =
      sortResultItems(
        Array.isArray(
          entity?.tracks,
        )
          ? entity.tracks
          : [],
        sortMode,
      );

    const renderedTracks =
      getLibraryRenderItems(
        tracks,
        visibleEntityTrackCount,
      );

    return (
      <div className="hs-search-track-list">
        {renderedTracks.map(
          (
            track,
            index,
          ) => {
            const artwork =
              resolveArtworkUrl(
                track.artwork_url,
              );

            const isCurrentTrack =
              currentTrackId !== null &&
              String(
                track.id,
              ) ===
                currentTrackId;

            const playTrack =
              () => {
                playLibraryTrackCollection(
                  tracks,
                  index,
                );
              };

            return (
              <div
                key={
                  String(
                    track.id,
                  )
                }
                role="button"
                tabIndex={isOfflineUnavailableTrack(track, offlineMode, downloadedTrackIds) ? -1 : 0}
                {...trackActionMenu.getTriggerProps(
                  track,
                )}
                className={[
                  "hs-search-track",
                  "hs-library-track-row",

                  isCurrentTrack
                    ? "is-current-track"
                    : "",
                  isOfflineUnavailableTrack(
                    track,
                    offlineMode,
                    downloadedTrackIds,
                  )
                    ? "is-offline-unavailable"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => {
                  if (!isOfflineUnavailableTrack(track, offlineMode, downloadedTrackIds)) {
                    void player.warmTrackForPlayback(track.id, track);
                  }
                }}
                onFocus={() => {
                  if (!isOfflineUnavailableTrack(track, offlineMode, downloadedTrackIds)) {
                    void player.warmTrackForPlayback(track.id, track);
                  }
                }}
                onClick={() => {
                  if (!isOfflineUnavailableTrack(track, offlineMode, downloadedTrackIds)) {
                    playTrack();
                  }
                }}
                onKeyDown={(
                  event,
                ) => {
                  if (
                    event.key ===
                      "Enter" ||
                    event.key ===
                      " "
                  ) {
                    event.preventDefault();
                    if (!isOfflineUnavailableTrack(track, offlineMode, downloadedTrackIds)) {
                      playTrack();
                    }
                  }
                }}
              >
                <span className="hs-search-track__rank">
                  {String(
                    index + 1,
                  ).padStart(
                    2,
                    "0",
                  )}
                </span>

                <span className="hs-search-track__art">
                  {artwork ? (
                    <img
                      src={artwork}
                      alt=""
                    />
                  ) : (
                    <Icon
                      name="music"
                      size={20}
                    />
                  )}

                  <i aria-hidden="true">
                    <Icon
                      name="play"
                      size={15}
                    />
                  </i>
                </span>

                <span className="hs-search-track__copy">
                  <strong>
                    {track.title}
                  </strong>

                  <small>
                    {track.artist ||
                      "Unknown Artist"}

                    {track.album
                      ? ` • ${track.album}`
                      : ""}
                  </small>
                </span>

                <span className="hs-search-track__signals">
                  <em
                    className={
                      track.offlineDownloadIncomplete
                        ? "is-download-incomplete"
                        : ""
                    }
                  >
                    {downloadedTrackIds.has(
                      String(
                        track.id,
                      ),
                    )
                      ? "OFFLINE"
                      : track.offlineDownloadIncomplete
                        ? "DOWNLOAD INCOMPLETE"
                        : "IN LIBRARY"}
                  </em>

                  <small>
                    {activeTab ===
                    "Artists"
                      ? (
                          track.album ||
                          "Single"
                        )
                      : (
                          track.artist ||
                          "Unknown Artist"
                        )}
                  </small>
                </span>

                <span className="hs-search-track__duration">
                  {formatTrackDuration(
                    track.duration_seconds,
                  )}
                </span>

                <span className="hs-search-track__play">
                  <Icon
                    name="play"
                    size={16}
                  />
                </span>
              </div>
            );
          },
        )}
        <LibraryLoadMore
          label="tracks"
          visibleCount={
            renderedTracks.length
          }
          totalCount={
            tracks.length
          }
          onClick={() => {
            setVisibleEntityTrackCount(
              (current) =>
                getNextLibraryRenderCount(
                  current,
                  tracks.length,
                ),
            );
          }}
        />

      </div>
    );
  }


  const onlinePlaylists = [
    ...ownedPlaylists,

    ...savedPlaylists.filter(
      (savedPlaylist) =>
        !ownedPlaylists.some(
          (ownedPlaylist) =>
            ownedPlaylist.id ===
            savedPlaylist.id,
        ),
    ),
  ];

  const downloadedById =
    new Map(
      downloadedPlaylists.map(
        (playlist) => [
          String(
            playlist.id,
          ),
          playlist,
        ],
      ),
    );

  const visiblePlaylists = [
    ...onlinePlaylists.map(
      (playlist) => {
        const downloaded =
          downloadedById.get(
            String(
              playlist.id,
            ),
          );

        return downloaded
          ? {
              ...playlist,
              is_offline_download:
                true,
            }
          : playlist;
      },
    ),

    ...downloadedPlaylists.filter(
      (downloaded) =>
        !onlinePlaylists.some(
          (playlist) =>
            String(
              playlist.id,
            ) ===
            String(
              downloaded.id,
            ),
        ),
    ),
  ];

  const sortedDownloadedTracks =
    useMemo(
      () =>
        sortResultItems(
          downloadedTracks,
          sortMode,
        ),
      [
        downloadedTracks,
        sortMode,
      ],
    );

  const online =
    useOnlineStatus();

  const offlineMode =
    !online;

  const visibleSongTracks =
    focusedLibraryTrack
      ? [focusedLibraryTrack]
      : offlineMode
        ? sortResultItems(
            mergeLibraryTracks(
              libraryTracks,
              allDownloadedTracks,
            ),
            sortMode,
          )
        : sortedDownloadedTracks;

  const renderedSongTracks =
    getLibraryRenderItems(
      visibleSongTracks,
      visibleDownloadedTrackCount,
    );

  const sortedVisiblePlaylists =
    useMemo(
      () =>
        sortPinnedPlaylists(
          sortResultItems(
            visiblePlaylists,
            sortMode,
          ),
          pinnedPlaylistIds,
        ),
      [
        visiblePlaylists,
        sortMode,
        pinnedPlaylistIds,
      ],
    );

  // Library playlists are rendered in full; do not hide the collection
  // behind a manual "Show more" action.
  const renderedVisiblePlaylists =
    sortedVisiblePlaylists;

  const sortedActiveLibraryCollection =
    useMemo(
      () =>
        sortResultItems(
          activeLibraryCollection,
          sortMode,
        ),
      [
        activeLibraryCollection,
        sortMode,
      ],
    );

  const renderedActiveLibraryCollection =
    getLibraryRenderItems(
      sortedActiveLibraryCollection,
      visibleEntityCardCount,
    );

  const sortedSelectedPlaylistTracks =
    useMemo(
      () =>
        sortResultItems(
          selectedPlaylist?.tracks ??
            [],
          sortMode,
        ),
      [
        selectedPlaylist?.tracks,
        sortMode,
      ],
    );

  const selectedPlaylistIsLiked =
    Boolean(
      selectedPlaylist &&
      playlistPresentation(
        selectedPlaylist,
      ).kind ===
        "liked",
    );

  const likedGenreOptions =
    useMemo(
      () =>
        selectedPlaylistIsLiked
          ? Array.from(
              new Set(
                (
                  selectedPlaylist?.tracks ??
                  []
                )
                  .map(
                    (track) =>
                      String(
                        track?.genre ??
                        "",
                      ).trim(),
                  )
                  .filter(Boolean),
              ),
            ).sort(
              (
                left,
                right,
              ) =>
                left.localeCompare(
                  right,
                ),
            )
          : [],
      [
        selectedPlaylist?.tracks,
        selectedPlaylistIsLiked,
      ],
    );

  const genreFilteredSelectedPlaylistTracks =
    useMemo(
      () => {
        if (
          !selectedPlaylistIsLiked ||
          likedGenreFilter ===
            "all"
        ) {
          return (
            sortedSelectedPlaylistTracks
          );
        }

        return (
          sortedSelectedPlaylistTracks
          .filter(
            (track) =>
              String(
                track?.genre ??
                  "",
              )
                .trim()
                .toLocaleLowerCase()
              ===
              likedGenreFilter
                .toLocaleLowerCase(),
          )
        );
      },
      [
        sortedSelectedPlaylistTracks,
        selectedPlaylistIsLiked,
        likedGenreFilter,
      ],
    );

  const filteredSelectedPlaylistTracks =
    useMemo(
      () =>
        filterPlaylistTracks(
          genreFilteredSelectedPlaylistTracks,
          playlistSearchQuery,
        ),
      [
        genreFilteredSelectedPlaylistTracks,
        playlistSearchQuery,
      ],
    );

  // Show every track in the opened playlist immediately.
  const renderedSelectedPlaylistTracks =
    filteredSelectedPlaylistTracks;

  useEffect(() => {
    setPlaylistSearchQuery(
      "",
    );

    setLikedGenreFilter(
      "all",
    );
  }, [
    selectedPlaylist?.id,
  ]);

  if (
    !isRegistered &&
    downloadedPlaylists.length ===
      0
  ) {
  return (
    <div className="page-stack hs-search-page hs-library-page">

      <section className="hs-search-console hs-library-console">

        <div
          className="hs-search-console__grid"
          aria-hidden="true"
        />

        <div
          className={
            "hs-search-console__ambient " +
            "hs-search-console__ambient--one"
          }
          aria-hidden="true"
        />

        <div
          className={
            "hs-search-console__ambient " +
            "hs-search-console__ambient--two"
          }
          aria-hidden="true"
        />


        <div className="hs-search-console__heading">

          <div className="hs-search-console__intro">

            <div className="hs-search-console__eyebrow-row">

              <span className="hs-search-eyebrow">
                <i aria-hidden="true" />

                HYPERSYNCED LIBRARY
              </span>

            </div>


            <h2>
              Keep your music together
            </h2>

          </div>


          <div className="hs-search-console__actions">
            <button
              type="button"
              className="hs-search-primary-action"
              onClick={
                onOpenAuth
              }
            >
              <Icon
                name="library"
                size={16}
              />

              Sign in
            </button>

          </div>

        </div>


        <div className="hs-search-console__status">

          <span
            className={
              "hs-search-status-chip " +
              "hs-search-status-chip--primary"
            }
          >
            <i />

            ACCOUNT REQUIRED
          </span>


          <span className="hs-search-status-chip">
            PLAYLIST SYNC
          </span>


          <span className="hs-search-status-chip">
            CLOUD LIBRARY
          </span>

        </div>

      </section>


      <section className="hs-search-message">

        <div>
          <strong>
            Sign in to use your Library
          </strong>

          <p>
            Create playlists, save collections,
            and keep them synced across HyperSynced.
          </p>
        </div>

      </section>

    </div>
  );
}

  const playlistDownloadPercent =
  Math.round(
    (
      playlistDownload.progress ??
      0
    ) *
      100,
  );

  if (openingPlaylistId) {
    return (
      <div className="page-stack hs-search-page hs-library-page hs-playlist-loading-view" aria-busy="true" aria-label="Loading playlist">
        <div className="hs-search-playlist-view__nav">
          <button type="button" className="hs-search-playlist-back" onClick={() => { setOpeningPlaylistId(null); selectedPlaylistIdRef.current = null; }}>
            <Icon name="chevron" size={15} /> Back to Library
          </button>
        </div>
        <section className="hs-playlist-loading-hero">
          <div className="hs-playlist-loading-art hs-playlist-shimmer" />
          <div className="hs-playlist-loading-copy">
            <span className="hs-playlist-shimmer hs-playlist-loading-label" />
            <span className="hs-playlist-shimmer hs-playlist-loading-title" />
            <span className="hs-playlist-shimmer hs-playlist-loading-meta" />
            <span className="hs-playlist-shimmer hs-playlist-loading-action" />
          </div>
        </section>
        <section className="hs-playlist-loading-rows" aria-label="Songs loading">
          {Array.from({ length: 7 }, (_, index) => (
            <div className="hs-playlist-loading-row" key={index}>
              <span className="hs-playlist-shimmer hs-playlist-loading-rank" />
              <span className="hs-playlist-shimmer hs-playlist-loading-thumb" />
              <span className="hs-playlist-loading-row-copy">
                <span className="hs-playlist-shimmer hs-playlist-loading-song" />
                <span className="hs-playlist-shimmer hs-playlist-loading-artist" />
              </span>
              <span className="hs-playlist-shimmer hs-playlist-loading-duration" />
            </div>
          ))}
        </section>
      </div>
    );
  }

  if (selectedPlaylist) {
  const presentation =
    playlistPresentation(
      selectedPlaylist,
    );

  return (
    <div
      className="page-stack hs-search-page hs-library-page"
      {...resultsSortMenu.getTriggerProps()}
    >

      <section
        className={
          "hs-search-playlist-view " +
          "hs-library-playlist-view " +
          `hs-library-playlist-view--${presentation.kind}`
        }
      >

        <div className="hs-search-playlist-view__nav">

          <button
            type="button"
            className="hs-search-playlist-back"
            onClick={() => {
              selectedPlaylistIdRef.current = null;
              setPlaylistSearchQuery(
                "",
              );

              setSelectedPlaylist(
                null,
              );
            }}
          >
            <Icon
              name="chevron"
              size={15}
            />

            Back to Library
          </button>

        </div>


        <section className="hs-search-playlist-view__hero">

          <div className="hs-search-playlist-view__art">

            <PlaylistArtwork
              tracks={
                selectedPlaylist.tracks
              }
              artworkUrls={
                selectedPlaylist.artwork_urls
              }
              artworkUrl={
                selectedPlaylist.artwork_url
              }
              fallbackSize={32}
            />

          </div>


          <div className="hs-search-playlist-view__copy">

            <span>
              {presentation.label}
            </span>


            <h2>
              {selectedPlaylist.title}
            </h2>


            {selectedPlaylist.description ? (
              <p>
                {selectedPlaylist.description}
              </p>
            ) : null}


            <small>
              {presentation.owner}

              {" • "}

              {selectedPlaylist.track_count}

              {" "}

              {selectedPlaylist.track_count ===
              1
                ? "track"
                : "tracks"}

              {" • "}

              {formatDuration(
                selectedPlaylist.total_duration_seconds,
              )}
            </small>


            <div className="hs-search-playlist-view__actions">

              <button
                type="button"
                className="hs-search-playlist-primary"
                disabled={
                  selectedPlaylist.tracks.length ===
                  0
                }
                onClick={() => {
                  playPlaylist(
                    0,
                    selectedPlaylist.tracks,
                  );
                }}
              >
                <Icon
                  name="play"
                  size={15}
                />

                Play
              </button>


              <button
                type="button"
                className="hs-search-playlist-action"
                disabled={
                  selectedPlaylist.tracks.length ===
                    0 ||
                  playlistDownload.status ===
                    "downloading"
                }
                onClick={() => {
                  if (
                    playlistDownload.status ===
                      "downloaded"
                  ) {
                    setRemoveDownloadTarget(
                      selectedPlaylist,
                    );
                  } else {
                    void downloadPlaylist();
                  }
                }}
              >
                <Icon
                  name={
                    playlistDownload.status ===
                      "downloaded"
                      ? "check"
                      : "download"
                  }
                  size={14}
                />

                {playlistDownload.status ===
                "downloading"
                  ? `${playlistDownloadPercent}%`
                  : playlistDownload.status ===
                      "downloaded"
                    ? "Downloaded"
                    : playlistDownload.status ===
                        "paused"
                      ? "Resume"
                      : "Download"}
              </button>


              {!selectedPlaylist.is_owner &&
              isRegistered ? (
                <button
                  type="button"
                  className="hs-search-playlist-action"
                  disabled={
                    actionBusy
                  }
                  title={
                    selectedPlaylist.is_saved
                      ? "Remove from Library"
                      : "Add to Library"
                  }
                  onClick={() => {
                    void toggleSelectedPlaylistSaved();
                  }}
                >
                  <Icon
                    name={
                      selectedPlaylist.is_saved
                        ? "check"
                        : "plus"
                    }
                    size={14}
                  />

                  {selectedPlaylist.is_saved
                    ? "In Library"
                    : "Add to Library"}
                </button>
              ) : null}


              {selectedPlaylist.is_owner ? (
                <button
                  type="button"
                  className={
                    "hs-search-playlist-action " +
                    "hs-library-danger-action"
                  }
                  disabled={
                    actionBusy
                  }
                  onClick={() => {
                    void handleDeletePlaylist();
                  }}
                >
                  Delete
                </button>
              ) : null}

            </div>

          </div>

        </section>


        {error ? (
          <section className="hs-search-message hs-search-message--error">

            <div>
              <strong>
                PLAYLIST ERROR
              </strong>

              <p>
                {error}
              </p>
            </div>

          </section>
        ) : null}


        <section className="hs-search-section">

          <div className="hs-search-section__heading">

            <div>
              <span>
                PLAYLIST CONTENT
              </span>

              <h3>
                Tracks
              </h3>
            </div>

            <strong>
              {(
                playlistSearchQuery.trim() ||
                likedGenreFilter !==
                  "all"
              )
                ? (
                    filteredSelectedPlaylistTracks.length +
                    " / " +
                    selectedPlaylist.tracks.length
                  )
                : selectedPlaylist.tracks.length}
            </strong>

          </div>

          {selectedPlaylist.tracks.length >
          0 ? (
            <div className="hs-playlist-track-search">
              <div className="hs-playlist-track-search__controls">
                <label className="hs-playlist-track-search__query">
                  <Icon
                    name="search"
                    size={15}
                  />

                  <input
                    type="search"
                    value={
                      playlistSearchQuery
                    }
                    placeholder="Search in playlist"
                    aria-label={
                      `Search in ${selectedPlaylist.title}`
                    }
                    onChange={(
                      event,
                    ) => {
                      setPlaylistSearchQuery(
                        event.target.value,
                      );
                    }}
                  />
                </label>

                {presentation.kind ===
                  "liked" &&
                likedGenreOptions.length >
                  0 ? (
                  <label className="hs-liked-genre-filter">
                    <span>
                      Genre
                    </span>

                    <select
                      value={
                        likedGenreFilter
                      }
                      aria-label="Filter Liked Songs by genre"
                      onChange={(
                        event,
                      ) => {
                        setLikedGenreFilter(
                          event.target.value,
                        );
                      }}
                    >
                      <option value="all">
                        All genres
                      </option>

                      {likedGenreOptions.map(
                        (genre) => (
                          <option
                            key={
                              genre
                            }
                            value={
                              genre
                            }
                          >
                            {genre}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="hs-playlist-track-search__meta">
                <span>
                  {(
                    playlistSearchQuery.trim() ||
                    likedGenreFilter !==
                      "all"
                  )
                    ? (
                        filteredSelectedPlaylistTracks.length +
                        " of " +
                        selectedPlaylist.tracks.length +
                        " tracks"
                      )
                    : (
                        selectedPlaylist.tracks.length +
                        (
                          selectedPlaylist.tracks.length ===
                            1
                            ? " track"
                            : " tracks"
                        )
                      )}
                </span>

                {(
                  playlistSearchQuery ||
                  likedGenreFilter !==
                    "all"
                ) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPlaylistSearchQuery(
                        "",
                      );

                      setLikedGenreFilter(
                        "all",
                      );
                    }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}


          {selectedPlaylist.tracks.length ===
          0 ? (

            <div className="hs-library-empty">

              <Icon
                name="music"
                size={22}
              />

              <div>
                <strong>
                  Nothing here yet
                </strong>

                <p>
                  Add songs from Search and they’ll
                  appear here instantly.
                </p>
              </div>

            </div>

          ) : filteredSelectedPlaylistTracks.length ===
          0 ? (

            <div className="hs-library-empty hs-playlist-search-empty">

              <Icon
                name="search"
                size={22}
              />

              <div>
                <strong>
                  No matches in this playlist
                </strong>

                <p>
                  Try a song title, artist, or album.
                </p>
              </div>

            </div>

          ) : (

            <div className="hs-search-track-list">

              {renderedSelectedPlaylistTracks.map(
                (
                  track,
                  trackIndex,
                ) => {
                  const trackArtwork =
                    resolveArtworkUrl(
                      offlineMode
                        ? getOfflineArtworkUrl(track.id, track.artwork_version ?? track.artworkVersion)
                        : track.artwork_url,
                    ) ??
                    resolveArtworkUrl(
                      track.artwork_url,
                    );

                  const isCurrentTrack =
                    currentTrackId !== null &&
                    String(
                      track.id,
                    ) ===
                      currentTrackId;

                  return (
                    <div
                      key={
                        track.playlist_track_id ??
                        (
                          String(
                            track.id,
                          ) +
                          ":" +
                          String(
                            track.media_version ??
                            "",
                          ) +
                          ":" +
                          String(
                            trackIndex,
                          )
                        )
                      }
                      role="button"
                      tabIndex={isOfflineUnavailableTrack(track, offlineMode, downloadedTrackIds) ? -1 : 0}
                      {...trackActionMenu.getTriggerProps(
                        track,
                        {
                          hideLikeAction:
                            presentation.kind ===
                            "liked",

                          actions:
                            selectedPlaylist.is_owner &&
                            selectedPlaylist.visibility !==
                              "generated"
                              ? [
                                  {
                                    id:
                                      "remove-from-playlist",
                                    label:
                                      "Remove from playlist",
                                    icon:
                                      "playlist",
                                    danger:
                                      true,
                                    disabled:
                                      actionBusy,
                                    onSelect:
                                      () =>
                                        handleRemoveTrack(
                                          track.playlist_track_id,
                                        ),
                                  },
                                ]
                              : [],
                        },
                      )}
                      className={[
                        "hs-search-track",
                        "hs-search-track--playlist-download",
                        "hs-library-track-row",

                        isCurrentTrack
                          ? "is-current-track"
                          : "",
                        isOfflineUnavailableTrack(
                          track,
                          offlineMode,
                          downloadedTrackIds,
                        )
                          ? "is-offline-unavailable"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => {
                        if (!isOfflineUnavailableTrack(track, offlineMode, downloadedTrackIds)) {
                          playPlaylist(trackIndex, filteredSelectedPlaylistTracks);
                        }
                      }}
                      onKeyDown={(
                        event,
                      ) => {
                        if (
                          event.key ===
                            "Enter" ||
                          event.key ===
                            " "
                        ) {
                          event.preventDefault();

                          if (!isOfflineUnavailableTrack(track, offlineMode, downloadedTrackIds)) {
                            playPlaylist(trackIndex, filteredSelectedPlaylistTracks);
                          }
                        }
                      }}
                    >

                      <span className="hs-search-track__rank">
                        {String(
                          trackIndex + 1,
                        ).padStart(
                          2,
                          "0",
                        )}
                      </span>


                      <span className="hs-search-track__art">

                        {trackArtwork ? (
                          <img
                            src={
                              trackArtwork
                            }
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <Icon
                            name="music"
                            size={20}
                          />
                        )}

                        <i aria-hidden="true">
                          <Icon
                            name="play"
                            size={15}
                          />
                        </i>

                      </span>


                      <span className="hs-search-track__copy">

                        <strong>
                          {track.title}
                        </strong>

                        <small>
                          {track.artist}

                          {track.album
                            ? ` • ${track.album}`
                            : ""}
                        </small>

                      </span>


                      <span className="hs-search-track__signals">

                        <em>
                          {presentation.label}
                        </em>

                        <small>
                          {track.album ||
                            selectedPlaylist.title}
                        </small>

                      </span>


                      <span className="hs-search-track__duration">
                        {formatTrackDuration(
                          track.duration_seconds,
                        )}
                      </span>


                      {(() => {
                        const state =
                          playlistDownload
                            .trackProgress?.[
                              String(
                                track.id,
                              )
                            ] ??
                          null;

                        if (
                          !state &&
                          playlistDownload.status ===
                            "idle"
                        ) {
                          return (
                            <span
                              className="hs-search-track__download hs-search-playlist-spacer"
                              aria-hidden="true"
                            />
                          );
                        }

                        const progress =
                          Math.round(
                            (
                              state?.progress ??
                              (
                                playlistDownload.status ===
                                  "downloaded"
                                  ? 1
                                  : 0
                              )
                            ) *
                              100,
                          );

                        const done =
                          state?.status ===
                            "downloaded" ||
                          playlistDownload.status ===
                            "downloaded";

                        return (
                          <span
                            className={[
                              "hs-search-track__download",
                              done
                                ? "is-downloaded"
                                : "is-downloading",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={{
                              "--download-progress":
                                `${progress}%`,
                            }}
                            title={
                              done
                                ? "Downloaded"
                                : `Downloading ${progress}%`
                            }
                            aria-label={
                              done
                                ? `${track.title} downloaded`
                                : `Downloading ${track.title}: ${progress}%`
                            }
                          >
                            {done ? (
                              <Icon
                                name="check"
                                size={15}
                              />
                            ) : progress > 0 ? (
                              <span className="hs-search-track__download-progress">
                                {progress}
                              </span>
                            ) : (
                              <Icon
                                name="download"
                                size={15}
                              />
                            )}
                          </span>
                        );
                      })()}


                      <span className="hs-search-track__play">
                        <Icon
                          name="play"
                          size={16}
                        />
                      </span>


                    </div>
                  );
                },
              )}



            </div>

          )}

        </section>

      </section>


      <DownloadRemovalConfirm
        open={
          Boolean(
            removeDownloadTarget,
          )
        }
        playlistTitle={
          removeDownloadTarget
            ?.title
        }
        busy={
          removingDownload
        }
        onCancel={() => {
          if (
            !removingDownload
          ) {
            setRemoveDownloadTarget(
              null,
            );
          }
        }}
        onConfirm={() => {
          void confirmRemoveDownload();
        }}
      />


      <ResultsSortMenu
        menu={
          resultsSortMenu.menu
        }
        mode={
          sortMode
        }
        onClose={
          resultsSortMenu.closeMenu
        }
        onSelect={
          setSortMode
        }
      />

      <TrackActionMenu
        menu={
          trackActionMenu.menu
        }
        onClose={
          trackActionMenu.closeMenu
        }
        currentUser={
          currentUser
        }
        onRequireAuth={
          onOpenAuth
        }
      />

      <CollectionActionMenu
        menu={
          collectionActionMenu.menu
        }
        onClose={
          collectionActionMenu.closeMenu
        }
      />

    </div>
  );
}

  return (
  <div
    className="page-stack hs-search-page hs-library-page"
    {...resultsSortMenu.getTriggerProps()}
  >

    <section className="hs-search-console hs-library-console">

      <div
        className="hs-search-console__grid"
        aria-hidden="true"
      />

      <div
        className={
          "hs-search-console__ambient " +
          "hs-search-console__ambient--one"
        }
        aria-hidden="true"
      />

      <div
        className={
          "hs-search-console__ambient " +
          "hs-search-console__ambient--two"
        }
        aria-hidden="true"
      />


      <div className="hs-search-console__heading">

        <div className="hs-search-console__intro">

          <div className="hs-search-console__eyebrow-row">

            <span className="hs-search-eyebrow">
              <i aria-hidden="true" />

              HYPERSYNCED LIBRARY
            </span>

          </div>


          <h2>
            Your music, all in one place
          </h2>

        </div>


        {isRegistered ? (
          <button
            type="button"
            className="hs-search-primary-action"
            onClick={() => {
              setCreateOpen(
                true,
              );
            }}
          >
            <Icon
              name="plus"
              size={16}
            />

            New Playlist
          </button>
        ) : (
          <button
            type="button"
            className="hs-search-primary-action"
            onClick={
              onOpenAuth
            }
          >
            <Icon
              name="library"
              size={16}
            />

            Sign in
          </button>
        )}

      </div>


      <div
        className="hs-search-filterbar"
        role="tablist"
      >

        {LIBRARY_TABS.map(
          (tab) => (
            <button
              type="button"
              role="tab"
              key={
                tab
              }
              aria-selected={
                activeTab ===
                tab
              }
              className={
                activeTab ===
                tab
                  ? "is-active"
                  : ""
              }
              onClick={() => {
                setActiveTab(
                  tab,
                );

                setSelectedLibraryEntity(
                  null,
                );

                setFocusedLibraryTrack(
                  null,
                );
              }}
            >

              <span>
                {tab}
              </span>


              {tab === "Playlists" ? (
              <strong>
                {visiblePlaylists.length}
              </strong>
            ) : tab === "Artists" ? (
              <strong>
                {libraryArtists.length}
              </strong>
            ) : tab === "Albums" ? (
              <strong>
                {libraryAlbums.length}
              </strong>
            ) : tab === "Songs" ? (
              <strong>
                {downloadedTracks.length}
              </strong>
            ) : null}

            </button>
          ),
        )}

      </div>


      <div className="hs-search-console__status">

        <span
          className={
            "hs-search-status-chip " +
            "hs-search-status-chip--primary"
          }
        >
          <i />
        </span>


        <span className="hs-search-status-chip">
          {ownedPlaylists.length}
          {" OWNED"}
        </span>


        <span className="hs-search-status-chip">
          {savedPlaylists.length}
          {" SAVED"}
        </span>

      </div>

    </section>


    {offlineMode &&
      downloadedPlaylists.length === 0 &&
      allDownloadedTracks.length === 0 &&
      libraryTracks.length === 0 &&
      ownedPlaylists.length === 0 &&
      savedPlaylists.length === 0 ? (
        <OfflineNotice
          title="Go online to download music"
          description="Your Library is empty. Reconnect to HyperSynced to add music and download it for offline listening."
        />
      ) : null}

    {error && online ? (
      <section className="hs-search-message hs-search-message--error">

        <div>
          <strong>
            LIBRARY ERROR
          </strong>

          <p>
            {error}
          </p>
        </div>

      </section>
    ) : null}


    {activeTab === "Songs" ? (

      <section className="hs-search-section hs-library-collection">

        <div className="hs-search-section__heading">

          <div>
            <span>
              {focusedLibraryTrack
                ? "LIBRARY ITEM"
                : "OFFLINE CONTENT"}
            </span>

            <h3>
              {focusedLibraryTrack
                ? "Shared song"
                : "Downloaded songs"}
            </h3>
          </div>

          <strong>
            {visibleSongTracks.length}
          </strong>

        </div>

        {visibleSongTracks.length === 0 ? (

          offlineMode ? (
            <OfflineNotice
              title="Go online to download music"
              description="Connect to HyperSynced to add songs to your library and download them for offline listening."
            />
          ) : (
            <div className="hs-library-empty">
              <Icon name="music" size={22} />
              <div>
                <strong>Nothing here yet</strong>
                <p>Add songs to your Library and they'll appear here.</p>
              </div>
            </div>
          )

        ) : (

          <div className="hs-search-track-list">

            {renderedSongTracks.map(
              (
                track,
                index,
              ) => {
                const artwork =
                  resolveArtworkUrl(
                    track.artwork_url,
                  );

                const isCurrentTrack =
                  currentTrackId !== null &&
                  String(
                    track.id,
                  ) ===
                    currentTrackId;

                const playDownloadedTrack =
                  () => {
                    void player.playTrack(
                      track.id,
                      {
                        artworkUrl:
                          track.artwork_url ??
                          null,
                        title:
                          track.title ??
                          "",
                        artist:
                          track.artist ??
                          "",
                        mimeType:
                          track.mime_type ??
                          null,
                        fileSize:
                          track.file_size ??
                          null,
                        mediaVersion:
                          track.media_version ??
                          null,

                        genre:
                          track.genre ??
                          "",

                        releaseYear:
                          track.release_year ??
                          null,
                      },
                    ).catch(
                      () => {},
                    );
                  };

                return (
                  <div
                    key={
                      String(
                        track.id,
                      ) +
                      ":" +
                      String(
                        track.media_version ??
                        "",
                      )
                    }
                    role="button"
                    tabIndex={offlineMode && !downloadedTrackIds.has(String(track.id)) ? -1 : 0}
                    {...(!offlineMode || downloadedTrackIds.has(String(track.id))
                      ? trackActionMenu.getTriggerProps(track)
                      : {})}
                    className={[
                      "hs-search-track",
                      "hs-library-track-row",
                      !downloadedTrackIds.has(String(track.id)) && offlineMode
                        ? "is-offline-unavailable"
                        : "",
                      isCurrentTrack
                        ? "is-current-track"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-disabled={offlineMode && !downloadedTrackIds.has(String(track.id))}
                    onClick={
                      offlineMode && !downloadedTrackIds.has(String(track.id))
                        ? undefined
                        : playDownloadedTrack
                    }
                    onKeyDown={(
                      event,
                    ) => {
                      if (
                        (event.key === "Enter" || event.key === " ") &&
                        !(offlineMode && !downloadedTrackIds.has(String(track.id)))
                      ) {
                        event.preventDefault();
                        playDownloadedTrack();
                      }
                    }}
                  >

                    <span className="hs-search-track__rank">
                      {String(
                        index + 1,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </span>

                    <span className="hs-search-track__art">
                      {artwork ? (
                        <img
                          src={artwork}
                          alt=""
                        />
                      ) : (
                        <Icon
                          name="music"
                          size={20}
                        />
                      )}

                      <i aria-hidden="true">
                        <Icon
                          name="play"
                          size={15}
                        />
                      </i>
                    </span>

                    <span className="hs-search-track__copy">
                      <strong>
                        {track.title}
                      </strong>

                      <small>
                        {track.artist ||
                          "Unknown Artist"}
                      </small>
                    </span>

                    <span className="hs-search-track__signals">
                      <em>
                        {focusedLibraryTrack
                          ? "IN LIBRARY"
                          : "DOWNLOADED"}
                      </em>

                      <small>
                        {track.album ||
                          (
                            focusedLibraryTrack
                              ? "Library"
                              : "Offline"
                          )}
                      </small>
                    </span>

                    <span className="hs-search-track__duration">
                      {formatTrackDuration(
                        track.duration_seconds,
                      )}
                    </span>

                    <span className="hs-search-track__play">
                      {!focusedLibraryTrack ? (
                        <button
                          type="button"
                          className="hs-search-track__download is-downloaded hs-download-remove-trigger"
                          disabled={
                            removingDownloadedTrackKey ===
                            (
                              String(
                                track.id,
                              ) +
                              ":" +
                              String(
                                track.media_version ??
                                "",
                              )
                            )
                          }
                          title="Remove from downloads"
                          aria-label={`Remove ${track.title} from downloads`}
                          onClick={(event) => {
                            event.stopPropagation();

                            setRemoveDownloadedSongTarget(
                              track,
                            );
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          {removingDownloadedTrackKey ===
                          (
                            String(
                              track.id,
                            ) +
                            ":" +
                            String(
                              track.media_version ??
                              "",
                            )
                          ) ? (
                            <span className="library-spinner" />
                          ) : (
                            <Icon
                              name="check"
                              size={15}
                            />
                          )}
                        </button>
                      ) : null}
                    </span>

                  </div>
                );
              },
            )}

            <LibraryLoadMore
              label="downloaded songs"
              visibleCount={renderedSongTracks.length}
              totalCount={visibleSongTracks.length}
              onClick={() => {
                setVisibleDownloadedTrackCount((current) =>
                  getNextLibraryRenderCount(
                    current,
                    visibleSongTracks.length,
                  ),
                );
              }}
            />

          </div>

        )}

      </section>

    ) : (
      activeTab === "Artists" ||
      activeTab === "Albums"
    ) ? (

      <section className="hs-search-section hs-library-collection">

        <div className="hs-search-section__heading">

          <div>

            {activeLibraryEntity ? (
              <button
                type="button"
                className="hs-search-playlist-back hs-library-entity-back"
                onClick={() => {
                  setSelectedLibraryEntity(
                    null,
                  );
                }}
              >
                <Icon
                  name="chevron"
                  size={14}
                />

                Back to
                {" "}
                {activeTab}
              </button>
            ) : (
              <span>
                LIBRARY INDEX
              </span>
            )}

            <h3>
              {activeLibraryEntity
                ? (
                    activeTab ===
                    "Artists"
                      ? activeLibraryEntity
                          .name
                      : activeLibraryEntity
                          .title
                  )
                : activeTab}
            </h3>

            {activeLibraryEntity ? (
              <small className="hs-library-entity-subtitle">
                {activeTab ===
                "Artists"
                  ? `${activeLibraryEntity.album_count} ${activeLibraryEntity.album_count === 1 ? "album" : "albums"}`
                  : activeLibraryEntity.artist}
              </small>
            ) : null}

          </div>

          <strong>
            {activeLibraryEntity
              ? activeLibraryEntity.track_count
              : activeLibraryCollection.length}
          </strong>

        </div>

        {loading ? (

          <div className="hs-library-loading">

            <span className="library-spinner" />

            <span>
              Loading
              {" "}
              {activeTab.toLowerCase()}
              ...
            </span>

          </div>

        ) : activeLibraryEntity ? (

          renderLibraryEntityTracks(
            activeLibraryEntity,
          )

        ) : activeLibraryCollection.length ===
          0 ? (

          <div className="hs-library-empty">

            <Icon
              name={
                activeTab ===
                  "Artists"
                  ? "music"
                  : "disc"
              }
              size={22}
            />

            <div>
              <strong>
                No
                {" "}
                {activeTab.toLowerCase()}
                {" "}
                in your Library yet
              </strong>

              <p>
                Like songs or add music to a
                playlist and its
                {" "}
                {activeTab ===
                "Artists"
                  ? "artists"
                  : "albums"}
                {" "}
                will appear here.
              </p>
            </div>

          </div>

        ) : (

          <div className="hs-search-entity-grid hs-library-entity-grid">

            {renderedActiveLibraryCollection.map(
              (entity) => {
                const artwork =
                  resolveArtworkUrl(
                    entity.artwork_url,
                  );

                const isArtist =
                  activeTab ===
                  "Artists";

                const offlineTrackCount =
                  (
                    Array.isArray(
                      entity.tracks,
                    )
                      ? entity.tracks
                      : []
                  ).filter(
                    (track) =>
                      downloadedTrackIds.has(
                        String(
                          track.id,
                        ),
                      ),
                  ).length;

                return (
                  <button
                    type="button"
                    className="hs-search-entity-card hs-library-entity-card"
                    key={
                      entity.key
                    }
                    {...collectionActionMenu.getTriggerProps({
                      key:
                        `${isArtist ? "artist" : "album"}:${entity.key}`,
                      kind:
                        isArtist
                          ? "artist"
                          : "album",
                      title:
                        isArtist
                          ? entity.name
                          : entity.title,
                      subtitle:
                        isArtist
                          ? "Artist"
                          : (
                              entity.artist ||
                              "Album"
                            ),
                      artwork_url:
                        artwork ??
                        null,
                      actions: [
                        {
                          id:
                            "open",
                          label:
                            isArtist
                              ? "Open artist"
                              : "Open album",
                          icon:
                            isArtist
                              ? "music"
                              : "disc",
                          onSelect:
                            () => {
                              setSelectedLibraryEntity({
                                kind:
                                  isArtist
                                    ? "artist"
                                    : "album",
                                key:
                                  entity.key,
                              });
                            },
                        },
                        {
                          id:
                            "play",
                          label:
                            isArtist
                              ? "Play artist"
                              : "Play album",
                          icon:
                            "play",
                          onSelect:
                            () => {
                              playLibraryTrackCollection(
                                entity.tracks,
                                0,
                              );
                            },
                        },
                      ],
                    })}
                    onClick={() => {
                      setSelectedLibraryEntity({
                        kind:
                          isArtist
                            ? "artist"
                            : "album",
                        key:
                          entity.key,
                      });
                    }}
                  >
                    <span className="hs-search-entity-card__art">

                      {artwork ? (
                        <img
                          src={artwork}
                          alt=""
                        />
                      ) : (
                        <Icon
                          name={
                            isArtist
                              ? "music"
                              : "disc"
                          }
                          size={26}
                        />
                      )}

                    </span>

                    <span>

                      <small>
                        {isArtist
                          ? "ARTIST"
                          : "ALBUM"}
                      </small>

                      <strong>
                        {isArtist
                          ? entity.name
                          : entity.title}
                      </strong>

                      <em>
                        {isArtist
                          ? (
                              `${entity.track_count} ${entity.track_count === 1 ? "song" : "songs"} • ${entity.album_count} ${entity.album_count === 1 ? "album" : "albums"} • ${offlineTrackCount}/${entity.track_count} offline`
                            )
                          : (
                              `${entity.artist} • ${entity.track_count} ${entity.track_count === 1 ? "song" : "songs"} • ${offlineTrackCount}/${entity.track_count} offline`
                            )}
                      </em>

                    </span>

                    <Icon
                      name="chevron"
                      size={16}
                    />

                  </button>
                );
              },
            )}

            <LibraryLoadMore
              label={activeTab.toLowerCase()}
              visibleCount={renderedActiveLibraryCollection.length}
              totalCount={sortedActiveLibraryCollection.length}
              onClick={() => {
                setVisibleEntityCardCount((current) =>
                  getNextLibraryRenderCount(
                    current,
                    sortedActiveLibraryCollection.length,
                  ),
                );
              }}
            />

          </div>

        )}

      </section>

    ) : (

      <section className="hs-search-section hs-library-collection">

        <div className="hs-search-section__heading">

          <div>
            <span>
              LIBRARY CONTENT
            </span>

            <h3>
              Playlists
            </h3>
          </div>

          <strong>
            {visiblePlaylists.length}
          </strong>

        </div>


        {loading ? (

          <div className="hs-library-loading">

            <span className="library-spinner" />

            <span>
              Loading playlists...
            </span>

          </div>

        ) : visiblePlaylists.length ===
          0 ? (

          <div className="hs-library-empty">

            <Icon
              name="playlist"
              size={22}
            />

            <div>
              <strong>
  Your Library is empty
</strong>

<p>
  Create a playlist or add a generated
  playlist and it will appear here.
</p>
            </div>

          </div>

        ) : (

          <div className="hs-search-track-list">

            {renderedVisiblePlaylists.map(
              (
                playlist,
                index,
              ) => {
                const presentation =
                  playlistPresentation(
                    playlist,
                  );

                const opening =
                  openingPlaylistId ===
                  playlist.id;

                const rowDownload =
                  playlistRowDownloads[
                    String(
                      playlist.id,
                    )
                  ] ??
                  null;

                const rowDownloadPercent =
                  Math.round(
                    Math.max(
                      0,
                      Math.min(
                        1,
                        Number(
                          rowDownload
                            ?.progress ??
                          0,
                        ) || 0,
                      ),
                    ) *
                      100,
                  );

                return (
                  <div
                    key={
                      playlist.id
                    }
                    role="button"
                    tabIndex={0}
                    aria-disabled={
                      Boolean(
                        openingPlaylistId,
                      )
                    }
                    {...collectionActionMenu.getTriggerProps({
                      key:
                        `playlist:${playlist.id}`,
                      kind:
                        "playlist",
                      title:
                        playlist.title,
                      subtitle:
                        playlist.owner_username ||
                        currentUser?.username ||
                        "Playlist",
                      artwork_url:
                        playlist.artwork_url ??
                        null,
                      shareKey:
                        String(
                          playlist.id,
                        ),
                      actions: [
                        {
                          id:
                            "play",
                          label:
                            "Play playlist",
                          icon:
                            "play",
                          onSelect:
                            async () => {
                              try {
                                const fullPlaylist =
                                  await getPlaylist(
                                    playlist.id,
                                  );

                                playLibraryTrackCollection(
                                  fullPlaylist.tracks ??
                                    [],
                                  0,
                                );
                              } catch (
                                requestError
                              ) {
                                setError(
                                  requestError instanceof Error
                                    ? requestError.message
                                    : "Unable to play playlist.",
                                );
                              }
                            },
                        },
                        {
                          id:
                            "open",
                          label:
                            "Open playlist",
                          icon:
                            "playlist",
                          onSelect:
                            () => {
                              void openPlaylist(
                                playlist.id,
                              );
                            },
                        },
                        {
                          id:
                            "pin",
                          label:
                            pinnedPlaylistIds
                              .includes(
                                String(
                                  playlist.id,
                                ),
                              )
                              ? "Unpin playlist"
                              : "Pin playlist to top",
                          icon:
                            "pin",
                          onSelect:
                            () => {
                              togglePlaylistPinned(
                                playlist.id,
                              );
                            },
                        },
                        {
                          id:
                            "download",
                          label:
                            rowDownload?.status ===
                              "downloaded"
                              ? "Downloaded for offline"
                              : rowDownload?.status ===
                                  "downloading"
                                ? (
                                    "Downloading " +
                                    rowDownloadPercent +
                                    "%"
                                  )
                                : "Download playlist",
                          icon:
                            rowDownload?.status ===
                              "downloaded"
                              ? "check"
                              : "download",
                          disabled:
                            rowDownload?.status ===
                              "downloaded" ||
                            rowDownload?.status ===
                              "downloading",
                          onSelect:
                            async () => {
                              try {
                                await downloadPlaylistByIdForOffline(
                                  playlist.id,
                                  currentUser,
                                );
                              } catch (
                                requestError
                              ) {
                                setError(
                                  requestError instanceof Error
                                    ? requestError.message
                                    : "Unable to download playlist.",
                                );
                              }
                            },
                        },
                      ],
                    })}
                    className={[
                      "hs-search-track",
                      "hs-library-playlist-row",
                      "hs-library-playlist-row--generated-look",
                      `hs-library-playlist-row--${presentation.kind}`,

                      pinnedPlaylistIds
                        .includes(
                          String(
                            playlist.id,
                          ),
                        )
                        ? "is-pinned"
                        : "",

                      opening
                        ? "is-opening"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseEnter={() => {
                      void prefetchPlaylistDetails(playlist.id);
                    }}
                    onFocus={() => {
                      void prefetchPlaylistDetails(playlist.id);
                    }}
                    onClick={() => {
                      if (
                        !openingPlaylistId
                      ) {
                        void openPlaylist(
                          playlist.id,
                        );
                      }
                    }}
                    onKeyDown={(
                      event,
                    ) => {
                      if (
                        (
                          event.key ===
                            "Enter" ||
                          event.key ===
                            " "
                        ) &&
                        !openingPlaylistId
                      ) {
                        event.preventDefault();

                        void openPlaylist(
                          playlist.id,
                        );
                      }
                    }}
                  >

                    <span className="hs-search-track__rank">
                      {String(
                        index + 1,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </span>


                    <span className="hs-search-track__art">

                      <PlaylistArtwork
                        tracks={
                          playlist.tracks
                        }
                        artworkUrls={
                          playlist.artwork_urls
                        }
                        artworkUrl={
                          playlist.artwork_url
                        }
                        fallbackSize={20}
                      />

                      <i aria-hidden="true">
                        <Icon
                          name="play"
                          size={15}
                        />
                      </i>

                    </span>


                    <span className="hs-search-track__copy">

                      <strong>
                        {playlist.title}
                      </strong>

                      <small>
                        {presentation.owner}
                      </small>

                    </span>


                    <span className="hs-search-track__signals">

                      <em>
                        {playlist.is_offline_download
                          ? "DOWNLOADED"
                          : presentation.label}
                      </em>

                      <small>
                        {playlist.track_count}
                        {" "}
                        {playlist.track_count ===
                        1
                          ? "track"
                          : "tracks"}
                      </small>

                    </span>


                    <span className="hs-search-track__duration">
                      {playlist.track_count}
                    </span>


                    <span className="hs-search-track__play">

                      {rowDownload?.status ===
                      "downloading" ? (
                        <span
                          className="hs-search-track__download is-downloading hs-playlist-row-download-progress"
                          style={{
                            "--download-progress":
                              `${rowDownloadPercent}%`,
                          }}
                          title={`Downloading ${playlist.title}: ${rowDownloadPercent}%`}
                          aria-label={`Downloading ${playlist.title}: ${rowDownloadPercent}%`}
                        >
                          <span className="hs-search-track__download-progress">
                            {rowDownloadPercent}
                          </span>
                        </span>
                      ) : opening ? (
                        <span className="library-spinner" />
                      ) : playlist.is_offline_download ? (
                        <button
                          type="button"
                          className="hs-search-track__download is-downloaded hs-download-remove-trigger"
                          title="Remove download"
                          aria-label={`Remove ${playlist.title} from downloads`}
                          onClick={(event) => {
                            event.stopPropagation();

                            setRemoveDownloadTarget(
                              playlist,
                            );
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <Icon
                            name="check"
                            size={15}
                          />
                        </button>
                      ) : (
                        <Icon
                          name="chevron"
                          size={16}
                        />
                      )}

                    </span>

                  </div>
                );
              },
            )}



          </div>

        )}

      </section>

    )}

      {hasMoreLibraryTracks ? (
        <div className="hs-library-load-more-wrap">
          <button
            type="button"
            className="hs-search-primary-action hs-library-load-more"
            disabled={
              loadingMoreLibraryTracks ||
              (typeof navigator !== "undefined" && navigator.onLine === false)
            }
            onClick={() => {
              void loadMoreLibraryTracks();
            }}
          >
            {loadingMoreLibraryTracks
              ? "Loading more tracks…"
              : typeof navigator !== "undefined" && navigator.onLine === false
                ? "Connect to load more tracks"
                : `Load more library tracks · ${libraryTracks.length.toLocaleString()} loaded`}
          </button>
        </div>
      ) : null}

      <DownloadRemovalConfirm
        open={
          Boolean(
            removeDownloadedSongTarget,
          )
        }
        itemTitle={
          removeDownloadedSongTarget
            ?.title
        }
        itemKind="song"
        busy={
          Boolean(
            removingDownloadedTrackKey,
          )
        }
        onCancel={() => {
          if (
            !removingDownloadedTrackKey
          ) {
            setRemoveDownloadedSongTarget(
              null,
            );
          }
        }}
        onConfirm={() => {
          if (
            removeDownloadedSongTarget
          ) {
            void removeDownloadedSong(
              removeDownloadedSongTarget,
            );
          }
        }}
      />


      <DownloadRemovalConfirm
        open={
          Boolean(
            removeDownloadTarget,
          )
        }
        playlistTitle={
          removeDownloadTarget
            ?.title
        }
        busy={
          removingDownload
        }
        onCancel={() => {
          if (
            !removingDownload
          ) {
            setRemoveDownloadTarget(
              null,
            );
          }
        }}
        onConfirm={() => {
          void confirmRemoveDownload();
        }}
      />


      <ResultsSortMenu
        menu={
          resultsSortMenu.menu
        }
        mode={
          sortMode
        }
        onClose={
          resultsSortMenu.closeMenu
        }
        onSelect={
          setSortMode
        }
      />

      <TrackActionMenu
        menu={
          trackActionMenu.menu
        }
        onClose={
          trackActionMenu.closeMenu
        }
        currentUser={
          currentUser
        }
        onRequireAuth={
          onOpenAuth
        }
      />


      {createOpen ? (
        <div
          className="library-modal-backdrop"
          role="presentation"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
                event.currentTarget &&
              !creating
            ) {
              setCreateOpen(
                false,
              );
            }
          }}
        >

          <form
            className="library-modal hs-library-modal"
            onSubmit={
              handleCreatePlaylist
            }
          >

            <div className="library-modal__header">

              <div>
                <span>
                  NEW PLAYLIST
                </span>

                <h2>
                  Create playlist
                </h2>
              </div>


              <button
                type="button"
                disabled={
                  creating
                }
                onClick={() => {
                  setCreateOpen(
                    false,
                  );
                }}
              >
                <Icon
                  name="close"
                  size={17}
                />
              </button>

            </div>


            <label className="library-field">

              <span>
                Name
              </span>

              <input
                type="text"
                maxLength={120}
                placeholder="Playlist name"
                value={
                  createTitle
                }
                onChange={(
                  event,
                ) => {
                  setCreateTitle(
                    event.target.value,
                  );
                }}
              />

            </label>


            <label className="library-field">

              <span>
                Description
              </span>

              <textarea
                rows={3}
                maxLength={1000}
                placeholder="Optional description"
                value={
                  createDescription
                }
                onChange={(
                  event,
                ) => {
                  setCreateDescription(
                    event.target.value,
                  );
                }}
              />

            </label>


            <label className="library-field">

              <span>
                Visibility
              </span>

              <select
                value={
                  createVisibility
                }
                onChange={(
                  event,
                ) => {
                  setCreateVisibility(
                    event.target.value,
                  );
                }}
              >
                <option value="private">
                  Private
                </option>

                <option value="unlisted">
                  Unlisted
                </option>

                <option value="public">
                  Public
                </option>
              </select>

            </label>


            <div className="library-modal__actions">

              <button
                type="button"
                className="hs-search-playlist-action"
                disabled={
                  creating
                }
                onClick={() => {
                  setCreateOpen(
                    false,
                  );
                }}
              >
                Cancel
              </button>


              <button
                type="submit"
                className="hs-search-playlist-primary"
                disabled={
                  creating ||
                  !createTitle.trim()
                }
              >
                {creating
                  ? "Creating..."
                  : "Create Playlist"}
              </button>

            </div>

          </form>

        </div>
      ) : null}

    </div>
  );
}



export default LibraryPage;
