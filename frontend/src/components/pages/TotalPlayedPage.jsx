import { useEffect, useState } from "react";
import * as player from "../../audioPlayer.js";
import { getMyTotalPlayed } from "../../profileApi.js";
import Icon from "../ui/Icon.jsx";
import TrackArtwork from "../ui/TrackArtwork.jsx";
import OfflineNotice from "../ui/OfflineNotice.jsx";
import useOnlineStatus from "../../hooks/useOnlineStatus.js";
import useTrackActionMenu from "../../hooks/useTrackActionMenu.js";

export default function TotalPlayedPage({ currentUser, onNavigate }) {
  const online = useOnlineStatus();
  const trackActionMenu = useTrackActionMenu();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser || !online) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    async function loadHistory() {
      try {
        const all = [];
        let offset = 0;
        const pageSize = 100;
        do {
          const page = await getMyTotalPlayed({ limit: pageSize, offset });
          if (cancelled) return;
          const batch = Array.isArray(page) ? page : [];
          all.push(...batch);
          setTracks(all.slice());
          if (batch.length < pageSize) break;
          offset += batch.length;
        } while (!cancelled);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load listening history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadHistory();
    return () => { cancelled = true; };
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
    <div className="hs-library-page hs-total-played-route">
      <header className="hs-total-played-header">
        <button type="button" className="hs-search-playlist-back" onClick={() => onNavigate?.("profile")}>
          <Icon name="chevron" size={15} /> Back to Profile
        </button>
        <div className="hs-total-played-heading">
          <span className="hs-eyebrow">ACCOUNT-WIDE LISTENING</span>
          <h1>Total Played</h1>
          <p>Every song you've played on this account, ordered from most recently played to oldest.</p>
          <p className="hs-total-played-countline">{tracks.length.toLocaleString()} songs in history</p>
        </div>
      </header>
      <section className="hs-total-played-list" aria-label="All played songs">
        {!online ? (
          <OfflineNotice compact title="Go online to load Total Played" description="Your full account listening history needs a connection." />
        ) : error ? (
          <div className="hs-empty-card" role="alert">{error}</div>
        ) : tracks.length ? (
          tracks.map((track, index) => (
            <button type="button" key={track.id} className="hs-search-track hs-library-track-row hs-total-played-track"
              {...trackActionMenu.getTriggerProps(track)} onClick={() => play(track)}>
              <span className="hs-total-played-rank">{index + 1}</span>
              <TrackArtwork src={track.artwork_url} alt={track.title} variant={1} />
              <span className="hs-total-played-meta"><strong>{track.title}</strong><small>{track.artist}</small><small>{track.last_played_at ? `Last played ${new Date(track.last_played_at).toLocaleString()}` : ""}</small></span>
              <span className="hs-total-played-count">{Number(track.play_count ?? 0).toLocaleString()} plays</span>
            </button>
          ))
        ) : loading ? (
          <div className="hs-playlist-loading"><span className="hs-playlist-shimmer" /></div>
        ) : (
          <div className="hs-empty-card"><Icon name="music" size={30}/><strong>No listening history yet</strong><p>Once you play songs, your full history will appear here.</p></div>
        )}
      </section>
    </div>
  );
}
