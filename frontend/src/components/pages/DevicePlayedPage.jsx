import { useEffect, useState } from "react";
import * as player from "../../audioPlayer.js";
import { readDevicePlayedHistory, readDeviceListeningStats, DEVICE_PLAYED_HISTORY_CHANGED_EVENT } from "../../deviceListeningStats.js";
import Icon from "../ui/Icon.jsx";
import PlayingIndicator from "../ui/PlayingIndicator.jsx";
import TrackArtwork from "../ui/TrackArtwork.jsx";
import TrackActionMenu from "../music/TrackActionMenu.jsx";
import useTrackActionMenu from "../../hooks/useTrackActionMenu.js";

function formatLastPlayed(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

export default function DevicePlayedPage({ currentUser }) {
  const owner = currentUser?.id ?? currentUser?.username ?? null;
  const [tracks, setTracks] = useState(() => readDevicePlayedHistory(owner));
  const trackActionMenu = useTrackActionMenu();
  const [currentTrackId, setCurrentTrackId] = useState(() => player.getState()?.trackId ? String(player.getState().trackId) : null);
  const [currentTrackIsPlaying, setCurrentTrackIsPlaying] = useState(() => Boolean(player.getState()?.trackId && !player.getState()?.paused));

  useEffect(() => {
    setTracks(readDevicePlayedHistory(owner));
    const refresh = () => setTracks(readDevicePlayedHistory(owner));
    window.addEventListener(DEVICE_PLAYED_HISTORY_CHANGED_EVENT, refresh);
    const onStorage = (event) => {
      if (event?.key && event.key.startsWith("hypersynced:device-played-history:v1:")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DEVICE_PLAYED_HISTORY_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [owner]);

  useEffect(() => player.subscribe((state) => {
    setCurrentTrackId(state?.trackId ? String(state.trackId) : null);
    setCurrentTrackIsPlaying(Boolean(state?.trackId && !state?.paused));
  }), []);

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

  const totalPlays = readDeviceListeningStats(owner).tracksPlayed;

  return (
    <div className="page-stack hs-search-page hs-library-page hs-total-played-route hs-device-played-route">
      <header className="hs-total-played-header">
        <section className="hs-search-playlist-view__hero hs-total-played-hero">
          <div className="hs-search-playlist-view__copy hs-total-played-heading">
            <span>THIS DEVICE'S LISTENING HISTORY</span>
            <h2>Per Device Played</h2>
            <p>Only songs played on this device, newest first. This history is stored locally on this device.</p>
            <small className="hs-total-played-summary">
              <strong>{tracks.length.toLocaleString()}</strong>{tracks.length === 1 ? " song stored" : " songs stored"} · <strong>{totalPlays.toLocaleString()}</strong>{totalPlays === 1 ? " play" : " plays"}
            </small>
          </div>
        </section>
      </header>

      <section className="hs-total-played-list" aria-label="This device's played songs">
        {tracks.length ? (
          <>
            <div className="hs-total-played-table-head" aria-hidden="true">
              <span>TRACK</span><span>LAST PLAYED</span><span>PLAYS</span>
            </div>
            <div className="hs-total-played-rows">
              {tracks.map((track, index) => (
                <button type="button" key={track.id} className={["hs-search-track", "hs-library-track-row", "hs-total-played-track", String(track.id) === currentTrackId ? "is-current-track" : "", String(track.id) === currentTrackId && currentTrackIsPlaying ? "is-playing-track" : ""].filter(Boolean).join(" ")}
                  {...trackActionMenu.getTriggerProps(track)} onClick={() => play(track)}>
                  <span className="hs-search-track__rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="hs-search-track__art">
                    <TrackArtwork src={track.artwork_url} alt={track.title} variant={1} />
                    <i aria-hidden="true"><Icon name="play" size={15} /></i>
                  </span>
                  <span className="hs-search-track__copy">
                    <strong>{track.title || "Unknown Track"}</strong>
                    <small>{track.artist || "Unknown Artist"}{track.album ? ` • ${track.album}` : ""}</small>
                  </span>
                  <span className="hs-total-played-last">{formatLastPlayed(track.last_played_at)}</span>
                  <span className="hs-total-played-count">{Number(track.play_count ?? 0).toLocaleString()}</span>
                  <span className="hs-search-track__play" aria-hidden="true">{String(track.id) === currentTrackId && currentTrackIsPlaying ? <PlayingIndicator /> : null}<Icon name="play" size={14} /></span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="hs-empty-card"><Icon name="music" size={30}/><strong>No songs played on this device yet</strong><p>Start playing music here and this device-only history will update immediately.</p></div>
        )}
      </section>
      <TrackActionMenu menu={trackActionMenu.menu} onClose={trackActionMenu.closeMenu} currentUser={currentUser} />
    </div>
  );
}
