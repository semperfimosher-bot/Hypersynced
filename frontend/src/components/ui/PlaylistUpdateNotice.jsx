import { useState } from "react";
import Icon from "./Icon.jsx";

function PlaylistUpdateNotice({ update, variant = "mobile", onDownload, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  if (!update) return null;
  const tracks = Array.isArray(update.missingTracks) ? update.missingTracks : [];
  const firstTrack = tracks[0] ?? null;
  const count = tracks.length;
  const busy = update.status === "downloading";
  const progress = Math.round(Math.max(0, Math.min(1, Number(update.progress ?? 0))) * 100);
  return (
    <aside className={"playlist-update-notice playlist-update-notice--" + variant} role="status" aria-live="polite">
      <span className="playlist-update-notice__icon"><Icon name="download" size={16} /></span>
      <span className="playlist-update-notice__copy">
        <strong>{count} {count === 1 ? "new song" : "new songs"}</strong>
        <small>{update.playlist?.title ?? "Generated playlist"}</small>
        {firstTrack ? <button type="button" className="playlist-update-notice__song" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{firstTrack.title || "View new song details"} · {firstTrack.artist || "Unknown artist"}</button> : null}
      </span>
      {expanded && firstTrack ? <span className="playlist-update-notice__track-detail"><strong>{firstTrack.title || "New song"}</strong><small>{firstTrack.artist || "Unknown artist"}{firstTrack.album ? " · " + firstTrack.album : ""}</small>{firstTrack.genre ? <small>Genre: {firstTrack.genre}</small> : null}{firstTrack.release_year ? <small>Released: {firstTrack.release_year}</small> : null}</span> : null}
      <button type="button" className="playlist-update-notice__download" disabled={busy} onClick={onDownload}>{busy ? progress + "%" : "Download"}</button>
      <button type="button" className="playlist-update-notice__dismiss" aria-label="Dismiss playlist update" disabled={busy} onClick={onDismiss}><Icon name="close" size={13} /></button>
    </aside>
  );
}
export default PlaylistUpdateNotice;
