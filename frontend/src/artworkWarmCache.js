import { resolveArtworkUrl } from "./artworkUrl.js";

const MAX_WARMED_ARTWORK_URLS = 600;
const PERSISTED_ARTWORK_URLS_KEY = "hypersynced:warmed-artwork-urls:v1";
const PERSISTED_ARTWORK_URL_LIMIT = 600;
const MAX_PRIORITY_ARTWORKS = 48;

const warmedArtworkUrls = new Set();
const MAX_ARTWORKS_PER_BATCH = 48;
const warmedPriorityUrls = new Set();

function readPersistedArtworkUrls() {
  try {
    const raw = globalThis.localStorage?.getItem(PERSISTED_ARTWORK_URLS_KEY);
    const urls = raw ? JSON.parse(raw) : [];
    return Array.isArray(urls) ? urls.filter((url) => typeof url === "string").slice(-PERSISTED_ARTWORK_URL_LIMIT) : [];
  } catch {
    return [];
  }
}

function persistWarmedArtworkUrls() {
  try {
    const urls = [...warmedArtworkUrls].slice(-PERSISTED_ARTWORK_URL_LIMIT);
    globalThis.localStorage?.setItem(PERSISTED_ARTWORK_URLS_KEY, JSON.stringify(urls));
  } catch {}
}

function rawArtwork(track) {
  return track?.artwork_url ?? track?.artworkUrl ?? null;
}

// Populate the browser image cache before playlist rows are rendered. Keep
// batches bounded so a large account library doesn't start hundreds of requests.
export function warmArtworkUrls(rawUrls, limit = MAX_ARTWORKS_PER_BATCH, priority = false) {
  if (typeof Image === "undefined" || !Array.isArray(rawUrls)) return 0;
  let warmed = 0;
  for (const raw of rawUrls) {
    if (warmed >= limit) break;
    const url = resolveArtworkUrl(raw);
    if (!url || warmedArtworkUrls.has(url)) continue;
    warmedArtworkUrls.add(url);
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority ? "high" : "low";
    image.onerror = () => warmedArtworkUrls.delete(url);
    image.src = url;
    if (priority) {
      warmedPriorityUrls.add(url);
      while (warmedPriorityUrls.size > MAX_PRIORITY_ARTWORKS) warmedPriorityUrls.delete(warmedPriorityUrls.values().next().value);
    }
    while (warmedArtworkUrls.size > MAX_WARMED_ARTWORK_URLS) {
      warmedArtworkUrls.delete(warmedArtworkUrls.values().next().value);
    }
    warmed += 1;
  }
  if (warmed > 0) persistWarmedArtworkUrls();
  return warmed;
}

export function warmTrackArtwork(tracks, limit = MAX_ARTWORKS_PER_BATCH, priority = false) {
  if (!Array.isArray(tracks)) return 0;
  return warmArtworkUrls(tracks.map(rawArtwork), limit, priority);
}

export function warmPlaylistArtwork(playlists, limit = MAX_ARTWORKS_PER_BATCH) {
  if (!Array.isArray(playlists)) return 0;
  const urls = [];
  for (const playlist of playlists) {
    if (Array.isArray(playlist?.tracks) && playlist.tracks.length) {
      urls.push(...playlist.tracks.slice(0, 4).map(rawArtwork));
    } else if (Array.isArray(playlist?.artwork_urls) && playlist.artwork_urls.length) {
      urls.push(...playlist.artwork_urls.slice(0, 4));
    } else if (playlist?.artwork_url || playlist?.artworkUrl) {
      urls.push(playlist.artwork_url ?? playlist.artworkUrl);
    }
  }
  return warmArtworkUrls(urls, limit);
}

// Warm a small subset from the previous session before the first page renders.
if (typeof Image !== "undefined") warmArtworkUrls(readPersistedArtworkUrls(), 64, true);
