import {
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";

import {
  getCachedObjectUrl,
  resolveMediaUrl,
} from "../../mediaCache.js";

import {
  resolveArtworkUrl,
} from "../../artworkUrl.js";

import * as player from "../../audioPlayer.js";

import {
  getGreetingName,
} from "../../utils/user.js";

import SectionHeading from "../ui/SectionHeading.jsx";

import TrackActionMenu from
  "../music/TrackActionMenu.jsx";

import useTrackActionMenu from
  "../../hooks/useTrackActionMenu.js";

import useQuietRefresh from
  "../../hooks/useQuietRefresh.js";

import useOnlineStatus from
  "../../hooks/useOnlineStatus.js";

import OfflineNotice from
  "../ui/OfflineNotice.jsx";

import {
  getMyRecentlyPlayed,
} from "../../profileApi.js";

import {
  getHomeRecentlyPlayed,
  getHomeRecentlyPlayedForOwner,
  applyOptimisticRecentlyPlayed,
  isCurrentHistoryResponse,
  readCachedHomeRecentlyPlayed,
  writeCachedHomeRecentlyPlayed,
  subscribeListeningHistoryChanged,
} from "../../homeRecentlyPlayed.js";

function CachedArtwork({
  src,
  alt,
}) {
  const [displaySrc, setDisplaySrc] =
    useState(
      src ?? null,
    );

  useEffect(() => {
    let cancelled =
      false;

    let objectUrl =
      null;

    setDisplaySrc(
      src ?? null,
    );

    if (!src) {
      return undefined;
    }

    const loadCachedArtwork =
      async () => {
        try {
          const cachedUrl =
            await getCachedObjectUrl(
              src,
            );

          if (!cachedUrl) {
            return;
          }

          if (cancelled) {
            URL.revokeObjectURL(
              cachedUrl,
            );

            return;
          }

          objectUrl =
            cachedUrl;

          setDisplaySrc(
            cachedUrl,
          );
        } catch {
          // Fall back to the normal URL.
        }
      };

    void loadCachedArtwork();

    return () => {
      cancelled =
        true;

      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl,
        );
      }
    };
  }, [src]);

  return (
    <img
      src={displaySrc ?? src}
      alt={alt}
    />
  );
}


function HomePage({
  currentUser,
  onNavigate,
  onOpenAuth,
}) {
  const historyRequest = useRef(0);
  const historyOwner = useRef(currentUser?.id);
  historyOwner.current = currentUser?.id;

  const online =
    useOnlineStatus();

  const trackActionMenu =
    useTrackActionMenu();

  const greetingName =
    getGreetingName(currentUser);

  const recentOwner = currentUser?.id ?? currentUser?.username;
  const [recentlyPlayedState, setRecentlyPlayedState] = useState(() => ({
    owner: recentOwner,
    tracks: readCachedHomeRecentlyPlayed(recentOwner),
  }));
  const recentlyPlayed = getHomeRecentlyPlayedForOwner(
    recentOwner,
    recentlyPlayedState.owner,
    recentlyPlayedState.tracks,
  );
  const setRecentlyPlayed = (nextTracks) => {
    setRecentlyPlayedState((current) => ({
      owner: recentOwner,
      tracks: typeof nextTracks === "function"
        ? nextTracks(
            current.owner === recentOwner
              ? current.tracks
              : readCachedHomeRecentlyPlayed(recentOwner),
          )
        : nextTracks,
    }));
  };

const [
  recentLoading,
  setRecentLoading,
] = useState(
  Boolean(currentUser),
);

const [
  recentError,
  setRecentError,
] = useState("");


const loadRecentlyPlayed =
  useCallback(
    async ({
      quiet = false,
    } = {}) => {
      const request = ++historyRequest.current;
      const owner = currentUser?.id;
      const isCurrent = () => isCurrentHistoryResponse(request, historyRequest.current, owner, historyOwner.current);
      if (!currentUser) {
        setRecentlyPlayed(
          [],
        );

        setRecentLoading(
          false,
        );

        setRecentError(
          "",
        );

        return;
      }

      if (!quiet) {
        setRecentLoading(true);
        setRecentError("");
      }

      const offline =
        typeof navigator !==
          "undefined" &&
        navigator.onLine ===
          false;

      if (offline) {
        // Keep the last Neon-sourced snapshot; downloaded files are not
        // listening history and must never be mixed into Recently Played.
        setRecentLoading(false);
        return;
      }

      try {
        const profile =
          await getMyRecentlyPlayed();
        if (!isCurrent()) return;

        // Neon listening events are the single source of truth for both
        // Home and Profile. Never prepend tracks merely selected in this tab.
        const serverTracks = getHomeRecentlyPlayed(profile);
        setRecentlyPlayed(serverTracks);
        writeCachedHomeRecentlyPlayed(
          currentUser?.id ?? currentUser?.username,
          serverTracks,
        );

        setRecentError(
          "",
        );
      } catch (error) {
        if (!quiet) {
          setRecentError(
            error instanceof Error
              ? error.message
              : "Unable to load recently played.",
          );
        }
      } finally {
        if (isCurrent()) {
          setRecentLoading(
            false,
          );
        }
      }
    },
    [
      currentUser,
    ],
  );


useEffect(() => {
  // Show only the last Neon-sourced history snapshot while refreshing it.
  // Player selection itself is not a listening event.
  const cached = readCachedHomeRecentlyPlayed(recentOwner);
  setRecentlyPlayed(cached);
}, [recentOwner]);


useEffect(() => {
  void loadRecentlyPlayed();
  return () => { historyRequest.current += 1; };
}, [
  loadRecentlyPlayed,
]);


useEffect(
  () =>
    subscribeListeningHistoryChanged(
      (event) => {
        if (event.detail?.type === "optimistic-play" && event.detail.track) {
          setRecentlyPlayed((current) =>
            applyOptimisticRecentlyPlayed(current, event.detail.track),
          );
          return;
        }
        void loadRecentlyPlayed({ quiet: true });
      },
    ),
  [
    loadRecentlyPlayed,
  ],
);


useQuietRefresh(
  () =>
    loadRecentlyPlayed({
      quiet:
        true,
    }),
  {
    enabled:
      Boolean(
        currentUser,
      ),
    intervalMs:
      30_000,
  },
);

  const playTrack = async (
    trackId,
    track = null,
  ) => {
    if (!trackId) return;

    try {
      await player.playTrack(
  trackId,
  {
    audioUrl:
      track?.audio_url ??
      null,

    artworkUrl:
      resolveArtworkUrl(
        track?.artwork_url,
      ),

    title:
      track?.title ?? "",

    artist:
      track?.artist ?? "",

    album:
      track?.album ?? "",

    mimeType:
      track?.mime_type ??
      null,

    fileSize:
      track?.file_size ??
      null,

    mediaVersion:
      track?.media_version ??
      null,

    genre:
      track?.genre ??
      "",

    releaseYear:
      track?.release_year ??
      null,
  },
);
        } catch (error) {
      setRecentError(
        error instanceof Error
          ? error.message
          : "Playback failed.",
      );
    }
  };

  return (
    <div className="page-stack home-page">

      {/* =====================================================
          HYPERSYNC HERO
          ===================================================== */}

      <section
        className="home-hero-image"
        aria-label="HyperSynced"
      >

        <div className="home-hero-image__status">

          <span>
            <i />

            {currentUser
              ? `SYNCED • ${greetingName}`
              : "GUEST MODE"}
          </span>

          {!currentUser ? (
            <button
              type="button"
              onClick={onOpenAuth}
            >
              Sign in →
            </button>
          ) : null}

        </div>
      </section>


      {/* =====================================================
          RECENTLY PLAYED
          ===================================================== */}

      <section className="home-music-section">

        <SectionHeading
          title="Recently Played"
          onAction={() => {
  if (currentUser) {
    onNavigate(
      "profile",
    );
  } else {
    onOpenAuth();
  }
}}
        />

          {!online && currentUser ? (
  <OfflineNotice
    compact
    title="Go back online to sync Recently Played"
    description="Showing saved history when available. Downloaded music is still available in Library."
  />
) : null}

          {recentlyPlayed.length > 0 ? (
  <div
    className="home-track-grid"
    aria-busy={recentLoading}
  >

    {recentlyPlayed.map(
      (track, index) => (

        <button
          key={track.id}
          type="button"
          className="home-track-card"
          {...trackActionMenu.getTriggerProps(
            track,
          )}
          onMouseEnter={() => {
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
          onClick={() =>
            playTrack(
              track.id,
              track,
            )
          }
        >

          <div className="home-track-card__art">

            {track.artwork_url ? (

              <img
                src={
                  resolveArtworkUrl(
                    track.artwork_url,
                  )
                }
                alt=""
              />

            ) : (

              <div
                className={
                  "home-track-card__fallback " +
                  `home-track-card__fallback--${(index % 4) + 1}`
                }
              >
                H
              </div>

            )}

            <span className="home-track-card__play">
              ▶
            </span>

          </div>

          <div className="home-track-card__info">

            <strong>
              {track.title}
            </strong>

            <small>
              {track.artist}
            </small>

          </div>

        </button>

      ),
    )}
  </div>

) : recentLoading ? (

  <div
    className="home-track-grid home-track-grid--loading"
    aria-label="Loading recently played"
    aria-busy="true"
  >
    {Array.from(
      {
        length:
          6,
      },
      (
        _,
        index,
      ) => (
        <div
          className="home-track-card home-track-card--skeleton"
          key={
            `recent-loading-${index}`
          }
          aria-hidden="true"
        >
          <div className="home-track-card__art home-skeleton-block" />

          <div className="home-track-card__info">
            <span className="home-skeleton-line home-skeleton-line--title" />
            <span className="home-skeleton-line home-skeleton-line--artist" />
          </div>
        </div>
      ),
    )}
  </div>

) : recentError ? (

  <div className="empty-content-card">

    <div>
      <strong>
        Recently played unavailable
      </strong>

      <p>
        {recentError}
      </p>
    </div>

  </div>

) : !currentUser ? (

  <div className="home-empty-state">

    <div className="home-empty-state__icon">
      ♫
    </div>

    <div>
      <strong>
        Sign in to see your rotation
      </strong>

      <p>
        Your listening history will
        appear here after you sign in.
      </p>
    </div>

  </div>

) : (

  <div className="home-empty-state">

    <div className="home-empty-state__icon">
      ♫
    </div>

    <div>
      <strong>
        Your rotation is waiting
      </strong>

      <p>
        Start listening and your
        recently played tracks will
        appear here.
      </p>
    </div>

  </div>

)}
     </section>

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

           </div>
  );
}

export default HomePage;