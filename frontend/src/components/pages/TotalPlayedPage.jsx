import { useCallback, useEffect, useRef, useState } from "react";
import * as player from "../../audioPlayer.js";
import { getMyTotalPlayed } from "../../profileApi.js";
import Icon from "../ui/Icon.jsx";
import TrackArtwork from "../ui/TrackArtwork.jsx";
import OfflineNotice from "../ui/OfflineNotice.jsx";
import TrackActionMenu from "../music/TrackActionMenu.jsx";
import useOnlineStatus from "../../hooks/useOnlineStatus.js";
import useTrackActionMenu from "../../hooks/useTrackActionMenu.js";

const PAGE_SIZE = 50;

function formatLastPlayed(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

export default function TotalPlayedPage({ currentUser, onNavigate, onRequireAuth }) {
  const online = useOnlineStatus();
  const trackActionMenu = useTrackActionMenu();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const offsetRef = useRef(0);
  const requestRef = useRef(0);
  const appendInFlightRef = useRef(false);

  const loadPage = useCallback(async ({ append = false } = {}) =>    {
    if (!currentUser || !online || (append && appendInFlightRef.current)) return;
    const requestId = requestRef.current;
    const requestOffset = append ? offsetRef.current : 0;
    if (append) {
      appendInFlightRef.current = true;
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const response = await getMyTotalPlayed({ limit: PAGE_SIZE, offset: requestOffset });
      if (requestId !== requestRef.current) return;
      const batch = Array.isArray(response) ? response : [];
      setTracks((previous) => append ? [...previous, ...batch] : batch);
      offsetRef.current = requestOffset + batch.length;
      setHasMore(batch.length === PAGE_SIZE);
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(err instanceof Error ? err.message : "Unable to load listening history.");
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
        appendInFlightRef.current = false;
      }
    }
  }, [currentUser?.id, online]);

  useEffect(() => {
    requestRef.current += 1;
    offsetRef.current = 0;
    appendInFlightRef.current = false;
    setTracks([]);
    setLoading(false);
    setLoadingMore(false);
    setHasMore(false);
    setError("");
    if (currentUser && online) void loadPage();
    return () => {
      requestRef.current += 1;
    };
  }, [currentUser?.id, online, loadPage]);

  const play = (track) => player.playTrack(track.id, {
    audioUrl: track.audio_url,
    artworkUrl: track.artwork_url,
    title: track.title,
    artist: track.artist,
    mimeType: track.mime_type,
    fileSize: track.file_size,
    mediaVersion: track.media_version,
    genre: track.genre ?? "",
    releaseYear: track.release_year ?? null,
  }).catch(() => {});

  return (
    <div className="page-stack hs-search-page hs-library-page hs-total-played-route">
      <header className="hs-total-played-header">
        <div className="hs-search-playlist-view__nav">
          <button type="button" className="hs-search-playlist-back" onClick={() => onNavigate?.("profile")}>
            <Icon name="chevron" size={15} /> Back to Profile
          </button>
        </div>
        <section className="hs-search-playlist-view__hero hs-total-played-hero">
          <div className="hs-search-playlist-view__copy hs-total-played-heading">
            <span>YOUR LISTENING HISTORY</span>
            <h2>Total Played</h2>
            <p>All the songs you've played on this account, with the most recently played at the top.</p>
            <small className="hs-total-played-summary">
              <strong>{tracks.length.toLocaleString()}</strong>
              {tracks.length === 1 ? " song loaded" : " songs loaded"}{hasMore ? " · more history available" : tracks.length && !loading ? " · end of history" : ""}
            </small>
          </div>
        </section>
      </header>

      <section className="hs-total-played-list" aria-label="All played songs">
        {!online ? (
          <OfflineNotice compact title="Go online to load Total Played" description="Your account listening history needs an internet connection." />
        ) : error ? (
          <div className="hs-empty-card" role="alert">{error}</div>
        ) : tracks.length ? (
          <>
            <div className="hs-total-played-table-head" aria-hidden="true">
              <span>TRACK</span><span>LAST PLAYED</span><span>PLAYS</span>
            </div>
            <div className="hs-total-played-rows">
              {tracks.map((track, index) => (
                <button type="button" key={track.id} className="hs-search-track hs-library-track-row hs-total-played-track"
                  {...trackActionMenu.getTriggerProps(track)} onClick={() => play(track)}>
                  <span className="hs-search-track__rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="hs-search-track__art">
                    <TrackArtwork src={track.artwork_url} alt={track.title} variant={1} />
                    <i aria-hidden="true"><Icon name="play" size={15} /></i>
                  </span>
                  <span className="hs-search-track__copy">
                    <strong>{track.title}</strong>
                    <small>{track.artist || "Unknown Artist"}{track.album ? ` • ${track.album}` : ""}</small>
                  </span>
                  <span className="hs-total-played-last">{formatLastPlayed(track.last_played_at)}</span>
                  <span className="hs-total-played-count">{Number(track.play_count ?? 0).toLocaleString()}</span>
                  <span className="hs-search-track__play" aria-hidden="true"><Icon name="play" size={14} /></span>
                </button>
              ))}
            </div>
            {hasMore ? (
              <div className="hs-total-played-load-more">
                <button type="button" className="hs-search-primary-action" disabled={loadingMore} onClick={() => void loadPage({ append: true })}>
                  {loadingMore ? "Loading…" : `Load more · ${tracks.length.toLocaleString()} songs`}
                </button>
              </div>
            ) : null}
          </>
        ) : loading ? (
          <div className="hs-playlist-loading"><span className="hs-playlist-shimmer" /></div>
        ) : (
          <div className="hs-empty-card"><Icon name="music" size={30}/><strong>No listening history yet</strong><p>When you play songs, your account history will show up here, newest first.</p></div>
        )}
      </section>
      <TrackActionMenu menu={trackActionMenu.menu} onClose={trackActionMenu.closeMenu} currentUser={currentUser} onRequireAuth={onRequireAuth} />
    </div>
  );
}
