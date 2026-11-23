import { resolveArtworkUrl } from "./artworkUrl.js";

const warmedArtworkUrls = new Set();
const MAX_ARTWORKS_PER_BATCH = 24;

function rawArtwork(track) {
  return track?.artwork_url ?? track?.artworkUrl ?? null;
}

// Populate the browser image cache before playlist rows are rendered. Keep
// batches bounded so a large account library doesn't start hundreds of requests.
export function warmArtworkUrls(rawUrls, limit = MAX_ARTWORKS_PER_BATCH) {
  if (typeof Image === "undefined" || !Array.isArray(rawUrls)) return 0;
  let warmed = 0;
  for (const raw of rawUrls) {
    if (warmed >= limit) break;
    const url = resolveArtworkUrl(raw);
    if (!url || warmedArtworkUrls.has(url)) continue;
    warmedArtworkUrls.add(url);
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = url;
    warmed += 1;
  }
  return warmed;
}

export function warmTrackArtwork(tracks, limit = MAX_ARTWORKS_PER_BATCH) {
  if (!Array.isArray(tracks)) return 0;
  return warmArtworkUrls(tracks.map(rawArtwork), limit);
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
