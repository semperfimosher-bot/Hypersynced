import React from "react";
import Icon from "../ui/Icon.jsx";
import { resolveArtworkUrl } from "../../artworkUrl.js";
import SearchArtworkImage from "../search/SearchArtworkImage.jsx";\nimport ArtistPortraitImage from "../search/ArtistPortraitImage.jsx";

const PICKS = [
  ["Search music", "Find your next track", "search", "search"],
  ["Your library", "Saved music and playlists", "library", "library"],
  ["Recently played", "Pick up where you left off", "playlist", "recent"],
  ["Artists", "Discover artists", "people", "search"],
  ["Your profile", "Your listening profile", "profile", "profile"],
  ["Messages", "Listen with friends", "mail", "messages"],
];

export function QuickPickGrid({ onNavigate, onRecent }) {
  return (
    <section className="home-quick-picks" aria-label="Quick picks">
      <div className="home-feed-heading"><div><span>YOUR MUSIC</span><h2>Quick picks</h2></div></div>
      <div className="home-quick-picks__grid">
        {PICKS.map(([title, detail, icon, page]) => (
          <button key={title} type="button" className="home-quick-pick" onClick={() => page === "recent" ? onRecent?.() : onNavigate?.(page)}>
            <span className="home-quick-pick__icon"><Icon name={icon} size={18} /></span>
            <span className="home-quick-pick__copy"><strong>{title}</strong><small>{detail}</small></span>
            <span className="home-quick-pick__arrow">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function QuickPicks({ tracks, onPlay, onWarm, getMenuProps, onPlayNext, onNavigate, onRecent }) {
  const visibleTracks = Array.isArray(tracks) ? tracks.slice(0, 6) : [];
  if (!visibleTracks.length) return (
    <section className="home-quick-picks" aria-label="Quick picks">
      <div className="home-feed-heading"><div><span>READY TO PLAY</span><h2>Quick picks</h2></div></div>
      <div className="home-quick-picks__grid" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="home-track-tile home-track-tile--loading" aria-hidden="true"><span className="home-track-tile__cover"><span className="home-track-tile__placeholder">♫</span></span><span className="home-track-tile__copy"><strong>Finding music…</strong><small>Unplayed tracks</small></span></div>)}
      </div>
    </section>
  );
  return (
    <section className="home-quick-picks" aria-label="Quick picks">
      <div className="home-feed-heading"><div><span>READY TO PLAY</span><h2>Quick picks</h2></div></div>
      <div className="home-quick-picks__grid">
        {visibleTracks.map((track) => <TrackTile key={track.id} track={track} onPlay={onPlay} onWarm={onWarm} menuProps={getMenuProps?.(track)} simple />)}
      </div>
    </section>
  );
}

export function TrackRow({ title, eyebrow, tracks, onPlay, onWarm, getMenuProps, onPlayNext }) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  return (
    <section className="home-feed-row" aria-label={title}>
      <div className="home-feed-heading"><div><span>{eyebrow}</span><h2>{title}</h2></div></div>
      <div className="home-horizontal-scroll home-scroll-fade">
        {tracks.map((track) => <TrackTile key={track.id} track={track} onPlay={onPlay} onWarm={onWarm} onPlayNext={onPlayNext} menuProps={getMenuProps?.(track)} />)}
      </div>
    </section>
  );
}

export function MoodFilterBar({ activeMood, onChange }) {
  return <nav className="home-mood-filter" aria-label="Mood filters">{["All", "Chill", "Workout", "Focus"].map((m) => <button key={m} type="button" aria-pressed={activeMood === m} className={activeMood === m ? "is-active" : ""} onClick={() => onChange(m)}>{m}</button>)}</nav>;
}

export function TrackTile({ track, onPlay, onWarm, menuProps, onPlayNext, simple = false }) {
  const art = resolveArtworkUrl(track.artwork_url ?? track.artworkUrl);
  const button = (
    <button type="button" className="home-track-tile" {...menuProps} onMouseDown={() => onWarm?.(track)} onMouseEnter={() => onWarm?.(track)} onFocus={() => onWarm?.(track)} onClick={() => onPlay?.(track)} aria-label={`Play ${track.title || "track"}`}>
      <span className="home-track-tile__cover">{art ? <img src={art} alt="" loading="lazy" decoding="async" fetchPriority="auto" /> : <span className="home-track-tile__placeholder">♫</span>}<span className="home-track-tile__play">▶</span></span>
      <span className="home-track-tile__copy"><strong>{track.title || "Untitled track"}</strong><small>{track.artist || "Unknown artist"}</small></span>{simple ? <span className="home-track-tile__sparkles" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i></span> : null}
    </button>
  );
  if (simple) return button;
  return (
    <div className="home-track-tile-wrap">
      <button type="button" className="home-track-tile__next" onClick={() => onPlayNext?.(track)} aria-label={`Add ${track.title || "track"} to Play Next`}>＋<span>Play Next</span></button>
      {button}
    </div>
  );
}
export function ArtistRow({ tracks, fallbackTracks = [], onNavigate, onOpenArtist }) {
  const artists = [];
  const seen = new Set();
  const artistTrackPool = [...(tracks ?? []), ...(fallbackTracks ?? [])];
  for (const track of artistTrackPool) {
    const name = String(track?.artist ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    artists.push({ name, art: resolveArtworkUrl(track.artist_artwork_url ?? track.artist_image_url ?? track.artist_profile_image_url ?? track.artist_photo_url) });
    if (artists.length >= 8) break;
  }
  if (!artists.length) return (
    <section className="home-feed-row" aria-label="Artists to explore">
      <div className="home-feed-heading"><div><span>DISCOVER SOMETHING NEW</span><h2>Artists to explore</h2></div></div>
      <div className="home-artist-scroll home-scroll-fade">
        {["Find artists", "Explore genres", "New sounds", "Browse music"].map((label) => <button key={label} type="button" className="home-artist-chip home-artist-chip--empty" onClick={() => onNavigate?.("search")}><span className="home-artist-chip__avatar">♫</span><strong>{label}</strong><small>Explore</small></button>)}
      </div>
    </section>
  );
  return (
    <section className="home-feed-row">
      <div className="home-feed-heading"><div><span>FROM YOUR MUSIC</span><h2>Artists to explore</h2></div></div>
      <div className="home-artist-scroll home-scroll-fade">
        {artists.map((artist) => <button key={artist.name} type="button" className="home-artist-chip" onClick={() => onOpenArtist ? onOpenArtist(artist.name) : onNavigate?.("search")}><span className="home-artist-chip__avatar">{artist.art ? <ArtistPortraitImage artistName={artist.name} src={artist.art} alt="" loading="eager" fetchPriority="high" /> : "♫"}</span><strong>{artist.name}</strong><small>Artist</small></button>)}
      </div>
    </section>
  );
}

export function MoodCards({ tracks, onChange, activeMood = "All" }) {
  const cards = [
    ["Chill", "Slow down and settle in", tracks?.[0]?.artwork_url, "chill"],
    ["Workout", "Keep your energy moving", tracks?.[2]?.artwork_url || tracks?.[0]?.artwork_url, "workout"],
    ["Focus", "Find your flow", tracks?.[4]?.artwork_url || tracks?.[0]?.artwork_url, "focus"],
  ];
  return (
    <section className="home-feed-row">
      <div className="home-feed-heading"><div><span>SET THE MOOD</span><h2>Made for the moment</h2></div></div>
      <div className="home-mood-cards">
        {cards.map(([name, subtitle, artwork, mood]) => <button key={name} type="button" className={`home-mood-card home-mood-card--${mood} ${activeMood === name ? "is-active" : ""}`} aria-pressed={activeMood === name} onClick={() => onChange(mood)}>{artwork ? <img src={resolveArtworkUrl(artwork)} alt="" loading="lazy" /> : null}<span className="home-mood-card__overlay" /><span className="home-mood-card__copy"><strong>{name}</strong><small>{subtitle}</small></span></button>)}
      </div>
    </section>
  );
}
