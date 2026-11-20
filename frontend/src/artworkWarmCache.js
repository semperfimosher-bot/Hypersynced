import { resolveArtworkUrl } from "./artworkUrl.js";

const warmedArtworkUrls = new Set();
const MAX_ARTWORKS_PER_BATCH = 24;

// Populate the browser's image cache before playlist rows are rendered.
// Limit each batch to the first visible tracks to avoid hundreds of requests.
export function warmTrackArtwork(tracks, limit = MAX_ARTWORKS_PER_BATCH) {
  if (typeof Image === "undefined" || !Array.isArray(tracks)) return 0;
  let warmed = 0;
  for (const track of tracks) {
    if (warmed >= limit) break;
    const raw = track?.artwork_url ?? track?.artworkUrl;
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
