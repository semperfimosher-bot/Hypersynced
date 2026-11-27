import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  resolveMediaUrl,
} from "../../mediaCache.js";

import {
  resolveArtworkUrl,
} from "../../artworkUrl.js";

import * as player from
  "../../audioPlayer.js";

import {
  getDownloadedPlaylists,
  getDownloadedTracks,
  getOfflineOwnerKey,
  getPlaylistDownloadJob,
  getPlaylistDownloadJobId,
  reconcileDownloadedPlaylistMembership,
  removePlaylistFromOffline,
  searchDownloadedTracks,
  startPlaylistDownloadForOffline,
} from "../../offlineDownloads.js";

import {
  getSearchPreferences,
  saveSearchPreferences,
  searchHypersync,
} from "../../searchApi.js";
import { getSuggestedMusic, searchUsers, getMyRecentlyPlayed } from "../../profileApi.js";



import {
  SEARCH_QUICK_COMMANDS,
} from "../../constants.js";

import {
  orderSearchResultsForDisplay,
  filterSearchResultsForQuery,
  splitArtistCredits,
  isCollaborativeTrack,
  trackArtistCredits,
} from "../../searchAlphabetical.js";

import { sortResultItems } from "../../sortResults.js";

import {
  searchPlaybackQueueEntry,
} from "../../searchPlaybackQueueEntry.js";

import {
  formatDuration,
  memberFor,
} from "../../searchFormatting.js";

import {
  searchFilterCount,
  totalSearchResultCount,
} from "../../searchCounts.js";

import {
  EMPTY_RESULTS,
  FILTERS,
} from "../../searchConstants.js";

import {
  pickTopSignal,
} from "../../searchTopSignal.js";

import SearchEntityPanel from
  "../search/SearchEntityPanel.jsx";

import SearchArtworkImage from
  "../search/SearchArtworkImage.jsx";
import ArtistPortraitImage from "../search/ArtistPortraitImage.jsx";

import Avatar from
  "../profile/Avatar.jsx";

import ArtistProfilePage from
  "./ArtistProfilePage.jsx";

import Icon from
  "../ui/Icon.jsx";
import PlayingIndicator from "../ui/PlayingIndicator.jsx";

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
  getPlaylist,
  savePlaylist,
  unsavePlaylist,
} from "../../playlistApi.js";

import {
  filterPlaylistTracks,
} from "../../playlistTrackSearch.js";

import {
  looksLikeSmartPlaylistQuery,
} from "../../smartPlaylistQuery.js";

import {
  downloadPlaylistByIdForOffline,
} from "../../playlistOfflineAction.js";

import {
  getCachedLibraryAsync,
  applySavedPlaylistMembership,
  getCachedPlaylistAsync,
  settleSavedPlaylistMembership,
  setCachedPlaylist,
} from "../../libraryCache.js";

import {
  warmTrackArtwork,
} from "../../artworkWarmCache.js";

import {
  readRecentSearches,
  saveRecentSearch,
  removeRecentSearch,
} from "../../recentSearches.js";


function ArtistCreditLinks({ credit, onOpenArtist }) {
  const names = splitArtistCredits(credit);
  if (!names.length) return <span>{credit || "Unknown artist"}</span>;
  return (
    <span className="hs-artist-credit-links">
      {names.map((name, index) => (
        <span key={name}>
          {index ? <span aria-hidden="true"> · </span> : null}
          <button type="button" onClick={(event) => { event.stopPropagation(); onOpenArtist(name); }}>{name}</button>
        </span>
      ))}
    </span>
  );
}


// Search playlist data is kept warm for this page-module lifetime.
const searchPlaylistCache = new Map();
const searchPlaylistRequests = new Map();

function SearchPage({
  query,
  onQueryChange,
  onOpenProfile,
  onMessageUser,
  onOpenPlaylist,
  onOpenAuth,
  currentUser,
  initialArtistName = "",
  onInitialArtistHandled,
  resetToken = 0,
  activePlaylistDownloads = [],
  isActive = false,
}) {
  const trackActionMenu =
  useTrackActionMenu();

  const collectionActionMenu =
    useCollectionActionMenu();

  const resultsSortMenu =
    useResultsSortMenu();

  const normalizedQuery =
    query.trim();

  const isRegistered =
    currentUser?.account_type ===
    "registered";

  const offlineOwnerKey =
    getOfflineOwnerKey(
      currentUser,
    );

  const [discoveryCardArtwork, setDiscoveryCardArtwork] = useState([]);
  const [discoveryPeopleArtwork] = useState([{ avatar_url: "/find-people/purple-girl.svg" }, { avatar_url: "/find-people/white-haired.svg" }]);
  const [discoveryArtworkByCommand, setDiscoveryArtworkByCommand] = useState({});
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refreshDiscoveryArtwork = () => {
      getCachedLibraryAsync(offlineOwnerKey)
        .then((library) => {
          if (cancelled) return;
          const tracks = Array.isArray(library?.tracks) ? library.tracks : [];
          const unique = [];
          const seen = new Set();
          for (const track of tracks) {
            const artwork = track?.artwork_url ?? track?.cover_url ?? track?.album_artwork_url;
            if (!artwork || seen.has(String(artwork))) continue;
            seen.add(String(artwork));
            const releaseYear = Number(track?.release_year ?? track?.year ?? String(track?.release_date ?? "").slice(0, 4)) || 0;
            unique.push({
              artwork,
              artistArtwork: track?.artist_artwork_url ?? track?.artist_image_url ?? null,
              genre: String(track?.genre ?? track?.genres ?? "").toLowerCase(),
              releaseYear,
            });
            if (unique.length >= 120) break;
          }
          warmTrackArtwork(unique.map((item) => ({ artwork_url: item.artwork })), 36, true);
          setDiscoveryCardArtwork(unique);
        })
        .catch(() => {});
    };
    refreshDiscoveryArtwork();
    window.addEventListener("hypersynced:catalog-updated", refreshDiscoveryArtwork);
    window.addEventListener("hypersynced:library-updated", refreshDiscoveryArtwork);
    return () => {
      cancelled = true;
      window.removeEventListener("hypersynced:catalog-updated", refreshDiscoveryArtwork);
      window.removeEventListener("hypersynced:library-updated", refreshDiscoveryArtwork);
    };
  }, [offlineOwnerKey]);

  useEffect(() => {
    if (!isActive) return undefined;
    let cancelled = false;
    let idleHandle = null;
    const commands = [
      { id: "newly-released", query: "new releases", filter: "tracks" },
      { id: "pop", query: "pop", filter: "tracks" },
      { id: "country", query: "country", filter: "tracks" },
      { id: "rock", query: "rock", filter: "tracks" },
      { id: "electronic", query: "electronic", filter: "tracks" },
      { id: "rap-hip-hop", query: "rap hip hop", filter: "tracks" },
      { id: "alternative", query: "alternative", filter: "tracks" },
      { id: "chill", query: "chill", filter: "tracks" },
      { id: "driving", query: "driving", filter: "tracks" },
      { id: "hype", query: "hype", filter: "tracks" },
      { id: "find-new-tunes", query: "new tunes", filter: "tracks" },
    ];
    const load = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      let cursor = 0;
      const worker = async () => {
        while (!cancelled && cursor < commands.length) {
          const command = commands[cursor++];
          try {
            const response = await searchHypersync(command.query, "smart");
            if (cancelled) return;
            const tracks = Array.isArray(response?.tracks) ? response.tracks : [];
            const artists = Array.isArray(response?.artists) ? response.artists : [];
            const source = command.filter === "artists"
              ? artists.map((artist) => ({ artwork: artist.artist_artwork_url ?? artist.image_url ?? artist.artwork_url, artistArtwork: artist.artist_artwork_url ?? artist.image_url ?? artist.artwork_url, genre: "", releaseYear: 0 }))
              : tracks.map((track) => ({
                  artwork: track?.artwork_url ?? track?.cover_url ?? track?.album_artwork_url,
                  artistArtwork: track?.artist_artwork_url ?? track?.artist_image_url ?? null,
                  genre: String(track?.genre ?? track?.genres ?? "").toLowerCase(),
                  releaseYear: Number(track?.release_year ?? track?.year ?? String(track?.release_date ?? "").slice(0, 4)) || 0,
                }));
            const filtered = source.filter(item => item.artwork);
            if (filtered.length) {
              warmTrackArtwork(filtered.map((item) => ({ artwork_url: item.artwork })), 12, true);
              setDiscoveryArtworkByCommand(prev => ({ ...prev, [command.id]: filtered.slice(0, 12) }));
            }
          } catch {
            // Library artwork and category icon fallback remain available if discovery search fails.
          }
        }
      };
      // Discovery artwork prewarming is intentionally serial: these idle searches are optional, and parallel requests can overload the backend's admission limit.
      await worker();
    };
    if (typeof window.requestIdleCallback === "function") idleHandle = window.requestIdleCallback(load, { timeout: 5000 });
    else idleHandle = window.setTimeout(load, 1800);
    return () => {
      cancelled = true;
      if (idleHandle != null && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
      else if (idleHandle != null) window.clearTimeout(idleHandle);
    };
  }, [isActive]);


  const [
  openedPlaylist,
  setOpenedPlaylist,
] = useState(null);

  const openedPlaylistIdRef = useRef(null);

  const [
    openedArtistName,
    setOpenedArtistName,
  ] = useState("");

const [
  playlistSearchQuery,
  setPlaylistSearchQuery,
] = useState("");

const [
  playlistOpeningId,
  setPlaylistOpeningId,
] = useState(null);

const [
  playlistError,
  setPlaylistError,
] = useState("");

const [
  playlistActionBusy,
  setPlaylistActionBusy,
] = useState(false);

const [
  playlistDownload,
  setPlaylistDownload,
] = useState({
  status: "idle",
  progress: 0,
  trackProgress: {},
});

const [optimisticPlaylistRowDownloads, setOptimisticPlaylistRowDownloads] = useState({});

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
  removeDownloadOpen,
  setRemoveDownloadOpen,
] = useState(false);


useEffect(() => {
  const activeOpenedDownload =
    activePlaylistDownloads.find(
      (download) =>
        String(
          download.playlistId,
        ) ===
        String(
          openedPlaylist?.id ??
          "",
        ),
    ) ??
    null;

  if (activeOpenedDownload) {
    setPlaylistDownload({
      status:
        "downloading",
      progress:
        activeOpenedDownload
          .progress,
      trackProgress:
        activeOpenedDownload
          .trackProgress ??
        {},
    });
  }
}, [
  activePlaylistDownloads,
  openedPlaylist?.id,
]);

const [
  removingDownload,
  setRemovingDownload,
] = useState(false);

useEffect(() => {
  const handleOfflinePlaylistUpdated =
    async (event) => {
      const playlistId =
        event?.detail
          ?.playlistId;

      if (
        !playlistId ||
        String(
          openedPlaylist?.id ??
          "",
        ) !==
          String(
            playlistId,
          )
      ) {
        return;
      }

      try {
        const [
          refreshed,
          downloads,
        ] =
          await Promise.all([
            getPlaylist(
              playlistId,
            ),
            getDownloadedPlaylists(
              offlineOwnerKey,
            ),
          ]);

        setOpenedPlaylist(
          refreshed,
        );

        const downloaded =
          downloads.find(
            (playlist) =>
              String(
                playlist.id,
              ) ===
              String(
                playlistId,
              ),
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
      } catch {
        // The global update action already
        // completed; this only syncs visible UI.
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
  offlineOwnerKey,
  openedPlaylist?.id,
]);


useEffect(() => {
  openedPlaylistIdRef.current = null;
  setOpenedPlaylist(null);

  setOpenedArtistName(
    "",
  );

  setPlaylistSearchQuery(
    "",
  );

  setPlaylistError(
    "",
  );

  setPlaylistDownload({
    status: "idle",
    progress: 0,
    trackProgress: {},
  });
}, [
  resetToken,
]);


useEffect(() => {
  if (!initialArtistName) {
    return;
  }

  openedPlaylistIdRef.current = null;
  setOpenedPlaylist(null);

  setOpenedArtistName(
    initialArtistName,
  );

  onInitialArtistHandled?.();
}, [
  initialArtistName,
  onInitialArtistHandled,
]);

  const [
    sortMode,
    setSortMode,
  ] = useState("smart");

  const [
    preferenceReady,
    setPreferenceReady,
  ] = useState(
    !currentUser,
  );

  const [
    preferenceStatus,
    setPreferenceStatus,
  ] = useState(
    currentUser
      ? "loading"
      : "guest",
  );

  const [
    activeFilter,
    setActiveFilter,
  ] = useState("all");
  const [discoveryMode, setDiscoveryMode] = useState("");
  const [completedSearchQuery, setCompletedSearchQuery] = useState("");
  const [discoveryTracks, setDiscoveryTracks] = useState([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [recentlyPlayedHistory, setRecentlyPlayedHistory] = useState([]);
  useEffect(() => {
    let active = true;
    if (currentUser?.account_type !== "registered") {
      setRecentlyPlayedHistory([]);
      return () => { active = false; };
    }
    void getMyRecentlyPlayed({ limit: 1000 }).then((items) => {
      if (active) setRecentlyPlayedHistory(Array.isArray(items) ? items : []);
    }).catch(() => {
      if (active) setRecentlyPlayedHistory([]);
    });
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.username, currentUser?.account_type]);

  const [discoveryError, setDiscoveryError] = useState("");

  const [
    selectedTrackIndex,
    setSelectedTrackIndex,
  ] = useState(-1);

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
const [currentTrackIsPlaying, setCurrentTrackIsPlaying] = useState(
  () => Boolean(player.getState()?.trackId && !player.getState()?.paused),
  );

  const [
    results,
    setResults,
  ] = useState(
    EMPTY_RESULTS,
  );

  const recentSearchOwner = currentUser?.id ?? currentUser?.username ?? "guest-device";
  const [recentSearches, setRecentSearches] = useState(() => readRecentSearches(recentSearchOwner));

  useEffect(() => {
    setRecentSearches(readRecentSearches(recentSearchOwner));
  }, [recentSearchOwner]);

  const rememberSearch = (value) => {
    const next = saveRecentSearch(value, recentSearchOwner);
    setRecentSearches(next);
  };

  const [downloadedMusicCount, setDownloadedMusicCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const refreshDownloadedMusicCount = async () => {
      try {
        const tracks = await getDownloadedTracks(offlineOwnerKey);
        if (!cancelled) setDownloadedMusicCount(Array.isArray(tracks) ? tracks.length : 0);
      } catch {
        if (!cancelled) setDownloadedMusicCount(0);
      }
    };
    void refreshDownloadedMusicCount();
    const handleDownloadsChanged = () => { void refreshDownloadedMusicCount(); };
    window.addEventListener("hypersync:offline-downloads-changed", handleDownloadsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("hypersync:offline-downloads-changed", handleDownloadsChanged);
    };
  }, [offlineOwnerKey, resetToken]);

  // Prewarm the first visible search tracks as soon as results arrive.
  // This fetches their first media range before the user clicks Play.
  useEffect(() => {
    const tracks = Array.isArray(results?.tracks) ? results.tracks : [];
    if (!tracks.length || globalThis.navigator?.onLine === false) return;
    let cancelled = false;
    const candidates = tracks.slice(0, 5).filter((track) => track?.id);
    let cursor = 0;
    const worker = async () => {
      while (!cancelled && cursor < candidates.length) {
        const track = candidates[cursor++];
        try {
          await player.warmTrackForPlayback(track.id, track, { warmBytes: 256 * 1024 });
        } catch {
          // Warming is optional; click-to-play retains the normal source path.
        }
      }
    };
    void Promise.all([worker(), worker()]);
    return () => { cancelled = true; };
  }, [results?.tracks]);

  // Preload playlist first-page tracks while search results are visible,
  // so a first-ever click can display songs instead of starting a cold fetch.
  // Keep this bounded to two concurrent requests and persist partial snapshots.
  useEffect(() => {
    const playlistResults = Array.isArray(results?.playlists)
      ? results.playlists
      : [];
    let cancelled = false;
    const preload = async () => {
      const candidates = [];
      for (const seed of playlistResults) {
        const playlistId = seed?.id;
        if (!playlistId) continue;
        const cacheKey = `${offlineOwnerKey ?? "guest"}::${String(playlistId)}`;
        if (searchPlaylistCache.get(cacheKey)?.tracks?.length) continue;
        try {
          const cachedPlaylist = await getCachedPlaylistAsync(offlineOwnerKey, playlistId);
          if (cachedPlaylist?.tracks?.length) {
            const normalized = {
              ...cachedPlaylist,
              complete: Boolean(cachedPlaylist.complete),
            };
            searchPlaylistCache.set(cacheKey, normalized);
            warmTrackArtwork(cachedPlaylist.tracks);
            if (normalized.complete) continue;
          }
        } catch {
          // Continue with preloading from the network.
        }
        candidates.push({ seed, playlistId, cacheKey });
      }

      let cursor = 0;
      const worker = async () => {
        while (!cancelled && cursor < candidates.length) {
          const candidate = candidates[cursor++];
          const { seed, playlistId, cacheKey } = candidate;
          if (searchPlaylistCache.get(cacheKey)?.tracks?.length) continue;
          try {
            const firstPage = await getPlaylist(playlistId, { limit: 100, offset: 0 });
            if (cancelled) return;
            const tracks = Array.isArray(firstPage?.tracks) ? firstPage.tracks : [];
            const partial = {
              ...seed,
              ...firstPage,
              tracks,
              complete: tracks.length < 100,
            };
            searchPlaylistCache.set(cacheKey, partial);
            warmTrackArtwork(tracks);
            void setCachedPlaylist(offlineOwnerKey, partial).catch(() => {});
          } catch {
            // Preloading is opportunistic; clicking still performs the normal load.
          }
        }
      };
      await Promise.all([worker(), worker()]);
    };
    void preload();
    return () => { cancelled = true; };
  }, [results?.playlists, offlineOwnerKey]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    searchError,
    setSearchError,
  ] = useState("");

  const searchInputRef =
  useRef(null);

  const searchLoadKeyRef =
    useRef("");

  const [
    quietSearchVersion,
    setQuietSearchVersion,
  ] = useState(0);


  useQuietRefresh(
    () => {
      setQuietSearchVersion(
        (current) =>
          current + 1,
      );
    },
    {
      enabled:
        Boolean(
          preferenceReady &&
          normalizedQuery,
        ),
      // Search results can stay fresh without polling every 30 seconds.
      intervalMs:
        60_000,
    },
  );

  useEffect(() => {
    if (!preferenceReady || !normalizedQuery) return undefined;
    const handleCatalogUpdated = () => {
      setQuietSearchVersion((current) => current + 1);
    };
    window.addEventListener("hypersynced:catalog-updated", handleCatalogUpdated);
    return () => window.removeEventListener("hypersynced:catalog-updated", handleCatalogUpdated);
  }, [preferenceReady, normalizedQuery]);


  useQuietRefresh(
    async () => {
      const playlistId =
        openedPlaylist?.id;

      if (
        !playlistId ||
        openedPlaylist?.transient
      ) {
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

        setOpenedPlaylist(
          refreshed,
        );
      } catch {
        // Keep the open playlist visible.
      }
    },
    {
      enabled:
        Boolean(
          openedPlaylist?.id &&
          !openedPlaylist?.transient,
        ),
      // Playlist details do not need a 20-second refresh loop.
      // Keep the view fresh without repeatedly refetching the same playlist.
      intervalMs:
        60_000,
    },
  );


  /*
   * Load the user's dropdown
   * choice from PostgreSQL.
   *
   * No localStorage is used.
   */
  useEffect(() => {
    let cancelled = false;

    if (!currentUser) {
      setSortMode("smart");

      setPreferenceReady(
        true,
      );

      setPreferenceStatus(
        "guest",
      );

      return undefined;
    }

    setPreferenceReady(false);

    setPreferenceStatus(
      "loading",
    );

    getSearchPreferences()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setSortMode(
          data?.sort_mode ===
            "artist"
            ? "albums"
            : (
                data?.sort_mode ||
                "smart"
              ),
        );

        setPreferenceStatus(
          "synced",
        );

        setPreferenceReady(
          true,
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSortMode("smart");

        setPreferenceStatus(
          "error",
        );

        setPreferenceReady(
          true,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentUser?.username,
  ]);

  useEffect(() => {
  return player.subscribe((nextState) => {
    setCurrentTrackId(nextState?.trackId ? String(nextState.trackId) : null);
    setCurrentTrackIsPlaying(Boolean(nextState?.trackId && !nextState?.paused));
  });
}, []);


  /*
   * Search with the local default immediately. If the saved preference loads
   * later and changes the sort mode, the effect reruns with that mode; search
   * no longer waits on an unrelated preferences request.
   */
  useEffect(() => {
    if (discoveryMode) {
      searchLoadKeyRef.current = "";
      setLoading(false);
      setSearchError("");
      return undefined;
    }

    if (!normalizedQuery) {
      searchLoadKeyRef.current =
        "";

      setResults(
        EMPTY_RESULTS,
      );
      setCompletedSearchQuery("");

      setLoading(false);
      setSearchError("");

      setSelectedTrackIndex(
        -1,
      );

      return undefined;
    }

    const searchKey =
      [
        normalizedQuery,
        sortMode,
        offlineOwnerKey ??
          "",
      ].join(
        "\u0000",
      );

    const quietRefresh =
      searchLoadKeyRef.current ===
        searchKey &&
      quietSearchVersion > 0;

    const controller =
      new AbortController();

    if (!quietRefresh) {
      setLoading(true);
      setSearchError("");
      setCompletedSearchQuery("");
    }

    const setLocalResults =
      (localTracks) => {
        setResults({
          ...EMPTY_RESULTS,
          query:
            normalizedQuery,
          interpreted_query:
            normalizedQuery,
          counts: {
            ...EMPTY_RESULTS.counts,
            tracks:
              localTracks.length,
          },
          tracks:
            localTracks,
        });

        if (!quietRefresh) {
          setSelectedTrackIndex(
            -1,
          );
        }

        searchLoadKeyRef.current =
          searchKey;
        setCompletedSearchQuery(normalizedQuery);
      };

    const timer =
      window.setTimeout(
        async () => {
          const offline =
            typeof navigator !==
              "undefined" &&
            navigator.onLine ===
              false;

          if (offline) {
            try {
              const localTracks =
                await searchDownloadedTracks(
                  normalizedQuery,
                  offlineOwnerKey,
                );

              if (
                controller.signal
                  .aborted
              ) {
                return;
              }

              setLocalResults(
                localTracks,
              );

              setSearchError("");
            } catch {
              if (
                !controller.signal
                  .aborted
              ) {
                setLocalResults(
                  [],
                );

                setSearchError(
                  "Unable to search downloaded tracks.",
                );
              }
            } finally {
              if (
                !controller.signal
                  .aborted
              ) {
                setLoading(false);
              }
            }

            return;
          }

          try {
            const data =
              await searchHypersync(
                normalizedQuery,
                sortMode,
                {
                  signal:
                    controller.signal,
                  bypassCache:
                    quietRefresh,
                  onRefresh: (freshData) => {
                    if (controller.signal.aborted) return;
                    warmTrackArtwork(freshData?.tracks || [], 24, true)
                    setResults({
                      ...EMPTY_RESULTS,
                      ...(freshData || {}),
                      counts: {
                        ...EMPTY_RESULTS.counts,
                        ...(freshData?.counts || {}),
                      },
                      tracks: freshData?.tracks || [],
                      artists: freshData?.artists || [],
                      collaborations: freshData?.collaborations || [],
                      albums: freshData?.albums || [],
                      people: freshData?.people || [],
                      playlists: freshData?.playlists || [],
                    });
                    setCompletedSearchQuery(normalizedQuery);
                    setSearchError("");
                  },
                },
              );

            if (
              controller.signal
                .aborted
            ) {
              return;
            }

            warmTrackArtwork(data?.tracks || [], 24, true)
            setResults({
              ...EMPTY_RESULTS,
              ...(data || {}),

              counts: {
                ...EMPTY_RESULTS.counts,
                ...(data?.counts || {}),
              },

              tracks:
                data?.tracks || [],

              artists:
                data?.artists || [],

              collaborations:
                data?.collaborations || [],

              albums:
                data?.albums || [],

              people:
                data?.people || [],

              playlists:
                data?.playlists || [],
            });

            if (!quietRefresh) {
              setSelectedTrackIndex(
                -1,
              );
            }

            searchLoadKeyRef.current =
              searchKey;
            setCompletedSearchQuery(normalizedQuery);

            setSearchError(
              "",
            );

            if (!quietRefresh) {
              setLoading(
                false,
              );
            }
          } catch (error) {
            if (
              error?.name ===
              "AbortError"
            ) {
              return;
            }

            if (quietRefresh) {
              return;
            }

            let localTracks =
              [];

            try {
              localTracks =
                await searchDownloadedTracks(
                  normalizedQuery,
                  offlineOwnerKey,
                );
            } catch {
              localTracks =
                [];
            }

            if (
              controller.signal
                .aborted
            ) {
              return;
            }

            if (
              localTracks.length > 0
            ) {
              setLocalResults(
                localTracks,
              );

              setSearchError(
                "",
              );
            } else {
              setSearchError(
                error instanceof Error
                  ? error.message
                  : "Unable to search.",
              );
            }
          } finally {
            if (
              !controller.signal
                .aborted &&
              !quietRefresh
            ) {
              setLoading(false);
            }
          }
        },
        0,
      );

    return () => {
      window.clearTimeout(
        timer,
      );

      controller.abort();
    };

  }, [
    isRegistered,
    normalizedQuery,
    offlineOwnerKey,
    quietSearchVersion,
    sortMode,
    discoveryMode,
  ]);

  useEffect(() => {
    if (discoveryMode !== "people") return undefined;
    let cancelled = false;
    setLoading(true);
    searchUsers("")
      .then((people) => {
        if (cancelled) return;
        setResults({
          ...EMPTY_RESULTS,
          people: Array.isArray(people) ? people : [],
          counts: { ...EMPTY_RESULTS.counts, people: Array.isArray(people) ? people.length : 0 },
        });
        setSearchError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setSearchError(error instanceof Error ? error.message : "Unable to load people.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [discoveryMode, normalizedQuery]);

  useEffect(() => {
    if (discoveryMode !== "tunes") return undefined;
    let cancelled = false;
    setDiscoveryLoading(true);
    setDiscoveryError("");
    const currentTrack = player.getState()?.trackId ?? null;
    getSuggestedMusic({
      currentTrackId: currentTrack,
      contextTrackIds: currentTrack ? [currentTrack] : [],
      excludeTrackIds: currentTrack ? [currentTrack] : [],
      limit: 40,
      homeExplore: false,
    })
      .then((tracks) => {
        if (cancelled) return;
        const normalized = Array.isArray(tracks) ? tracks : [];
        setDiscoveryTracks(normalized);
        setResults({
          ...EMPTY_RESULTS,
          tracks: normalized,
          counts: { ...EMPTY_RESULTS.counts, tracks: normalized.length },
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setDiscoveryTracks([]);
        setDiscoveryError(error instanceof Error ? error.message : "Unable to load personalized picks.");
      })
      .finally(() => { if (!cancelled) setDiscoveryLoading(false); });
    return () => { cancelled = true; };
  }, [discoveryMode, currentUser?.id, currentUser?.username]);

  const combinedResults =
    useMemo(() => {
      const source = results && typeof results === "object" ? results : {};
      const sourceCounts = source.counts && typeof source.counts === "object" ? source.counts : {};
      const normalizeItems = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
      return {
        ...EMPTY_RESULTS,
        ...source,
        counts: {
          ...EMPTY_RESULTS.counts,
          ...sourceCounts,
        },
        tracks: normalizeItems(source.tracks),
        artists: normalizeItems(source.artists),
        collaborations: normalizeItems(source.collaborations),
        albums: normalizeItems(source.albums),
        people: normalizeItems(source.people),
        playlists: normalizeItems(source.playlists),
      };
    }, [results]);

  // Reflect optimistic Library saves immediately in Search results and detail.
  useEffect(() => {
    if (!currentUser) return undefined;
    const ownerKey = String(currentUser.id ?? currentUser.username ?? "anonymous");
    const handleLibraryChanged = (event) => {
      const detail = event?.detail ?? {};
      const playlist = detail.playlist;
      if (!playlist?.id || String(detail.ownerKey ?? "") !== ownerKey) return;
      if (!["optimistic", "confirmed", "rollback"].includes(detail.phase)) return;
      const playlistId = String(playlist.id);
      const saved = Boolean(detail.saved);
      setResults((current) => ({
        ...current,
        playlists: (current.playlists ?? []).map((item) => String(item?.id) === playlistId ? { ...item, is_saved: saved } : item),
      }));
      setDiscoveryTracks((current) => Array.isArray(current) ? current.map((item) => String(item?.id) === playlistId ? { ...item, is_saved: saved } : item) : current);
      setOpenedPlaylist((current) => String(current?.id ?? "") === playlistId ? { ...current, is_saved: saved } : current);
    };
    window.addEventListener("hypersync:library-changed", handleLibraryChanged);
    return () => window.removeEventListener("hypersync:library-changed", handleLibraryChanged);
  }, [currentUser?.id, currentUser?.username]);


  const displayResults =
  useMemo(() => {
    const relevant = combinedResults.intent === "general"
      ? filterSearchResultsForQuery(combinedResults, normalizedQuery)
      : combinedResults;
    const ordered = orderSearchResultsForDisplay(relevant);
    const result = { ...ordered };
    const historyById = new Map();
    for (const historyTrack of recentlyPlayedHistory) {
      const historyId = String(historyTrack?.id ?? "");
      const historyTime = Date.parse(historyTrack?.last_played_at ?? "") || 0;
      const previous = historyById.get(historyId);
      const previousTime = Date.parse(previous?.last_played_at ?? "") || 0;
      if (!previous || historyTime > previousTime) historyById.set(historyId, historyTrack);
    }
    if (Array.isArray(result.tracks)) {
      result.tracks = result.tracks.map((track) => ({
        ...track,
        last_played_at: historyById.get(String(track?.id ?? ""))?.last_played_at ?? null,
      }));
    }
    for (const key of ["tracks", "artists", "albums", "collaborations", "playlists", "people"]) {
      if (Array.isArray(result[key])) result[key] = sortResultItems(result[key], sortMode);
    }
    result.counts = {
      ...result.counts,
      tracks: result.tracks.length,
      artists: result.artists.length,
      collaborations: result.tracks.filter(isCollaborativeTrack).length,
      albums: result.albums.length,
      people: result.people.length,
      playlists: result.playlists.length,
    };
    return result;
  }, [combinedResults, sortMode, normalizedQuery, recentlyPlayedHistory]);


  useEffect(() => {
    if (!currentTrackId || !["recent", "smart"].includes(sortMode)) return;
    const tracks = displayResults.tracks ?? [];
    if (tracks.some((track) => String(track.id) === String(currentTrackId))) {
      player.reorderQueueFromCollection(tracks, currentTrackId);
    }
  }, [displayResults.tracks, currentTrackId, sortMode]);



  const resultTotal =
    useMemo(
      () =>
        totalSearchResultCount(
          displayResults.counts,
        ),
      [
        displayResults.counts,
      ],
    );

  const filteredOpenedPlaylistTracks =
    useMemo(() => {
      const historyById = new Map(recentlyPlayedHistory.map((track) => [String(track?.id ?? ""), track]));
      const withHistory = (openedPlaylist?.tracks ?? []).map((track) => ({
        ...track,
        last_played_at: historyById.get(String(track?.id ?? ""))?.last_played_at ?? null,
      }));
      return sortResultItems(filterPlaylistTracks(withHistory, playlistSearchQuery), sortMode);
    }, [openedPlaylist?.tracks, playlistSearchQuery, sortMode, recentlyPlayedHistory]);

  useEffect(() => {
    if (!currentTrackId || !["recent", "smart"].includes(sortMode) || !openedPlaylist) return;
    const tracks = filteredOpenedPlaylistTracks;
    if (tracks.some((track) => String(track.id) === String(currentTrackId))) {
      player.reorderQueueFromCollection(tracks, currentTrackId);
    }
  }, [filteredOpenedPlaylistTracks, currentTrackId, sortMode, openedPlaylist?.id]);

  useEffect(() => {
    setPlaylistSearchQuery(
      "",
    );
  }, [
    openedPlaylist?.id,
  ]);

    function runQuickCommand(command) {
  if (command.id === "find-people") {
    setDiscoveryMode("people");
    setDiscoveryTracks([]);
    setDiscoveryError("");
    setActiveFilter("people");
    setSelectedTrackIndex(-1);
    onQueryChange("people");
    return;
  }
  if (command.id === "find-new-tunes") {
    setDiscoveryMode("tunes");
    setDiscoveryTracks([]);
    setDiscoveryError("");
    setActiveFilter("tracks");
    setSelectedTrackIndex(-1);
    onQueryChange("new tunes");
    return;
  }
  setDiscoveryMode("");
  setDiscoveryTracks([]);
  setActiveFilter(command.filter);
  setSelectedTrackIndex(-1);
  onQueryChange(command.query);
}

  async function playTrack(
    trackIndex,
  ) {
    const selected =
      displayResults.tracks[
        trackIndex
      ];

    if (!selected) {
      return;
    }

    const localTracks = displayResults.tracks;

    const localIndex =
      localTracks.findIndex(
        (track) =>
          String(
            track.id,
          )
          ===
          String(
            selected.id,
          ),
      );

    if (localIndex < 0) {
      return;
    }

    const queue =
      localTracks.map(
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
            null,

          durationSeconds:
            track.duration_seconds ??
            null,
        }),
      );

    void player
      .playTrackQueue(
        queue,
        localIndex,
      )
      .catch(
        () => {},
      );
  }

  function activateTopSignal() {
  if (!topSignal) {
    return;
  }

  if (
    topSignal.actionType ===
    "play"
  ) {
    playTrack(
      topSignal.trackIndex,
    );

    return;
  }

  if (
    topSignal.actionType ===
    "artist"
  ) {
    onQueryChange(
      `songs by ${topSignal.item.name}`,
    );

    return;
  }

  if (
    topSignal.actionType ===
    "album"
  ) {
    onQueryChange(
      topSignal.item.title,
    );

    return;
  }

  if (
    topSignal.actionType ===
    "person"
  ) {
    onOpenProfile?.(
      topSignal.item.username,
    );
  }
}

  function handleSearchKeyDown(
    event,
  ) {
    if (event.key === "Enter" && normalizedQuery) {
      rememberSearch(normalizedQuery);
    }
    const trackCount =
  displayResults.tracks.length;

    if (
      event.key ===
        "ArrowDown" &&
      trackCount > 0
    ) {
      event.preventDefault();

      setSelectedTrackIndex(
        (current) =>
          Math.min(
            current + 1,
            trackCount - 1,
          ),
      );

      return;
    }

    if (
      event.key ===
        "ArrowUp" &&
      trackCount > 0
    ) {
      event.preventDefault();

      setSelectedTrackIndex(
        (current) =>
          Math.max(
            current - 1,
            0,
          ),
      );

      return;
    }

    if (
      event.key ===
        "Enter"
      && selectedTrackIndex
        < 0
      && looksLikeSmartPlaylistQuery(
        normalizedQuery,
      )
    ) {
      event.preventDefault();

      event.currentTarget
        .blur();

      if (trackCount > 0) {
        playTrack(
          0,
        );
      }

      return;
    }

    if (
      event.key ===
        "Enter" &&
      trackCount > 0
    ) {
      event.preventDefault();

      playTrack(
        selectedTrackIndex >= 0
          ? selectedTrackIndex
          : 0,
      );

      return;
    }

    if (
      event.key === "Escape"
    ) {
      onQueryChange("");
    }
  }


  function changeSortMode(
    nextMode,
  ) {
    const selectedTrackId = selectedTrackIndex >= 0
      ? displayResults.tracks[selectedTrackIndex]?.id
      : null;
    const nextSortedTracks = sortResultItems(displayResults.tracks, nextMode);
    setSelectedTrackIndex(selectedTrackId == null
      ? -1
      : nextSortedTracks.findIndex((track) => String(track.id) === String(selectedTrackId)));
    setSortMode(
      nextMode,
    );

    if (!currentUser) {
      setPreferenceStatus(
        "guest",
      );

      return;
    }

    setPreferenceStatus(
      "saving",
    );

    void saveSearchPreferences(
      nextMode,
    )
      .then(() => {
        setPreferenceStatus(
          "synced",
        );
      })
      .catch(() => {
        setPreferenceStatus(
          "error",
        );
      });
  }

  function openSearchPlaylist(playlistSeed) {
    const playlistId =
      typeof playlistSeed === "object"
        ? playlistSeed?.id
        : playlistSeed;

    if (!playlistId) return;

    const key = String(playlistId);
    const cacheKey = `${offlineOwnerKey ?? "guest"}::${key}`;
    const cached = searchPlaylistCache.get(cacheKey);
    const seed = typeof playlistSeed === "object" ? playlistSeed : null;
    if (cached?.tracks?.length) warmTrackArtwork(cached.tracks);
    if (seed?.tracks?.length) warmTrackArtwork(seed.tracks);
    const shell = {
      ...(seed ?? {}),
      ...(cached ?? {}),
      id: playlistId,
      tracks: cached?.tracks?.length ? cached.tracks : (seed?.tracks ?? []),
      transient: !cached?.complete,
    };
    const warmPlaylistAudio = (tracks) => {
      for (const track of (tracks ?? []).slice(0, 3)) {
        if (track?.id) void player.warmTrackForPlayback(track.id, track).catch(() => {});
      }
    };
    warmPlaylistAudio(shell.tracks);

    openedPlaylistIdRef.current = key;
    setOpenedPlaylist(shell);
    setOpenedArtistName("");
    setPlaylistSearchQuery("");
    setPlaylistError("");
    setPlaylistOpeningId(key);
    setPlaylistDownload({
      status: "idle",
      progress: 0,
      trackProgress: {},
    });

    const hydrate = async () => {
      // Hydrate persistent cache before starting network work. The module cache
      // may be cold after a reload even when IndexedDB already has playlist rows.
      let persistentCached = cached;
      if (!persistentCached?.tracks?.length) {
        try {
          const stored = await getCachedPlaylistAsync(offlineOwnerKey, playlistId);
          if (stored?.tracks?.length) {
            persistentCached = {
              ...stored,
              complete: Boolean(stored.complete),
            };
            searchPlaylistCache.set(cacheKey, persistentCached);
            warmTrackArtwork(persistentCached.tracks);
            if (openedPlaylistIdRef.current === key) {
              setOpenedPlaylist({
                ...shell,
                ...persistentCached,
                id: playlistId,
                tracks: persistentCached.tracks,
                transient: !persistentCached.complete,
              });
            }
          }
        } catch {
          // A cache read failure falls through to the network fetch.
        }
      }

      let playlist = persistentCached?.complete ? persistentCached : null;

      if (!playlist) {
        let request = searchPlaylistRequests.get(cacheKey);
        if (!request) {
          request = (async () => {
            // Fetch the first page only, then reveal tracks immediately.
            // Larger playlist pages are appended asynchronously in order.
            const firstPage = await getPlaylist(playlistId, {
              limit: 100,
              offset: 0,
            });
            let hydrated = {
              ...firstPage,
              tracks: Array.isArray(firstPage?.tracks) ? firstPage.tracks : [],
              complete: false,
            };
            searchPlaylistCache.set(cacheKey, hydrated);
            warmTrackArtwork(hydrated.tracks);
            void setCachedPlaylist(offlineOwnerKey, hydrated).catch(() => {});

            if (openedPlaylistIdRef.current === key) {
              setOpenedPlaylist({
                ...hydrated,
                transient: true,
              });
            }

            const expectedCount = Number(firstPage?.track_count);
            const pageOffsets = [];
            if (Number.isInteger(expectedCount) && expectedCount > hydrated.tracks.length) {
              for (let offset = hydrated.tracks.length; offset < expectedCount; offset += 100) {
                pageOffsets.push(offset);
              }
            } else if (hydrated.tracks.length === 100 && !Number.isFinite(expectedCount)) {
              // Unknown legacy total: continue until a short page is returned.
              for (let offset = 100; ; offset += 100) {
                const page = await getPlaylist(playlistId, {
                  limit: 100,
                  offset,
                });
                const rows = Array.isArray(page?.tracks) ? page.tracks : [];
                hydrated = { ...hydrated, tracks: [...hydrated.tracks, ...rows] };
                searchPlaylistCache.set(cacheKey, hydrated);
                warmTrackArtwork(rows);
                void setCachedPlaylist(offlineOwnerKey, hydrated).catch(() => {});
                if (rows.length < 100) break;
              }
            }

            for (let index = 0; index < pageOffsets.length; index += 5) {
              const batch = pageOffsets.slice(index, index + 5);
              const pages = await Promise.all(
                batch.map((offset) =>
                  getPlaylist(playlistId, {
                    limit: 100,
                    offset,
                  }),
                ),
              );
              hydrated = {
                ...hydrated,
                tracks: [
                  ...hydrated.tracks,
                  ...pages.flatMap((page) =>
                    Array.isArray(page?.tracks) ? page.tracks : [],
                  ),
                ],
              };
              searchPlaylistCache.set(cacheKey, hydrated);
              warmTrackArtwork(pages.flatMap((page) => Array.isArray(page?.tracks) ? page.tracks : []));
              warmPlaylistAudio(hydrated.tracks);
              void setCachedPlaylist(offlineOwnerKey, hydrated).catch(() => {});
              if (openedPlaylistIdRef.current === key) {
                setOpenedPlaylist({
                  ...hydrated,
                  transient: true,
                });
              }
            }

            hydrated.complete = true;
            searchPlaylistCache.set(cacheKey, hydrated);
            void setCachedPlaylist(offlineOwnerKey, hydrated).catch(() => {});
            return hydrated;
          })().finally(() => searchPlaylistRequests.delete(cacheKey));
          searchPlaylistRequests.set(cacheKey, request);
        }
        playlist = await request;
      }

      if (openedPlaylistIdRef.current === key) {
        setOpenedPlaylist({ ...playlist, transient: false });
      }

      void reconcileDownloadedPlaylistMembership(
        playlist,
        offlineOwnerKey,
      ).catch(() => {});

      const [downloadedPlaylists, downloadJob] = await Promise.all([
        getDownloadedPlaylists(offlineOwnerKey).catch(() => []),
        getPlaylistDownloadJob(offlineOwnerKey, playlistId).catch(() => null),
      ]);
      if (openedPlaylistIdRef.current !== key) return;

      const downloaded = downloadedPlaylists.find((item) => String(item.id) === key) ?? null;
      const activeDownload = activePlaylistDownloads.find((item) => String(item.playlistId) === key) ?? null;

      if (activeDownload) {
        setPlaylistDownload({
          status: "downloading",
          progress: activeDownload.progress,
          trackProgress: activeDownload.trackProgress ?? {},
        });
      } else if (downloaded) {
        const downloadedIds = new Set(downloaded.tracks.map((track) => String(track.id)));
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
          progress: playlist.tracks.length
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
      } else {
        setPlaylistDownload({
          status: "idle",
          progress: 0,
          trackProgress: {},
        });
      }
    };

    void hydrate().catch((error) => {
      if (
        openedPlaylistIdRef.current === key &&
        !shell.tracks.length
      ) {
        setPlaylistError(
          error instanceof Error ? error.message : "Unable to load playlist tracks.",
        );
      }
    }).finally(() => {
      setPlaylistOpeningId((current) => current === key ? null : current);
    });
  }


function playOpenedPlaylist(
  startIndex = 0,
  tracksOverride = null,
) {
  const tracks =
    Array.isArray(
      tracksOverride,
    )
      ? tracksOverride
      : (
          openedPlaylist?.tracks ??
          []
        );

  if (!tracks.length) {
    return;
  }

  const queue =
    tracks.map(
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

        durationSeconds:
          track.duration_seconds ??
          track.durationSeconds ??
          null,

      }),
    );

  void player
    .playTrackQueue(
      queue,
      startIndex,
    )
    .catch(
      () => {},
    );
}


async function playSearchCollection(
  query,
) {
  const normalized =
    String(
      query ??
      "",
    ).trim();

  if (!normalized) {
    return;
  }

  try {
    const data =
      await searchHypersync(
        normalized,
        sortMode,
      );

    const tracks =
      Array.isArray(
        data?.tracks,
      )
        ? data.tracks
        : [];

    if (!tracks.length) {
      throw new Error(
        "No playable tracks found.",
      );
    }

    playOpenedPlaylist(
      0,
      tracks,
    );
  } catch (requestError) {
    setSearchError(
      requestError instanceof Error
        ? requestError.message
        : "Unable to play this collection.",
    );
  }
}


async function toggleOpenedPlaylistSaved() {
  if (
    !openedPlaylist ||
    openedPlaylist.transient ||
    playlistActionBusy
  ) {
    return;
  }

  if (!currentUser) {
    onOpenAuth?.();
    return;
  }

  const playlist = openedPlaylist;
  const playlistId = String(playlist.id);
  const shouldSave = !playlist.is_saved;
  const ownerKey = currentUser?.id ?? currentUser?.username ?? "anonymous";
  const optimisticPlaylist = {
    ...playlist,
    is_saved: shouldSave,
  };

  // Update the page and the shared Library snapshot before waiting on network.
  setPlaylistActionBusy(true);
  setPlaylistError("");
  setOpenedPlaylist(optimisticPlaylist);
  applySavedPlaylistMembership(
    ownerKey,
    optimisticPlaylist,
    shouldSave,
  );
  window.dispatchEvent(new CustomEvent("hypersync:library-changed", {
    detail: {
      phase: "optimistic",
      playlist: optimisticPlaylist,
      saved: shouldSave,
      ownerKey,
    },
  }));

  try {
    if (shouldSave) {
      await savePlaylist(playlistId);
    } else {
      await unsavePlaylist(playlistId);
    }

    settleSavedPlaylistMembership(ownerKey, playlistId);
    window.dispatchEvent(new CustomEvent("hypersync:library-changed", {
      detail: {
        phase: "confirmed",
        playlist: optimisticPlaylist,
        saved: shouldSave,
        ownerKey,
      },
    }));
  } catch (error) {
    const rollbackPlaylist = {
      ...playlist,
      is_saved: !shouldSave,
    };
    setOpenedPlaylist(current =>
      String(current?.id) === playlistId
        ? rollbackPlaylist
        : current,
    );
    applySavedPlaylistMembership(
      ownerKey,
      rollbackPlaylist,
      !shouldSave,
    );
    settleSavedPlaylistMembership(ownerKey, playlistId);
    window.dispatchEvent(new CustomEvent("hypersync:library-changed", {
      detail: {
        phase: "rollback",
        playlist: rollbackPlaylist,
        saved: !shouldSave,
        ownerKey,
      },
    }));
    setPlaylistError(
      error instanceof Error
        ? error.message
        : "Unable to update your Library. The change was reverted.",
    );
  } finally {
    setPlaylistActionBusy(false);
  }
}

async function confirmRemoveOpenedPlaylistDownload() {
  if (
    !openedPlaylist ||
    removingDownload
  ) {
    return;
  }

  setRemovingDownload(
    true,
  );

  setPlaylistError("");

  try {
    await removePlaylistFromOffline(
      openedPlaylist.id,
      offlineOwnerKey,
    );

    setPlaylistDownload({
      status: "idle",
      progress: 0,
      trackProgress: {},
    });

    setRemoveDownloadOpen(
      false,
    );
  } catch (error) {
    setPlaylistError(
      error instanceof Error
        ? error.message
        : "Unable to remove playlist download.",
    );
  } finally {
    setRemovingDownload(
      false,
    );
  }
}


async function downloadOpenedPlaylist() {
  if (
    !openedPlaylist ||
    openedPlaylist.transient ||
    playlistDownload.status ===
      "downloading"
  ) {
    return;
  }

  if (!isRegistered) {
    onOpenAuth?.();
    return;
  }

  setPlaylistError("");

  let playlistForDownload =
    openedPlaylist;

  try {
    /*
     * Downloading from Search should also
     * put the playlist in Library first.
     * Owned playlists are already there.
     */
    if (
      !playlistForDownload.is_owner &&
      !playlistForDownload.is_saved
    ) {
      setPlaylistActionBusy(
        true,
      );

      await savePlaylist(
        playlistForDownload.id,
      );

      window.dispatchEvent(
        new CustomEvent(
          "hypersync:library-changed",
        ),
      );

      playlistForDownload = {
        ...playlistForDownload,
        is_saved: true,
      };

      setOpenedPlaylist(
        playlistForDownload,
      );
    }

    /*
     * Re-fetch after saving so generated
     * playlists download the newest catalog
     * membership, not a stale Search snapshot.
     */
    playlistForDownload =
      await getPlaylist(
        playlistForDownload.id,
      );

    setOpenedPlaylist(
      playlistForDownload,
    );

    const tracks =
      playlistForDownload.tracks ??
      [];

    if (!tracks.length) {
      throw new Error(
        "This playlist has no tracks to download.",
      );
    }

    const playlistId =
      String(
        playlistForDownload.id,
      );

    setPlaylistDownload({
      status:
        "downloading",
      progress:
        0,
      trackProgress:
        {},
    });

    await startPlaylistDownloadForOffline(
      tracks,
      {
        jobId:
          getPlaylistDownloadJobId(
            offlineOwnerKey,
            playlistForDownload.id,
          ),
        ownerKey:
          offlineOwnerKey,
        jobMetadata: {
          kind:
            "playlist",
          playlistId:
            playlistForDownload.id,
          playlistTitle:
            playlistForDownload.title,
          playlistDescription:
            playlistForDownload.description ??
            null,
          playlistArtworkUrl:
            playlistForDownload.artwork_url ??
            null,
          playlistOwnerUsername:
            playlistForDownload.owner_username ??
            null,
          playlistVisibility:
            playlistForDownload.visibility ??
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
              String(track.id),
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

  } catch (error) {
    setPlaylistDownload({
      status:
        "error",
      progress:
        0,
      trackProgress:
        {},
    });

    if (
      typeof playlistForDownload?.id !==
        "undefined"
    ) {
      const failedPlaylistId =
        String(
          playlistForDownload.id,
        );

    }

    setPlaylistError(
      error instanceof Error
        ? error.message
        : "Unable to add and download playlist.",
    );
  } finally {
    setPlaylistActionBusy(
      false,
    );
  }
}

  const topSignal =
  useMemo(
    () =>
      pickTopSignal(
        displayResults,
      ),
    [displayResults],
  );

  const playlistDownloadPercent =
  Math.round(
    (
      playlistDownload.progress ??
      0
    ) *
      100,
  );

  const showTracks =
    activeFilter === "all" ||
    activeFilter === "tracks";

  const showPeople =
    activeFilter === "all" ||
    activeFilter === "people";

  const showPlaylists =
    activeFilter === "all" ||
    activeFilter === "playlists";

  const artistPanel =
    displayResults.artists.length > 0 ? (

      <SearchEntityPanel
        eyebrow="ENTITY INDEX"
        title="Artists"
        count={
          displayResults.counts.artists
        }
        modifier={
          "hs-search-discovery-panel--artists"
        }
      >

        {displayResults.artists.map(
          (artist, index) => (

            <button
              type="button"
              key={artist.name}
              className="hs-search-track hs-library-entity-row hs-search-entity-card"
              {...collectionActionMenu.getTriggerProps({
                key:
                  `artist:${artist.name}`,
                kind:
                  "artist",
                title:
                  artist.name,
                subtitle:
                  "Artist",
                artwork_url:
                  artist.artist_artwork_url ?? artist.artist_image_url ?? artist.artist_profile_image_url ?? artist.artist_photo_url ?? artist.artwork_url ??
                  null,
                actions: [
                  {
                    id:
                      "play",
                    label:
                      "Play artist",
                    icon:
                      "play",
                    onSelect:
                      () => {
                        void playSearchCollection(
                          `songs by ${artist.name}`,
                        );
                      },
                  },
                  {
                    id:
                      "open",
                    label:
                      "Open artist",
                    icon:
                      "music",
                    onSelect:
                      () => {
                        setOpenedArtistName(
                          artist.name,
                        );
                      },
                  },
                ],
              })}
              onClick={() => {
                setOpenedArtistName(
                  artist.name,
                );
              }}
            >

              <span className="hs-search-track__rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="hs-search-track__art hs-search-entity-card__art">

                <ArtistPortraitImage
                  artistName={artist.name}
                  src={resolveArtworkUrl(
                    artist.artist_artwork_url ?? artist.artist_image_url ?? artist.artist_profile_image_url ?? artist.artist_photo_url ?? artist.artwork_url,
                  )}
                  alt=""
                  loading="eager"
                  fetchPriority="high"
                  fallback={<Icon name="music" size={26} />}
                />

              </span>

              <span className="hs-search-track__copy">
                <strong>{artist.name}</strong>
                <small>{artist.track_count} matching tracks</small>
              </span>

              <Icon
                name="chevron"
                size={16}
              />

            </button>
          ),
        )}

      </SearchEntityPanel>

    ) : null;


  const collaborationTracks = displayResults.tracks.filter(isCollaborativeTrack);

  const collaborationPanel = collaborationTracks.length > 0 ? (
    <SearchEntityPanel
      eyebrow="RELATION INDEX"
      title="Collaborations"
      count={collaborationTracks.length}
      modifier="hs-search-discovery-panel--collaborations"
    >
      {collaborationTracks.map((track, collaborationIndex) => {
        const trackIndex = displayResults.tracks.findIndex((item) => String(item.id) === String(track.id));
        const artwork = resolveArtworkUrl(track.artwork_url);
        const artists = splitArtistCredits(trackArtistCredits(track));
        return (
          <button
            type="button"
            key={track.id}
            className="hs-search-track hs-library-entity-row hs-search-entity-card hs-collaboration-song-row"
            onClick={() => playTrack(trackIndex)}
          >
            <span className="hs-search-track__rank">{collaborationIndex + 1}</span>
            <span className="hs-search-track__art hs-search-entity-card__art">
              {artwork ? <SearchArtworkImage src={artwork} alt="" loading="lazy" decoding="async" /> : <Icon name="music" size={22} />}
            </span>
            <span className="hs-search-track__copy">
              <strong>{track.title}</strong>
              <small><ArtistCreditLinks credit={trackArtistCredits(track)} onOpenArtist={setOpenedArtistName} /></small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        );
      })}
    </SearchEntityPanel>
  ) : null;


  const albumPanel =
    displayResults.albums.length > 0 ? (

      <SearchEntityPanel
        eyebrow="RELEASE INDEX"
        title="Albums"
        count={
          displayResults.counts.albums
        }
        modifier={
          "hs-search-discovery-panel--albums"
        }
      >

        {displayResults.albums.map(
          (album, index) => (

            <button
              type="button"
              key={
                `${album.artist}:${album.title}`
              }
              className="hs-search-track hs-library-entity-row hs-search-entity-card"
              {...collectionActionMenu.getTriggerProps({
                key:
                  `album:${album.artist}:${album.title}`,
                kind:
                  "album",
                title:
                  album.title,
                subtitle:
                  album.artist ||
                  "Album",
                artwork_url:
                  album.artwork_url ??
                  null,
                actions: [
                  {
                    id:
                      "play",
                    label:
                      "Play album",
                    icon:
                      "play",
                    onSelect:
                      () => {
                        void playSearchCollection(
                          [
                            album.title,
                            album.artist,
                          ]
                            .filter(Boolean)
                            .join(" "),
                        );
                      },
                  },
                  {
                    id:
                      "open",
                    label:
                      "Open album",
                    icon:
                      "disc",
                    onSelect:
                      () => {
                        onQueryChange(
                          album.title,
                        );
                      },
                  },
                ],
              })}
              onClick={() => {
                onQueryChange(
                  album.title,
                );
              }}
            >

              <span className="hs-search-track__rank">{String(index + 1).padStart(2, "0")}</span>

              <span className="hs-search-entity-card__art">

                {resolveArtworkUrl(
                  album.artwork_url,
                ) ? (
                  <SearchArtworkImage
                    src={
                      resolveArtworkUrl(
                        album.artwork_url,
                      )
                    }
                    alt=""
                  />
                ) : (
                  <Icon
                    name="disc"
                    size={26}
                  />
                )}

              </span>

              <span className="hs-search-track__copy">
                <strong>{album.title}</strong>
                <small>{album.artist || "Album"}</small>
              </span>

              <Icon
                name="chevron"
                size={16}
              />

            </button>
          ),
        )}

      </SearchEntityPanel>

    ) : null;


  if (openedArtistName) {
    const artistNames = splitArtistCredits(openedArtistName);
    return (
      <div className="hs-search-artist-profile-stack">
        {artistNames.map((artistName, index) => (
          <ArtistProfilePage
            key={artistName}
            artistName={artistName}
            currentUser={currentUser}
            onOpenAuth={onOpenAuth}
            onOpenRelease={(releaseQuery) => {
              setOpenedArtistName("");
              setOpenedPlaylist(null);
              setPlaylistSearchQuery("");
              onQueryChange?.(releaseQuery);
            }}
          />
        ))}
      </div>
    );
  }


  return (
    <div
      className="page-stack hs-search-page"
      {...resultsSortMenu.getTriggerProps()}
    >

      <section className="hs-search-console">

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


  <div className="hs-search-console__surface-group">
  <div className="hs-search-console__heading">

    <div className="hs-search-console__intro">
  <span className="hs-search-console__eyebrow">DISCOVER YOUR NEXT SOUND</span>
  <h2>Tune into something new</h2>
  




    </div>



  </div>


  <label className="hs-search-input">

    <span className="hs-search-input__icon">
      <Icon
        name="search"
        size={23}
      />
    </span>

    <input
      ref={searchInputRef}
      type="search"
      value={query}
      placeholder={
  activeFilter === "people" &&
  !normalizedQuery
    ? "Search people by name or @username..."
    : "Search songs, artists, genres, or type a vibe..."
}
      autoComplete="off"
      spellCheck="false"
      onChange={(event) => {
        setDiscoveryMode("");
        setDiscoveryTracks([]);
        setDiscoveryError("");
        setSuggestionsDismissed(false);
        onQueryChange(
          event.target.value,
        );
      }}
      onKeyDown={
        handleSearchKeyDown
      }
    />

    <span
      className={
        loading
          ? "hs-search-scan-dot is-active"
          : "hs-search-scan-dot"
      }
      aria-hidden="true"
    />

  </label>


  </div>
  </section>


      {normalizedQuery && !openedPlaylist && !suggestionsDismissed && recentSearches.some((item) => item.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())) ? (
        <div className="hs-search-history-suggestions" role="listbox" aria-label="Recent search suggestions">
          {recentSearches
            .filter((item) => item.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase()))
            .slice(0, 6)
            .map((item) => (
              <div className="hs-search-history-suggestion" role="option" aria-selected="false" key={item}>
                <button type="button" className="hs-search-history-suggestion__open" onClick={() => { rememberSearch(item); setSuggestionsDismissed(true); onQueryChange(item); }}>
                  <span className="hs-search-history-suggestions__icon"><Icon name="search" size={14} /></span>
                  <span>{item}</span>
                </button>
                <button type="button" className="hs-search-history-suggestion__remove" aria-label={`Remove ${item} from search history`} title="Remove from search history" onClick={(event) => { event.preventDefault(); event.stopPropagation(); const next = removeRecentSearch(item, recentSearchOwner); setRecentSearches(next); setSuggestionsDismissed(false); }}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
        </div>
      ) : null}

      {!normalizedQuery && !openedPlaylist ? (
        <section className="hs-search-discovery" aria-label="Search discovery">
          <div className="hs-search-discovery__section-head hs-search-discovery__browse-head">
            <div><span>EXPLORE HYPERSYNCED</span><h3>Find your next favorite</h3></div>
          </div>
          <div className="hs-search-discovery__tiles">
            {[
              { id: "newly-released", label: "Newly Released", query: "new releases", filter: "tracks", icon: "sparkles" },
              { id: "find-people", label: "Find People", query: "", filter: "people", icon: "people" },
              { id: "find-new-tunes", label: "Find New Tunes", query: "", filter: "tracks", icon: "music" },
              ...SEARCH_QUICK_COMMANDS.map((command) => ({ ...command, icon: command.filter === "people" ? "people" : command.filter === "albums" ? "disc" : command.filter === "artists" ? "music" : "play" })),
            ].map((command) => {
              return (
              <button type="button" key={command.id} className={`hs-search-discovery__tile${command.id === "newly-released" ? " is-newly-released" : ""}`} onClick={() => runQuickCommand(command)}>
                <span className="hs-search-discovery__tile-label">{command.label}</span>
                <span className="hs-search-discovery__tile-art" aria-hidden="true">
                  {(command.filter === "people"
                    ? discoveryPeopleArtwork.map((person) => person.avatar_url)
                    : (() => {
                        const commandTerms = String(command.query || command.label || "").toLowerCase().split(/[^a-z0-9]+/).filter((term) => term && !["find", "new", "tunes", "music", "songs", "tracks"].includes(term));
                        const libraryMatches = command.id === "newly-released"
                          ? discoveryCardArtwork.filter((art) => art.releaseYear >= 2025)
                          : command.filter === "artists"
                            ? discoveryCardArtwork.filter((art) => art.artistArtwork)
                            : discoveryCardArtwork.filter((art) => commandTerms.some((term) => art.genre.split(/[^a-z0-9]+/).includes(term)));
                        const searchedMatches = discoveryArtworkByCommand[command.id] || [];
                        // Combine category matches with that card's search results. Fill remaining
                        // slots from cached catalog art so a card never stays visually empty when
                        // a genre has a sparse catalog; never repeat the same artwork within a tile.
                        const candidates = [...libraryMatches, ...searchedMatches, ...discoveryCardArtwork];
                        const used = new Set();
                        const picked = [];
                        for (const art of candidates) {
                          const image = command.filter === "artists" && art.artistArtwork ? art.artistArtwork : art.artwork;
                          if (!image || used.has(String(image))) continue;
                          used.add(String(image));
                          picked.push(image);
                          if (picked.length >= 3) break;
                        }
                        return picked;
                      })()).slice(0, 3).map((src, artIndex) => <SearchArtworkImage key={`${command.id}-${artIndex}`} className={`hs-search-discovery__tile-art-cover hs-search-discovery__tile-art-cover--${artIndex + 1}`} src={resolveArtworkUrl(src)} alt="" loading={command.filter === "people" ? "eager" : "lazy"} decoding="async" />)}
                  <span className="hs-search-discovery__tile-icon"><Icon name={command.icon} size={19} /></span>
                  <span className="hs-search-discovery__tile-sparkles" aria-hidden="true">
                    <i>✦</i><i>✧</i><i>✦</i>
                  </span>
                </span>
              </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {!openedPlaylist && normalizedQuery && completedSearchQuery === normalizedQuery && !loading && !searchError && resultTotal === 0 ? (
        <div className="hs-search-no-results-banner" role="status" aria-live="polite">
          <span className="hs-search-no-results-banner__icon"><Icon name="search" size={16} /></span>
          <span><strong>No results found</strong><small>Try a different song, artist, album, or search phrase.</small></span>
        </div>
      ) : null}


      {openedPlaylist ? (
        <>
  <section className="hs-search-playlist-view">

    <div className="hs-search-playlist-view__nav">

      

    </div>


    <section className="hs-search-playlist-view__hero">

      <div className="hs-search-playlist-view__art">

        <PlaylistArtwork
          tracks={
            openedPlaylist.tracks
          }
          artworkUrls={
            openedPlaylist.artwork_urls
          }
          artworkUrl={
            openedPlaylist.artwork_url
          }
          fallbackSize={32}
          loading="eager"
          fetchPriority="high"
        />

      </div>


      <div className="hs-search-playlist-view__copy">

        <span>
          PLAYLIST
        </span>

        <h2>
          {openedPlaylist.title}
        </h2>

        {openedPlaylist.description ? (
          <p>
            {openedPlaylist.description}
          </p>
        ) : null}

        <small>
          {
            openedPlaylist.owner_username ||
            "HyperSynced"
          }
          {" • "}
          {
            openedPlaylist.tracks?.length ??
            0
          }
          {" "}
          {
            openedPlaylist.tracks?.length ===
            1
              ? "track"
              : "tracks"
          }
        </small>


        <div className="hs-search-playlist-view__actions">

          <button
            type="button"
            className="hs-search-playlist-primary"
            disabled={
              !openedPlaylist.tracks?.length
            }
            onClick={() => {
              playOpenedPlaylist(
                0,
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
              openedPlaylist.transient ||
              !openedPlaylist.tracks?.length ||
              playlistDownload.status ===
                "downloading"
            }
            onClick={() => {
              if (
                playlistDownload.status ===
                  "downloaded"
              ) {
                setRemoveDownloadOpen(
                  true,
                );
              } else {
                void downloadOpenedPlaylist();
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


          {!openedPlaylist.is_owner ? (

  <button
    type="button"
    className={
      `hs-search-library-toggle${openedPlaylist.is_saved ? " is-saved" : ""}`
    }
    disabled={
      openedPlaylist.transient ||
      playlistActionBusy
    }
    title={
      openedPlaylist.is_saved
        ? "Remove from Library"
        : "Add to Library"
    }
    aria-label={
      openedPlaylist.is_saved
        ? "Remove playlist from Library"
        : "Add playlist to Library"
    }
    aria-pressed={Boolean(openedPlaylist.is_saved)}
    onClick={() => {
      void toggleOpenedPlaylistSaved();
    }}
  >
    <Icon
      name={
        openedPlaylist.is_saved
          ? "check"
          : "plus"
      }
      size={15}
    />
  </button>

) : null}

        </div>

      </div>

    </section>


    {playlistError ? (
      <section className="hs-search-message hs-search-message--error">
        <div>
          <strong>
            PLAYLIST ERROR
          </strong>

          <p>
            {playlistError}
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
          {playlistSearchQuery.trim()
            ? (
                filteredOpenedPlaylistTracks.length +
                " / " +
                (
                  openedPlaylist.tracks
                    ?.length ??
                  0
                )
              )
            : (
                openedPlaylist.tracks
                  ?.length ??
                0
              )}
        </strong>

      </div>

      {(openedPlaylist.tracks?.length ??
      0) > 0 ? (
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
                  `Search in ${openedPlaylist.title}`
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
          </div>

          <div className="hs-playlist-track-search__meta">
            <span>
              {playlistSearchQuery.trim()
                ? (
                    filteredOpenedPlaylistTracks.length +
                    " of " +
                    (
                      openedPlaylist.tracks
                        ?.length ??
                      0
                    ) +
                    " tracks"
                  )
                : (
                    (
                      openedPlaylist.tracks
                        ?.length ??
                      0
                    ) +
                    (
                      openedPlaylist.tracks?.length ===
                        1
                        ? " track"
                        : " tracks"
                    )
                  )}
            </span>

            {playlistSearchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setPlaylistSearchQuery(
                    "",
                  );
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}


      {filteredOpenedPlaylistTracks.length === 0 &&
      !playlistSearchQuery.trim() &&
      playlistOpeningId === String(openedPlaylist.id) ? (
        <div className="hs-playlist-loading-rows" aria-label="Loading playlist tracks" aria-live="polite">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="hs-playlist-loading-row" key={`playlist-skeleton-${index}`}>
              <span className="hs-playlist-shimmer hs-playlist-loading-rank" />
              <span className="hs-playlist-shimmer hs-playlist-loading-thumb" />
              <span className="hs-playlist-loading-row-copy">
                <span className="hs-playlist-shimmer hs-playlist-loading-song" />
                <span className="hs-playlist-shimmer hs-playlist-loading-artist" />
              </span>
              <span className="hs-playlist-shimmer hs-playlist-loading-duration" />
            </div>
          ))}
        </div>
      ) : null}

      {filteredOpenedPlaylistTracks.length ===
      0 &&
      playlistSearchQuery.trim() ? (
        <div className="hs-search-message hs-playlist-search-empty">
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

        {filteredOpenedPlaylistTracks.map(
          (
            track,
            trackIndex,
          ) => {

            const artworkUrl =
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
                  `${track.id}-${trackIndex}`
                }
                role="button"
                tabIndex={0}
                {...trackActionMenu.getTriggerProps(track)}
                className={[
                  "hs-search-track",
                  "hs-search-track--playlist-download",

                  isCurrentTrack ? "is-current-track" : "",
                  isCurrentTrack && currentTrackIsPlaying ? "is-playing-track" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  playOpenedPlaylist(
                    trackIndex,
                    filteredOpenedPlaylistTracks,
                  );
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

                    playOpenedPlaylist(
                      trackIndex,
                      filteredOpenedPlaylistTracks,
                    );
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

                  {artworkUrl ? (
                    <SearchArtworkImage
                      src={
                        artworkUrl
                      }
                      alt=""
                      loading={
                        trackIndex < 6
                          ? "eager"
                          : "lazy"
                      }
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
                    PLAYLIST TRACK
                  </em>

                  <small>
                    {track.album ||
                      openedPlaylist.title}
                  </small>

                </span>


                <span className="hs-search-track__duration">
                  {formatDuration(
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
                  {isCurrentTrack && currentTrackIsPlaying ? <PlayingIndicator /> : null}
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
        removeDownloadOpen
      }
      playlistTitle={
        openedPlaylist?.title
      }
      busy={
        removingDownload
      }
      onCancel={() => {
        if (
          !removingDownload
        ) {
          setRemoveDownloadOpen(
            false,
          );
        }
      }}
      onConfirm={() => {
        void confirmRemoveOpenedPlaylistDownload();
      }}
    />
        </>
) : normalizedQuery ? (
        <>

          <section className="hs-search-filterbar">

            {FILTERS.map(
              ([
                filter,
                label,
              ]) => (
                <button
                  type="button"
                  key={filter}
                  data-filter={filter}
                  className={
                    activeFilter ===
                    filter
                      ? "is-active"
                      : ""
                  }
                  onClick={() => {
                    setActiveFilter(
                      filter,
                    );
                  }}
                >
                  <span>
                    {label}
                  </span>

                  <strong>
                    {searchFilterCount(
                      filter,
                      displayResults.counts,
                    )}
                  </strong>
                </button>
              ),
            )}

          </section>


          {!searchError && completedSearchQuery === normalizedQuery && !loading && activeFilter !== "all" && searchFilterCount(activeFilter, displayResults.counts) === 0 ? (<section className="hs-search-filter-empty" role="status" aria-live="polite"><span className="hs-search-filter-empty__orb"><i /><i /><i /></span><strong>Nothing in this frequency yet</strong><p>Try another filter or let HyperSynced find something new.</p><button type="button" onClick={() => setActiveFilter("all")}>Show all results</button></section>) : null}
          {searchError ? (
            <section className="hs-search-message hs-search-message--error">

              <Icon
                name="search"
                size={24}
              />

              <div>
                <strong>
                  SEARCH CORE ERROR
                </strong>

                <p>
                  {searchError}
                </p>
              </div>

            </section>
          ) : null}


                    {looksLikeSmartPlaylistQuery(
            normalizedQuery,
          ) ? (
            <section className="hs-search-generated-playlist">

              <div className="hs-search-generated-playlist__hero">

                <div className="hs-search-generated-playlist__art">
                  <PlaylistArtwork
                    tracks={
                      displayResults.tracks
                    }
                    fallbackSize={34}
                    loading="eager"
                    fetchPriority="high"
                  />
                </div>

                <div className="hs-search-generated-playlist__copy">

                  <span>
                    GENERATED PLAYLIST
                  </span>

                  <h3>
                    {normalizedQuery}
                  </h3>

                  <p>
                    HyperSynced ranked the best matching music for this vibe or genre.
                  </p>

                  <small>
                    {displayResults.tracks.length}
                    {" "}
                    {displayResults.tracks.length === 1
                      ? "song"
                      : "songs"}
                  </small>

                  <div className="hs-search-generated-playlist__actions">
                    <button
                      type="button"
                      disabled={
                        displayResults.tracks.length === 0
                      }
                      onClick={() => {
                        playTrack(
                          0,
                        );
                      }}
                    >
                      <Icon
                        name="play"
                        size={15}
                      />

                      Play generated playlist
                    </button>
                  </div>

                </div>

              </div>

              {displayResults.tracks.length ? (
                <div className="hs-search-track-list hs-search-generated-playlist__tracks">

                  {displayResults.tracks.map(
                    (
                      track,
                      trackIndex,
                    ) => {
                      const artworkUrl =
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
                            track.id
                          }
                          role="button"
                          tabIndex={0}
                          {...trackActionMenu.getTriggerProps(
                            track,
                          )}
                          className={[
                            "hs-search-track",
                            "hs-search-track-result-row",
                            "hs-search-generated-track",
                            selectedTrackIndex ===
                              trackIndex
                              ? "is-selected"
                              : "",
                            isCurrentTrack ? "is-current-track" : "",
                  isCurrentTrack && currentTrackIsPlaying ? "is-playing-track" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onMouseEnter={() => {
                            setSelectedTrackIndex(
                              trackIndex,
                            );
                            void player.warmTrackForPlayback(
                              track.id,
                              track,
                            );
                          }}
                          onFocus={() => {
                            void player.warmTrackForPlayback(
                              track.id,
                              track,
                            );
                          }}
                          onMouseLeave={() => {
                            setSelectedTrackIndex(
                              -1,
                            );
                          }}
                          onClick={() => {
                            playTrack(
                              trackIndex,
                            );
                          }}
                          onKeyDown={(
                            event,
                          ) => {
                            if (
                              event.key ===
                                "Enter"
                              || event.key ===
                                " "
                            ) {
                              event.preventDefault();

                              playTrack(
                                trackIndex,
                              );
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
                            {artworkUrl ? (
                              <SearchArtworkImage
                                src={
                                  artworkUrl
                                }
                                alt=""
                                loading={
                                  trackIndex < 6
                                    ? "eager"
                                    : "lazy"
                                }
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
                              <ArtistCreditLinks credit={trackArtistCredits(track)} onOpenArtist={setOpenedArtistName} />
                              {track.album ? ` • ${track.album}` : ""}
                            </small>
                          </span>

                          <span className="hs-search-track__signals">
                            <em>
                              {track.genre ||
                                "VIBE MATCH"}
                            </em>

                            <small>
                              {track.release_year
                                ? `${track.release_year} • `
                                : ""}
                              {track.match_label ||
                                "SMART MATCH"}
                            </small>
                          </span>

                          <span className="hs-search-track__duration">
                            {formatDuration(
                              track.duration_seconds,
                            )}
                          </span>

                          <span className="hs-search-track__play">
                  {isCurrentTrack && currentTrackIsPlaying ? <PlayingIndicator /> : null}
                            <Icon
                              name={
                                isCurrentTrack && currentTrackIsPlaying
                                  ? "pause"
                                  : "play"
                              }
                              size={16}
                            />
                          </span>

                        </div>
                      );
                    },
                  )}

                </div>
              ) : !loading ? (
                <div className="hs-search-message">
                  <Icon
                    name="music"
                    size={22}
                  />

                  <div>
                    <strong>
                      No matching music yet
                    </strong>

                    <p>
                      Try a broader vibe or genre, or add more tagged music to the catalog.
                    </p>
                  </div>
                </div>
              ) : null}

            </section>
          ) : null}


          {showPlaylists &&
          displayResults.playlists?.length > 0 ? (

            <section className="hs-search-section">

              <div className="hs-search-section__heading">

                <div>
                  <span>
                    PLAYLIST INDEX
                  </span>

                  <h3>
                    Playlists
                  </h3>
                </div>

                <strong>
                  {
                    combinedResults.counts
                      .playlists
                  }
                </strong>

              </div>


              <div className="hs-search-track-list">

                {displayResults.playlists.map(
                  (
                    playlist,
                    playlistIndex,
                  ) => {

                    const rowDownload =
                      optimisticPlaylistRowDownloads[String(playlist.id)] ??
                      playlistRowDownloads[String(playlist.id)] ??
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
                        className="hs-search-track hs-search-playlist-result-row"
                        {...collectionActionMenu.getTriggerProps({
                          key:
                            `playlist:${playlist.id}`,
                          kind:
                            "playlist",
                          title:
                            playlist.title,
                          subtitle:
                            playlist.owner_username ||
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

                                    playOpenedPlaylist(
                                      0,
                                      fullPlaylist.tracks ??
                                        [],
                                    );
                                  } catch (
                                    requestError
                                  ) {
                                    setPlaylistError(
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
                                  void openSearchPlaylist(playlist);
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
                                Boolean(
                                  playlist.transient,
                                ) ||
                                rowDownload?.status ===
                                  "downloaded" ||
                                rowDownload?.status ===
                                  "downloading",
                              onSelect:
                                async () => {
                                  if (
                                    playlist.transient
                                  ) {
                                    return;
                                  }

                                  if (!isRegistered) {
                                    onOpenAuth?.();
                                    return;
                                  }

                                  const playlistId = String(playlist.id);
                                  const optimisticSavedPlaylist = {
                                    ...playlist,
                                    is_saved: true,
                                  };
                                  setOptimisticPlaylistRowDownloads(current => ({
                                    ...current,
                                    [playlistId]: { status: "downloading", progress: 0 },
                                  }));
                                  // Add to the Library cache/UI immediately; backend save and
                                  // playlist resolution continue asynchronously behind the UI.
                                  if (!playlist.is_owner && !playlist.is_saved) {
                                    const ownerKey = currentUser?.id ?? currentUser?.username ?? "anonymous";
                                    applySavedPlaylistMembership(ownerKey, optimisticSavedPlaylist, true);
                                    window.dispatchEvent(new CustomEvent("hypersync:library-changed", {
                                      detail: {
                                        phase: "optimistic",
                                        playlist: optimisticSavedPlaylist,
                                        saved: true,
                                        ownerKey,
                                      },
                                    }));
                                  }
                                  try {
                                    await downloadPlaylistByIdForOffline(
                                      playlist.id,
                                      currentUser,
                                      {
                                        ensureSaved: true,
                                      },
                                    );
                                    setOptimisticPlaylistRowDownloads(current => ({
                                      ...current,
                                      [playlistId]: { status: "downloaded", progress: 1 },
                                    }));
                                  } catch (requestError) {
                                    setOptimisticPlaylistRowDownloads(current => ({
                                      ...current,
                                      [playlistId]: { status: "error", progress: 0 },
                                    }));
                                    setPlaylistError(
                                      requestError instanceof Error
                                        ? requestError.message
                                        : "Unable to download playlist.",
                                    );
                                  }
                                },
                            },
                          ],
                        })}
                        onClick={() => {
                        void openSearchPlaylist(playlist);
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

                            void openSearchPlaylist(playlist);
                          }
                        }}
                      >

                        <span className="hs-search-track__rank">
                          {String(
                            playlistIndex +
                              1,
                          ).padStart(
                            2,
                            "0",
                          )}
                        </span>


                        <span className="hs-search-track__art">

                          <PlaylistArtwork
                            artworkUrls={
                              playlist.artwork_urls
                            }
                            artworkUrl={
                              playlist.artwork_url
                            }
                            fallbackSize={20}
                            loading="eager"
                            fetchPriority="high"
                          />

                          <i aria-hidden="true">
                            <Icon
                              name="chevron"
                              size={15}
                            />
                          </i>

                        </span>


                        <span className="hs-search-track__copy">

                          <strong>
                            {
                              playlist.title
                            }
                          </strong>

                          <small>
                            {playlist.is_saved ? "✓ In Library" : "HyperSynced"}
                          </small>

                        </span>


                        <span className="hs-search-track__signals">

                          <em>
                            {
                              playlist.match_label ||
                              "GENERATED PLAYLIST"
                            }
                          </em>

                          <small>
                            {
                              playlist.track_count
                            }
                            {" "}
                            tracks
                          </small>

                        </span>


                        <span className="hs-search-track__duration">
                          {
                            playlist.track_count
                          }
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

            </section>

          ) : null}


          {showTracks &&
!looksLikeSmartPlaylistQuery(
  normalizedQuery,
) &&
displayResults.tracks.length > 0 ? (

            <section className="hs-search-section">

              <div className="hs-search-section__heading">

                <div>
                  <span>
                    AUDIO INDEX
                  </span>

                  <h3>
                    Tracks
                  </h3>
                </div>

                <strong>
                  {
                    combinedResults
                      .counts
                      .tracks
                  }
                </strong>

              </div>


              <div className="hs-search-track-list">

                {displayResults.tracks.map(
                  (
                    track,
                    trackIndex,
                  ) => {

                    const artworkUrl =
                      resolveArtworkUrl(
                        track.artwork_url,
                      );

                    const isCurrentTrack =
                      activeFilter === "all" &&
                      currentTrackId !== null &&
                      String(track.id) ===
                        currentTrackId;

                    return (
                      <div
                        key={track.id}
                        role="button"
                        tabIndex={0}
                        {...trackActionMenu.getTriggerProps(track)}
                        className={[
                        "hs-search-track",
                      

                        selectedTrackIndex ===
                        trackIndex
                        ? "is-selected"
                        : "",

                        isCurrentTrack ? "is-current-track" : "",
                  isCurrentTrack && currentTrackIsPlaying ? "is-playing-track" : "",
                        ]
                        .filter(Boolean)
                        .join(" ")}
                        onMouseEnter={() => {
                        setSelectedTrackIndex(
                        trackIndex,
                        );
                        void player.warmTrackForPlayback(
                        track.id,
                        track,
                        );
                        }}
                        onFocus={() => {
                        void player.warmTrackForPlayback(
                        track.id,
                        track,
                        );
                        }}
                        onMouseLeave={() => {
                        setSelectedTrackIndex(
                        -1,
                        );
                        }}
                        onClick={() => {
                        playTrack(
                        trackIndex,
                        );
                        }}
                        onKeyDown={(event) => {
                        if (
                        event.key ===
                        "Enter" ||
                        event.key ===
                        " "
                        ) {
                        event.preventDefault();

                        playTrack(
                        trackIndex,
                        );
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

                          {artworkUrl ? (
                            <SearchArtworkImage
                              src={artworkUrl}
                              alt=""
                              decoding="async"
                              loading={
                                trackIndex < 6
                                  ? "eager"
                                  : "lazy"
                              }
                              fetchPriority={
                                trackIndex < 3
                                  ? "high"
                                  : "auto"
                              }
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
                            <ArtistCreditLinks credit={track.artist} onOpenArtist={setOpenedArtistName} />
                            {track.album ? ` • ${track.album}` : ""}
                          </small>

                        </span>


                        <span className="hs-search-track__signals">

                          <em>
                            {track.user_play_count > 0
                              ? "IN YOUR ROTATION"
                              : track.match_label}
                          </em>

                          <small>
                            {`${track.global_play_count} plays`}
                          </small>

                        </span>


                        <span className="hs-search-track__duration">
                          {formatDuration(
                            track.duration_seconds,
                          )}
                        </span>


                        <span className="hs-search-track__play">
                  {isCurrentTrack && currentTrackIsPlaying ? <PlayingIndicator /> : null}
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

            </section>
          ) : null}


                    {activeFilter === "all" &&
          (
            artistPanel ||
            collaborationPanel ||
            albumPanel
          ) ? (

            <div className="hs-search-discovery-shell">

              <div
                className="hs-search-discovery-mobile-head"
                aria-hidden="true"
              >
                <span>
                  DISCOVERY DECK
                </span>

                <small>
                  SWIPE TO EXPLORE
                  {" "}
                  →
                </small>
              </div>

              <div className="hs-search-discovery-grid">

                {albumPanel}

                {artistPanel}

                {collaborationPanel}

              </div>

            </div>

          ) : null}


          {activeFilter === "artists"
            ? artistPanel
            : null}


          {activeFilter ===
          "collaborations"
            ? collaborationPanel
            : null}


          {activeFilter === "albums"
            ? albumPanel
            : null}


          {showPeople &&
          displayResults.people.length > 0 ? (

            <section className="hs-search-section">

              <div className="hs-search-section__heading">

                <div>
                  <span>
                    SOCIAL INDEX
                  </span>

                  <h3>
                    People
                  </h3>
                </div>

                <strong>
                  {displayResults.counts.people}
                </strong>

              </div>


              <div className="hs-search-people-list">

                {displayResults.people.map(
                  (person) => {
                    const canMessage =
                      isRegistered &&
                      String(
                        person.username,
                      ).toLocaleLowerCase()
                      !==
                      String(
                        currentUser?.username ??
                        "",
                      ).toLocaleLowerCase();

                    return (
                      <div
                        className="hs-search-person hs-search-person--messageable"
                        key={
                          person.username
                        }
                      >
                        <button
                          type="button"
                          className="hs-search-person__profile"
                          onClick={() => {
                            onOpenProfile?.(
                              person.username,
                            );
                          }}
                        >
                          <Avatar
                            src={
                              person.avatar_url
                            }
                            name={
                              person.display_name
                            }
                            size="small"
                          />

                          <span>
                            <small>
                              {person.match_label}
                            </small>

                            <strong>
                              {person.display_name}
                            </strong>

                            <em>
                              @{person.username}
                              {" • "}
                              {person.followers_count}
                              {" followers • "}
                              {memberFor(
                                person.member_since,
                              )}
                            </em>
                          </span>
                        </button>

                        {canMessage ? (
                          <button
                            type="button"
                            className="hs-search-person__message"
                            title={
                              `Message @${person.username}`
                            }
                            aria-label={
                              `Message @${person.username}`
                            }
                            onClick={() => {
                              onMessageUser?.(
                                person.username,
                              );
                            }}
                          >
                            <Icon
                              name="mail"
                              size={17}
                            />
                          </button>
                        ) : (
                          <Icon
                            name="chevron"
                            size={16}
                          />
                        )}
                      </div>
                    );
                  },
                )}

              </div>

            </section>
          ) : null}

        </>
      ) : (

        <></>
      )}

      {typeof navigator !== "undefined" && navigator.onLine === false && downloadedMusicCount === 0 ? (
        <OfflineNotice
          title="Go back online to search music"
          description="No downloaded music is available on this device. Reconnect to search music."
        />
      ) : null}

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
          changeSortMode
        }
      />


    </div>
  );
}


export default SearchPage;
