import { useCallback, useEffect, useState } from "react";
import * as player from "../../audioPlayer.js";
import { getMyTotalPlayed } from "../../profileApi.js";
import Icon from "../ui/Icon.jsx";
import TrackArtwork from "../ui/TrackArtwork.jsx";
import OfflineNotice from "../ui/OfflineNotice.jsx";
import useOnlineStatus from "../../hooks/useOnlineStatus.js";
import useTrackActionMenu from "../../hooks/useTrackActionMenu.js";

const PAGE_SIZE = 50;

function formatLastPlayed(value) {
  if (!value) return "Last played date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Last played date unavailable";
  return `Last played ${date.toLocaleString()}`;
}

export default function TotalPlayedPage({ currentUser, onNavigate }) {
  const online = useOnlineStatus();
  const trackActionMenu = useTrackActionMenu();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);

  const loadPage = useCallback(async ({ append = false } = {}) => {
    if (!currentUser || !online) return;
    const requestOffset = append ? offset : 0;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const response = await getMyTotalPlayed({ limit: PAGE_SIZE, offset: requestOffset });
      const batch = Array.isArray(response) ? response : [];
      setTracks((previous) => append ? [...previous, ...batch] : batch);
      setOffset(requestOffset + batch.length);
      setHasMore(batch.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load listening history.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentUser?.id, online, offset]);

  useEffect(() => {
    setTracks([]);
    setOffset(0);
    setHasMore(false);
    if (currentUser && online) void loadPage();
  }, [currentUser?.id, online]);

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
    <div className="page-stack hs-library-page hs-total-played-route">
      <header className="hs-total-played-header">
        <button type="button" className="hs-search-playlist-back" onClick={() => onNavigate?.("profile")}>
          <Icon name="chevron" size={15} /> Back to Profile
        </button>
        <div className="hs-total-played-heading">
          <span className="hs-eyebrow">YOUR LISTENING HISTORY</span>
          <h1>Total Played</h1>
          <p>All the songs you've played on this account, with the most recently played at the top.</p>
          <div className="hs-total-played-summary">
            <strong>{tracks.length.toLocaleString()}</strong>
            <span>{tracks.length === 1 ? "song loaded" : "songs loaded"}{hasMore ? " · more history available" : tracks.length && !loading ? " · complete history" : ""}</span>
          </div>
        </div>
      </header>

      <section className="hs-total-played-list" aria-label="All played songs">
        {!online ? (
          <OfflineNotice compact title="Go online to load Total Played" description="Your complete account listening history requires a connection." />
        ) : error ? (
          <div className="hs-empty-card" role="alert">{error}</div>
        ) : tracks.length ? (
          <>
            <div className="hs-total-played-table-head" aria-hidden="true">
              <span>TRACK</span><span>LAST PLAYED</span><span>PLAY COUNT</span>
            </div>
            <div className="hs-total-played-rows">
              {tracks.map((track) => (
                <button type="button" key={track.id} className="hs-total-played-track"
                  {...trackActionMenu.getTriggerProps(track)} onClick={() => play(track)}>
                  <TrackArtwork src={track.artwork_url} alt={track.title} variant={1} />
                  <span className="hs-total-played-meta">
                    <strong>{track.title}</strong>
                    <small>{track.artist}</small>
                  </span>
                  <span className="hs-total-played-last">{formatLastPlayed(track.last_played_at)}</span>
                  <span className="hs-total-played-count">{Number(track.play_count ?? 0).toLocaleString()}</span>
                </button>
              ))}
            </div>
            {hasMore ? (
              <div className="hs-total-played-load-more">
                <button type="button" className="hs-search-primary-action" disabled={loadingMore} onClick={() => void loadPage({ append: true })}>
                  {loadingMore ? "Loading history…" : `Load more songs · ${tracks.length.toLocaleString()} loaded`}
                </button>
              </div>
            ) : null}
          </>
        ) : loading ? (
          <div className="hs-playlist-loading"><span className="hs-playlist-shimmer" /></div>
        ) : (
          <div className="hs-empty-card"><Icon name="music" size={30}/><strong>No listening history yet</strong><p>Once you play songs, your complete account history will appear here.</p></div>
        )}
      </section>
    </div>
  );
}
