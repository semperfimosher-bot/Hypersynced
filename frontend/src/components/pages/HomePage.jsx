import { useCallback, useEffect, useRef, useState } from "react";
import { resolveArtworkUrl } from "../../artworkUrl.js";
import * as player from "../../audioPlayer.js";
import TrackActionMenu from "../music/TrackActionMenu.jsx";
import useTrackActionMenu from "../../hooks/useTrackActionMenu.js";
import { readCachedHomeSuggestions, writeCachedHomeSuggestions } from "../../homeSuggestions.js";
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

const MEMBER_SLIDE_LABELS = ["Your music", "Discover", "Artists to explore", "Explore"];

function HomeCarousel({ recent, suggestions, onNavigate, guest, onOpenAuth, onPlay, onOpenArtist }) {
  const slideLabels = guest ? ["Welcome", "Your music", "Discover", "Artists to explore", "Explore"] : MEMBER_SLIDE_LABELS;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (paused) return undefined;
    timer.current = window.setInterval(() => setActive((current) => (current + 1) % slideLabels.length), 5000);
    return () => window.clearInterval(timer.current);
  }, [paused, slideLabels.length]);

  const moveTo = (index) => {
    setActive(index);
    setPaused(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPaused(false), 10000);
  };
  const memberSlideTracks = [recent[0], suggestions[0], suggestions[2] ?? suggestions[0], suggestions[4] ?? suggestions[0]];
  const slideTracks = guest ? [null, ...memberSlideTracks] : memberSlideTracks;
  const contentIndex = guest ? active - 1 : active;
  const firstRecent = recent[0];
  const discover = suggestions[0];
  const coverFor = (index) => resolveArtworkUrl(slideTracks[index]?.artwork_url);
  const activeTrack = slideTracks[active];

  return (
    <section className="home-carousel" aria-label="Featured home slides" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <div className="home-carousel__viewport">
        {slideLabels.map((label, index) => (
          <article key={label} className={`home-carousel__slide ${guest && index === 0 ? "home-carousel__slide--guest-welcome" : ""} ${index === active ? "is-active" : ""}`} aria-hidden={index !== active}>
            <div className="home-carousel__art" style={guest && index === 0 ? { backgroundImage: "url(/hypersync-home-hero.png)" } : coverFor(index) ? { backgroundImage: `url("${coverFor(index)}")` } : undefined} />
            <div className="home-carousel__artwork" aria-hidden="true">{coverFor(index) ? <img src={coverFor(index)} alt="" loading={index === active ? "eager" : "lazy"} /> : null}</div>
            <div className="home-carousel__content">
              <span className="home-carousel__eyebrow">{guest && index === 0 ? "WELCOME TO HYPERSYNCED" : contentIndex === 0 ? "PICK UP WHERE YOU LEFT OFF" : contentIndex === 1 ? "YOUR NEXT FAVORITE" : contentIndex === 2 ? "ARTISTS TO EXPLORE" : "EXPLORE MUSIC"}</span>
              <h2>{guest && index === 0 ? "Welcome to HyperSynced" : contentIndex === 0 ? "Your sound, right where you left it" : contentIndex === 1 ? "Find your next favorite" : contentIndex === 2 ? "Discover artists that fit your sound" : "Explore something new"}</h2>
              <p>{guest && index === 0 ? "Discover music, find your favorites, and make HyperSynced your own." : contentIndex === 0 ? "A quick look at music you’ve been playing lately." : contentIndex === 1 ? "Explore music and discover something new to listen to." : contentIndex === 2 ? "Find artists based on music you have been listening to." : "Browse music, artists, albums and playlists."}</p>
              {activeTrack && !(guest && index === 0) ? <div className="home-carousel__track-meta"><button type="button" className="home-carousel__track-title" onClick={() => onPlay?.(activeTrack)}>{activeTrack.title || "Featured track"}</button><button type="button" onClick={() => onOpenArtist?.(activeTrack.artist)}>{activeTrack.artist || "Unknown artist"}</button></div> : null}
              <button className="home-carousel__action" type="button" onClick={() => guest && index === 0 ? onOpenAuth?.() : contentIndex === 0 ? (firstRecent ? onPlay(firstRecent) : onOpenAuth?.()) : contentIndex === 1 ? (discover ? onPlay(discover) : onNavigate?.("search")) : contentIndex === 2 ? onOpenArtist?.(suggestions[2]?.artist) : onNavigate?.("search")}>{guest && index === 0 ? "Get started" : contentIndex === 0 ? (firstRecent ? "Play recent" : "Get started") : contentIndex === 1 ? (discover ? "Play discovery" : "Explore music") : contentIndex === 2 ? "Explore artists" : "Explore music"} <span>▶</span></button>
            </div>
          </article>
        ))}
      </div>
      <div className="home-carousel__controls" aria-label="Slide controls">{slideLabels.map((label, index) => <button key={label} type="button" aria-label={`Show slide ${index + 1}: ${label}`} aria-current={active === index ? "true" : undefined} className={active === index ? "is-active" : ""} onClick={() => moveTo(index)} />)}</div>
      <span className="home-carousel__counter">{active + 1} / {slideLabels.length}</span>
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
      const response = await getSuggestedMusic({ currentTrackId: contextTrackIds[0] ?? null, excludeTrackIds: contextTrackIds, contextTrackIds, limit: 40, homeExplore: true });
      if (requestId !== suggestionsRequestRef.current) return;
      const tracks = Array.isArray(response) ? response : [];
      writeCachedHomeSuggestions(recentOwner, tracks);
      setSuggestionsState({ owner: recentOwner, tracks });
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
  const menuProps = (track) => menu.getTriggerProps(track);
  const playNext = (track) => { if (player.playTrackNext(track)) window.dispatchEvent(new CustomEvent("hypersynced:status-message", { detail: "Added to Play Next" })); };
  const actualRecentIds = new Set(recentlyPlayed.map((track) => String(track.id)));
  const recentArtistKeys = new Set(recentlyPlayed.map((track) => normalizedArtistKey(track.artist)).filter(Boolean));
  const discoveryFallback = recentlyAdded.filter((track) => !recentArtistKeys.has(normalizedArtistKey(track.artist)));
  const homeDiscoveryPool = [...suggestedTracks, ...discoveryFallback].filter((track, index, all) => track?.id && all.findIndex((candidate) => String(candidate?.id) === String(track.id)) === index).slice(0, 12);
  const homeRecentFallback = recentlyPlayed.slice(0, 12);
  const discovery = homeDiscoveryPool.filter((track) => !actualRecentIds.has(String(track.id))).slice(0, 12);
  const quickPicks = [...homeRecentFallback, ...suggestedTracks].filter((track, index, all) => track?.id && all.findIndex((candidate) => String(candidate?.id) === String(track.id)) === index).slice(0, 4);

  return (
    <div className="page-stack home-page">
      <header className="home-page__greeting"><span>YOUR MUSIC, YOUR SPACE</span><h1>{currentUser ? `Good to see you, ${currentUser.username ?? "there"}` : "Welcome to HyperSynced"}</h1></header>
      <HomeCarousel recent={homeRecentFallback} suggestions={suggestedTracks} onNavigate={onNavigate} guest={!currentUser} onOpenAuth={onOpenAuth} onPlay={play} onOpenArtist={onOpenArtist} />
      {downloadedArtistNotice ? <DownloadedArtistTrackNotice track={downloadedArtistNotice} onDismiss={() => setDownloadedArtistNotice(null)} /> : null}
      {quickPicks.length ? <QuickPicks tracks={quickPicks} onPlay={play} onWarm={warm} onPlayNext={playNext} getMenuProps={menuProps} /> : null}
      {homeRecentFallback.length >= 6 ? <TrackRow title="Recently played" eyebrow="YOUR LISTENING" tracks={homeRecentFallback} onPlay={play} onWarm={warm} onPlayNext={playNext} getMenuProps={menuProps} /> : null}
      {recentlyAdded.length ? <TrackRow title="Newly Released" eyebrow="JUST ADDED TO HYPERSYNCED" tracks={recentlyAdded} onPlay={play} onWarm={warm} onPlayNext={playNext} getMenuProps={menuProps} /> : null}
      {discovery.length >= 6 ? <TrackRow title="Picked for you" eyebrow="DISCOVER" tracks={discovery} onPlay={play} onWarm={warm} onPlayNext={playNext} getMenuProps={menuProps} /> : null}
      <ArtistRow tracks={suggestedTracks} onOpenArtist={onOpenArtist} onNavigate={onNavigate} />
      <TrackActionMenu menu={menu.menu} onClose={menu.closeMenu} currentUser={currentUser} onRequireAuth={onOpenAuth} />
    </div>
  );
}

export default HomePage;
