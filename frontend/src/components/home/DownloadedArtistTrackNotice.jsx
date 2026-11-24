import { useState } from "react";
import { resolveArtworkUrl } from "../../artworkUrl.js";
import Icon from "../ui/Icon.jsx";

export default function DownloadedArtistTrackNotice({ track, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  if (!track) return null;
  const artwork = resolveArtworkUrl(track.artwork_url ?? track.artworkUrl);
  return (
    <section className="home-downloaded-artist-notice" aria-label="New song from a downloaded artist">
      <button type="button" className="home-downloaded-artist-notice__summary" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {artwork ? <img src={artwork} alt="" /> : <span className="home-downloaded-artist-notice__art"><Icon name="music" size={18} /></span>}
        <span className="home-downloaded-artist-notice__copy">
          <strong>🎵 New song from an artist you downloaded</strong>
          <small>{track.title || "New track"} · {track.artist || "Unknown artist"}</small>
          <small>Tap to see song details</small>
        </span>
        <span className="home-downloaded-artist-notice__expand">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <div className="home-downloaded-artist-notice__details">
          <strong>{track.title || "Untitled track"}</strong>
          <span>{track.artist || "Unknown artist"}</span>
          {track.album ? <span>Album: {track.album}</span> : null}
          {track.genre ? <span>Genre: {track.genre}</span> : null}
          {track.release_year ? <span>Year: {track.release_year}</span> : null}
          <button type="button" onClick={onDismiss}>Dismiss</button>
        </div>
      ) : null}
    </section>
  );
}
