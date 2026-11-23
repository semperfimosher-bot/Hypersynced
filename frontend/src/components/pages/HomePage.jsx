import {
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";

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

import {
  readCachedHomeSuggestions,
  writeCachedHomeSuggestions,
} from "../../homeSuggestions.js";

import {
  getSuggestedMusic,
} from "../../profileApi.js";

import {
  getHomeRecentlyPlayedForOwner,
  applyOptimisticRecentlyPlayed,
  readCachedHomeRecentlyPlayed,
  writeCachedHomeRecentlyPlayed,
  subscribeListeningHistoryChanged,
} from "../../homeRecentlyPlayed.js";

function HomePage({
  currentUser,
  onNavigate,
  onOpenAuth,
}) {
  const trackActionMenu =
    useTrackActionMenu();

  const greetingName =
    getGreetingName(currentUser);

  const recentOwner = currentUser?.id ?? currentUser?.username ?? "guest-device";
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
        ? nextTracks(current.owner === recentOwner ? current.tracks : readCachedHomeRecentlyPlayed(recentOwner))
        : nextTracks,
    }));
  };
  const [suggestionsState, setSuggestionsState] = useState(() => ({
    owner: recentOwner, tracks: readCachedHomeSuggestions(recentOwner),
  }));
  const suggestedTracks = suggestionsState.owner === recentOwner
    ? suggestionsState.tracks : readCachedHomeSuggestions(recentOwner);
  const [suggestionsLoading, setSuggestionsLoading] = useState(suggestedTracks.length === 0);
  const [suggestionsError, setSuggestionsError] = useState("");
  const suggestionsRequestRef = useRef(0);
  const recentContextKey = recentlyPlayed.map((track) => String(track.id)).join("|");

  useEffect(() => {
    setRecentlyPlayed(readCachedHomeRecentlyPlayed(recentOwner));
  }, [recentOwner]);

  // Local history supplies context to the recommendation engine.
  useEffect(() => {
    return subscribeListeningHistoryChanged((event) => {
      const detail = event?.detail ?? {};
      if (detail.owner && String(detail.owner) !== String(recentOwner ?? "")) return;
      if (detail.type === "optimistic-play" && detail.track?.id) {
        const cached = readCachedHomeRecentlyPlayed(recentOwner);
        const instant = applyOptimisticRecentlyPlayed(cached, detail.track, 12, { incrementPlayCount: false });
        writeCachedHomeRecentlyPlayed(recentOwner, instant);
        setRecentlyPlayed(instant);
        return;
      }
      setRecentlyPlayed(readCachedHomeRecentlyPlayed(recentOwner));
    });
  }, [recentOwner]);

  const loadSuggestions = useCallback(async () => {
    const requestId = ++suggestionsRequestRef.current;
    const cached = readCachedHomeSuggestions(recentOwner);
    setSuggestionsState({ owner: recentOwner, tracks: cached });
    setSuggestionsLoading(cached.length === 0);
    setSuggestionsError("");
    const contextTrackIds = recentContextKey.split("|").filter(Boolean).slice(0, 12);
    try {
      const response = await getSuggestedMusic({
        currentTrackId: contextTrackIds[0] ?? null,
        excludeTrackIds: contextTrackIds,
        contextTrackIds,
        limit: 12,
      });
      if (requestId !== suggestionsRequestRef.current) return;
      const tracks = Array.isArray(response) ? response : [];
      writeCachedHomeSuggestions(recentOwner, tracks);
      setSuggestionsState({ owner: recentOwner, tracks });
    } catch (error) {
      if (requestId === suggestionsRequestRef.current && !cached.length) setSuggestionsError(error instanceof Error ? error.message : "Suggestions are temporarily unavailable.");
    } finally {
      if (requestId === suggestionsRequestRef.current) setSuggestionsLoading(false);
    }
  }, [recentOwner, recentContextKey]);

  useEffect(() => {
    void loadSuggestions();
    return () => { suggestionsRequestRef.current += 1; };
  }, [loadSuggestions]);

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
      setSuggestionsError(
        error instanceof Error ? error.message : "Playback failed.",
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
          SUGGESTED MUSIC
          ===================================================== */}

      <section className="home-music-section">
        <SectionHeading title="Suggested Music" actionLabel="Explore" onAction={() => onNavigate?.("search")} />
        {suggestedTracks.length > 0 ? (
          <div className="home-track-grid" aria-busy={suggestionsLoading}>
            {suggestedTracks.map((track, index) => (
              <button key={track.id} type="button" className="home-track-card"
                {...trackActionMenu.getTriggerProps(track)}
                onMouseEnter={() => void player.warmTrackForPlayback(track.id, track)}
                onFocus={() => void player.warmTrackForPlayback(track.id, track)}
                onClick={() => playTrack(track.id, track)}>
                <div className="home-track-card__art">
                  {track.artwork_url ? <img src={resolveArtworkUrl(track.artwork_url)} alt="" /> :
                    <div className={"home-track-card__fallback " + `home-track-card__fallback--${(index % 4) + 1}`}>H</div>}
                  <span className="home-track-card__play">▶</span>
                </div>
                <div className="home-track-card__info"><strong>{track.title}</strong><small>{track.artist}</small></div>
              </button>
            ))}
          </div>
        ) : suggestionsLoading ? (
          <div className="home-track-grid home-track-grid--loading" aria-label="Loading suggested music" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="home-track-card home-track-card--skeleton" key={`suggestion-loading-${index}`} aria-hidden="true">
                <div className="home-track-card__art home-skeleton-block" />
                <div className="home-track-card__info"><span className="home-skeleton-line home-skeleton-line--title" /><span className="home-skeleton-line home-skeleton-line--artist" /></div>
              </div>
            ))}
          </div>
        ) : suggestionsError ? (
          <div className="empty-content-card"><div><strong>Suggested music unavailable</strong><p>{suggestionsError}</p></div></div>
        ) : (
          <div className="home-empty-state"><div className="home-empty-state__icon">♫</div><div><strong>Suggestions are warming up</strong><p>Play a few songs to help HyperSynced build a mix that fits your listening.</p></div></div>
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