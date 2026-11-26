import { useCallback, useEffect, useRef, useState } from "react";
import { resolveArtworkUrl } from "../../artworkUrl.js";
import * as player from "../../audioPlayer.js";
import TrackActionMenu from "../music/TrackActionMenu.jsx";
import useTrackActionMenu from "../../hooks/useTrackActionMenu.js";
import { readCachedHomeSuggestions, writeCachedHomeSuggestions } from "../../homeSuggestions.js";
import { warmTrackArtwork } from "../../artworkWarmCache.js";
import { getSuggestedMusic } from "../../profileApi.js";
import {
  getHomeRecentlyPlayedForOwner,
  applyOptimisticRecentlyPlayed,
  readCachedHomeRecentlyPlayed,
  writeCachedHomeRecentlyPlayed,
  subscribeListeningHistoryChanged,
} from "../../homeRecentlyPlayed.js";
import { TrackRow, QuickPicks, ArtistRow } from "../home/HomeFeedSections.jsx";
import { readCachedHomeRecentlyAdded, refreshHomeRecentlyAdded } from "../../homeRecentlyAdded.js";
import DownloadedArtistTrackNotice from "../home/DownloadedArtistTrackNotice.jsx";

function normalizedArtistKey(value) {
  return String(value ?? "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function trackMatchesDownloadedArtist(track, artistNames) {
  const artistText = String(track?.artist ?? "");
  const candidates = [artistText, ...artistText.split(/[,;&]|\b(?:feat(?:uring)?|ft|with|and)\b/gi)];
  return candidates.some((candidate) => artistNames.has(normalizedArtistKey(candidate)));
}

const MEMBER_SLIDE_LABELS = ["On Repeat", "Find Your Next Favorite", "Your Music Vault", "Made for Your Mood"];

function HomeCarousel({ recent, suggestions, fallbackTracks = [], pickedTracks, onNavigate, guest, onOpenAuth, onPlay, onPlayPicked, onOpenArtist }) {
  const slideLabels = guest ? ["Welcome", "Discover Your Sound", "Artists in Your Orbit", "Made for Your Mood"] : MEMBER_SLIDE_LABELS;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const touchStartX = useRef(null);

  useEffect(() => {
    if (paused) return undefined;
    timer.current = window.setInterval(() => setActive((current) => (current + 1) % slideLabels.length), 5000);
    return () => window.clearInterval(timer.current);
  }, [paused, slideLabels.length]);

  const moveTo = (index) => {
    setActive((index + slideLabels.length) % slideLabels.length);
    setPaused(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPaused(false), 10000);
  };
  const memberSlideTracks = [
    recent[0] ?? suggestions[0] ?? fallbackTracks[0],
    suggestions[0] ?? fallbackTracks[0] ?? recent[0],
    recent[1] ?? suggestions[1] ?? fallbackTracks[1] ?? recent[0],
    suggestions[4] ?? suggestions[0] ?? fallbackTracks[2] ?? recent[0],
  ];
  const slideTracks = guest ? [
    null,
    suggestions[0] ?? fallbackTracks[0] ?? recent[0],
    suggestions[2] ?? fallbackTracks[1] ?? recent[1] ?? suggestions[0],
    suggestions[4] ?? suggestions[0] ?? fallbackTracks[2] ?? fallbackTracks[0],
  ] : memberSlideTracks;
  const contentIndex = active;
  const firstRecent = recent[0];
  const coverFor = (index) => resolveArtworkUrl(slideTracks[index]?.artwork_url);
  const activeTrack = slideTracks[active];
  const moodTracks = pickedTracks?.length ? pickedTracks : suggestions.length ? suggestions : fallbackTracks;
  const artworkForSlide = (index) => {
    if (guest && index === 0) return [];
    const candidates = [
      slideTracks[index],
      recent[index % Math.max(1, recent.length)] ?? suggestions[index + 1],
      fallbackTracks[index] ?? suggestions[index + 2],
      ...fallbackTracks,
    ];
    return candidates.filter((track, candidateIndex, all) =>
      track?.artwork_url && all.findIndex((candidate) =>
        candidate?.id && String(candidate.id) === String(track.id)
      ) === candidateIndex
    ).slice(0, 3);
  };

  return (
    <section className="home-carousel" aria-label="Featured home slides" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <div className="home-carousel__viewport" onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const startX = touchStartX.current; const endX = event.changedTouches[0]?.clientX; touchStartX.current = null; if (startX == null || endX == null) return; const delta = endX - startX; if (Math.abs(delta) < 45) return; moveTo(active + (delta < 0 ? 1 : -1)); }}>
        {slideLabels.map((label, index) => (
          <article key={label} className={`home-carousel__slide ${guest && index === 0 ? "home-carousel__slide--guest-welcome" : ""} ${index === active ? "is-active" : ""}`} aria-hidden={index !== active}>
            <div className="home-carousel__art" style={guest && index === 0 ? { backgroundImage: "url(/hypersync-home-hero.png)" } : coverFor(index) ? { backgroundImage: `url("${coverFor(index)}")` } : undefined} />
            <div className="home-carousel__artwork" aria-hidden="true">
              {artworkForSlide(index).map((track, artworkIndex) => <img key={String(track.id)} className={`home-carousel__artwork-cover home-carousel__artwork-cover--${artworkIndex + 1}`} src={resolveArtworkUrl(track.artwork_url)} alt="" loading="eager" decoding="async" fetchPriority={index === active ? "high" : "auto"} />)}
            </div>
            <div className={`home-carousel__content ${guest && index === 0 ? "home-carousel__content--guest-image-only" : ""}`}>
              <span className="home-carousel__eyebrow">{guest && index === 0 ? "WELCOME TO HYPERSYNCED" : contentIndex === 0 ? "BACK IN THE GROOVE" : contentIndex === 1 ? "FRESH FINDS" : contentIndex === 2 ? (guest ? "ARTISTS IN YOUR ORBIT" : "YOUR MUSIC, YOUR RULES") : "TUNED TO YOU"}</span>
              <h2>{guest && index === 0 ? "Welcome to HyperSynced" : contentIndex === 0 ? "Pick up where you left off" : contentIndex === 1 ? "Find Your Next Favorite" : contentIndex === 2 ? (guest ? "Artists in Your Orbit" : "Your Music Vault") : "Made for Your Mood"}</h2>
              <p>{guest && index === 0 ? "Discover music, find your favorites, and make HyperSynced your own." : contentIndex === 0 ? "Jump back into the tracks you can’t stop playing." : contentIndex === 1 ? "Fresh tracks that might become your new favorites." : contentIndex === 2 ? (guest ? "Meet artists that match the sound you love." : "All your saved tracks, albums, and playlists—together.") : "Mixes shaped around your sound, your habits, and your vibe."}</p>
              {activeTrack && !(guest && index === 0) ? <div className="home-carousel__track-meta"><button type="button" className="home-carousel__track-title" onClick={() => onPlay?.(activeTrack)}>{activeTrack.title || "Featured track"}</button><button type="button" onClick={() => onOpenArtist?.(activeTrack.artist)}>{activeTrack.artist || "Unknown artist"}</button></div> : null}
              <button className="home-carousel__action" type="button" onClick={() => guest && index === 0 ? onOpenAuth?.() : contentIndex === 0 ? (activeTrack ? onPlay(activeTrack) : onOpenAuth?.()) : contentIndex === 1 ? (activeTrack ? onPlay(activeTrack) : onNavigate?.("search")) : contentIndex === 2 ? (guest ? (activeTrack ? onOpenArtist?.(activeTrack.artist) : onNavigate?.("search")) : onNavigate?.("library")) : (moodTracks?.length ? onPlayPicked?.(moodTracks) : onNavigate?.("search"))}>{guest && index === 0 ? "Get started" : contentIndex === 0 ? (activeTrack ? (firstRecent ? "Recently played" : "Play a song") : "Get started") : contentIndex === 1 ? (activeTrack ? "Play this discovery" : "Explore music") : contentIndex === 2 ? (guest ? (activeTrack ? "Explore this artist" : "Meet artists") : "Open your library") : "Find your mix"} <span>▶</span></button>
            </div>
          </article>
        ))}
      </div>
      <div className="home-carousel__controls" aria-label="Slide controls">{slideLabels.map((label, index) => <button key={label} type="button" aria-label={`Show slide ${index + 1}: ${label}`} aria-current={active === index ? "true" : undefined} className={active === index ? "is-active" : ""} onClick={() => moveTo(index)} />)}</div>
    </section>
  );
}

function HomePage({ currentUser, onNavigate, onOpenAuth, onOpenArtist }) {
  const menu = useTrackActionMenu();
  const recentOwner = currentUser?.id ?? currentUser?.username ?? "guest-device";
  const [recentlyPlayedState, setRecentlyPlayedState] = useState(() => ({ owner: recentOwner, tracks: readCachedHomeRecentlyPlayed(recentOwner) }));
  const recentlyPlayed = getHomeRecentlyPlayedForOwner(recentOwner, recentlyPlayedState.owner, recentlyPlayedState.tracks);
  const setRecentlyPlayed = (next) => setRecentlyPlayedState((current) => ({
    owner: recentOwner,
    tracks: typeof next === "function" ? next(current.owner === recentOwner ? current.tracks : readCachedHomeRecentlyPlayed(recentOwner)) : next,
  }));
  const [suggestionsState, setSuggestionsState] = useState(() => ({ owner: recentOwner, tracks: readCachedHomeSuggestions(recentOwner) }));
  const suggestedTracks = suggestionsState.owner === recentOwner ? suggestionsState.tracks : readCachedHomeSuggestions(recentOwner);
  const suggestionsRequestRef = useRef(0);
  const [recentlyAdded, setRecentlyAdded] = useState(() => readCachedHomeRecentlyAdded());
  const [downloadedArtistNotice, setDownloadedArtistNotice] = useState(null);
  const context = recentlyPlayed.map((track) => String(track.id)).join("|");

  useEffect(() => { setRecentlyPlayed(readCachedHomeRecentlyPlayed(recentOwner)); }, [recentOwner]);
  useEffect(() => {
    let active = true;
    const seenKey = "hypersynced.catalog-seen-track-ids.v1";
    const cachedBeforeRefresh = readCachedHomeRecentlyAdded();
    let storedSeen = null;
    try {
      const saved = localStorage.getItem(seenKey);
      if (saved !== null) storedSeen = JSON.parse(saved);
    } catch {}
    const baseline = new Set(
      Array.isArray(storedSeen) ? storedSeen.map(String) : cachedBeforeRefresh.map((track) => String(track.id)),
    );
    const hasBaseline = storedSeen !== null || cachedBeforeRefresh.length > 0;
    const artistNamesPromise = currentUser
      ? import("../../offlineDownloads.js").then(({ getDownloadedArtistNames, getOfflineOwnerKey }) => getDownloadedArtistNames(getOfflineOwnerKey(currentUser))).catch(() => [])
      : Promise.resolve([]);
    void Promise.all([refreshHomeRecentlyAdded(), artistNamesPromise]).then(([tracks, downloadedArtists]) => {
      if (!active) return;
      setRecentlyAdded(tracks);
      const currentIds = tracks.map((track) => String(track.id));
      const knownIds = new Set([...baseline, ...currentIds]);
      try { localStorage.setItem(seenKey, JSON.stringify([...knownIds].slice(-1200))); } catch {}
      if (!hasBaseline || !downloadedArtists.length) return;
      const normalizedArtists = new Set(downloadedArtists.map(normalizedArtistKey).filter(Boolean));
      const newMatch = tracks.find((track) => !baseline.has(String(track.id)) && trackMatchesDownloadedArtist(track, normalizedArtists));
      if (newMatch) setDownloadedArtistNotice(newMatch);
    }).catch(() => {
      // Keep cached newest-added tracks when the network is unavailable.
    });
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.username]);
  useEffect(() => subscribeListeningHistoryChanged((event) => {
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
  }), [recentOwner]);

  const loadSuggestions = useCallback(async () => {
    const requestId = ++suggestionsRequestRef.current;
    const cached = readCachedHomeSuggestions(recentOwner);
    setSuggestionsState({ owner: recentOwner, tracks: cached });
    const contextTrackIds = context.split("|").filter(Boolean).slice(0, 12);
    try {
      const response = await getSuggestedMusic({ currentTrackId: contextTrackIds[0] ?? null, excludeTrackIds: contextTrackIds, contextTrackIds, limit: 40, homeExplore: true, neverPlayedOnly: false });
      if (requestId !== suggestionsRequestRef.current) return;
      const tracks = Array.isArray(response) ? response : [];
      // A transient empty recommendation response must not erase a known-good
      // Home shelf. Keep the cache when the server returns no tracks.
      const usableTracks = tracks.length ? tracks : cached;
      if (tracks.length) writeCachedHomeSuggestions(recentOwner, tracks);
      setSuggestionsState({ owner: recentOwner, tracks: usableTracks });
    } catch {
      // Cached personalized content remains available if refresh fails.
    }
  }, [recentOwner, context]);

  useEffect(() => { if (suggestedTracks.length) player.seedQueueFromSuggestions(suggestedTracks); }, [suggestedTracks]);
  useEffect(() => {
    void loadSuggestions();
    return () => { suggestionsRequestRef.current++; };
  }, [loadSuggestions]);

  const play = async (track) => {
    if (!track?.id) return;
    try {
      await player.playTrack(track.id, {
        audioUrl: track.audio_url ?? null,
        artworkUrl: resolveArtworkUrl(track.artwork_url),
        title: track.title ?? "",
        artist: track.artist ?? "",
        album: track.album ?? "",
        mimeType: track.mime_type ?? null,
        fileSize: track.file_size ?? null,
        mediaVersion: track.media_version ?? null,
        genre: track.genre ?? "",
        releaseYear: track.release_year ?? null,
      });
    } catch (error) {
      console.warn("[HyperSynced] Home playback failed.", error);
    }
  };
  const warm = (track) => { if (track?.id) void player.warmTrackForPlayback(track.id, track, { warmBytes: 256 * 1024 }); };
  const firstWarmTrack = recentlyPlayed[0] ?? suggestedTracks[0];
  useEffect(() => {
    if (firstWarmTrack?.id) void player.warmTrackForPlayback(firstWarmTrack.id, firstWarmTrack, { warmBytes: 256 * 1024 });
  }, [firstWarmTrack?.id]);
  const greetingPeriod = (() => { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good night"; })();
  const menuProps = (track) => menu.getTriggerProps(track);
  const playNext = (track) => { if (player.playTrackNext(track)) window.dispatchEvent(new CustomEvent("hypersynced:status-message", { detail: "Added to Play Next" })); };
  // Request a broad recommendation pool so Home cannot disappear when every song is recently played.
  // Quick Picks prioritize songs outside the locally known recent-history set, then fill from the catalog.
  const homeDiscoveryPool = suggestedTracks.length ? suggestedTracks : recentlyAdded;
  const discovery = [...homeDiscoveryPool].filter((track, index, all) =>
    track?.id && all.findIndex((candidate) => String(candidate?.id) === String(track.id)) === index
  ).slice(0, 12);
  const recentTrackIds = new Set(recentlyPlayed.map((track) => String(track?.id ?? "")).filter(Boolean));
  const quickPickPool = [...homeDiscoveryPool, ...recentlyAdded].filter((track, index, all) =>
    track?.id && all.findIndex((candidate) => String(candidate?.id) === String(track.id)) === index
  );
  const quickPicks = [...quickPickPool.filter((track) => !recentTrackIds.has(String(track.id))), ...quickPickPool.filter((track) => recentTrackIds.has(String(track.id)))].slice(0, 6);
  const artworkWarmTracks = [...quickPicks, ...recentlyPlayed, ...suggestedTracks, ...recentlyAdded];
  const artworkWarmKey = artworkWarmTracks.map((track) => track?.id).filter(Boolean).join("|");
  useEffect(() => { warmTrackArtwork(artworkWarmTracks, 18); }, [artworkWarmKey]);

  return (
    <div className="page-stack home-page">
      <header className="home-page__greeting"><span>YOUR MUSIC, YOUR SPACE</span><h1>{currentUser ? `${greetingPeriod}, ${currentUser.username ?? "there"}` : "Welcome to HyperSynced"}</h1></header>
      <HomeCarousel recent={recentlyPlayed} suggestions={suggestedTracks} fallbackTracks={recentlyAdded} onNavigate={onNavigate} guest={!currentUser} onOpenAuth={onOpenAuth} onPlay={play} onPlayPicked={(tracks) => { void player.playTrackQueue(tracks); }} pickedTracks={discovery} onOpenArtist={onOpenArtist} />
      {downloadedArtistNotice ? <DownloadedArtistTrackNotice track={downloadedArtistNotice} onDismiss={() => setDownloadedArtistNotice(null)} /> : null}
      <QuickPicks tracks={quickPicks} onPlay={play} onWarm={warm} onPlayNext={playNext} getMenuProps={menuProps} onNavigate={onNavigate} onRecent={() => onNavigate?.("profile")} />
      {discovery.length ? <TrackRow title="Picked for you" eyebrow="DISCOVER" tracks={discovery} onPlay={play} onWarm={warm} onPlayNext={playNext} getMenuProps={menuProps} /> : null}
      {recentlyAdded.length ? <TrackRow title="Newly Uploaded" eyebrow="JUST ADDED TO HYPERSYNCED" tracks={recentlyAdded} onPlay={play} onWarm={warm} onPlayNext={playNext} getMenuProps={menuProps} /> : null}
      {recentlyPlayed.length >= 6 ? <TrackRow title="Recently played" eyebrow="YOUR LISTENING" tracks={recentlyPlayed} onPlay={play} onWarm={warm} onPlayNext={playNext} getMenuProps={menuProps} /> : null}
      <ArtistRow tracks={suggestedTracks} fallbackTracks={recentlyAdded} onOpenArtist={onOpenArtist} onNavigate={onNavigate} />
      <TrackActionMenu menu={menu.menu} onClose={menu.closeMenu} currentUser={currentUser} onRequireAuth={onOpenAuth} />
    </div>
  );
}

export default HomePage;
