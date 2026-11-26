import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const searchPageSource = readFileSync(
  new URL("./components/pages/SearchPage.jsx", import.meta.url),
  "utf8",
);
const openHandlerStart = searchPageSource.indexOf("function openSearchPlaylist(playlistSeed)");
const openHandlerEnd = searchPageSource.indexOf("\n\n\nfunction playOpenedPlaylist(", openHandlerStart);
const openHandler = searchPageSource.slice(openHandlerStart, openHandlerEnd);

test("search playlist navigation renders the shell before awaiting playlist data", () => {
  assert.ok(openHandlerStart >= 0 && openHandlerEnd > openHandlerStart);
  assert.ok(
    openHandler.indexOf("setOpenedPlaylist(shell)") < openHandler.indexOf("getPlaylist(playlistId"),
    "The playlist shell must be committed before the playlist request starts.",
  );
  assert.match(openHandler, /searchPlaylistCache\.get\(cacheKey\)/);
});

test("search playlist hydration fetches the first page and progressively appends ordered pages", () => {
  assert.match(openHandler, /limit:\s*100,\s*offset:\s*0/);
  assert.match(openHandler, /pageOffsets\.slice\(index,\s*index\s*\+\s*5\)/);
  assert.match(openHandler, /tracks:\s*\[\s*\.\.\.hydrated\.tracks,[\s\S]*?pages\.flatMap/);
  assert.match(openHandler, /searchPlaylistCache\.set\(cacheKey,\s*hydrated\)/);
});

test("playlist fetches are deduplicated and stale responses are guarded", () => {
  assert.match(openHandler, /searchPlaylistRequests\.get\(cacheKey\)/);
  assert.match(openHandler, /searchPlaylistRequests\.set\(cacheKey,\s*request\)/);
  assert.match(openHandler, /openedPlaylistIdRef\.current === key/);
  assert.match(searchPageSource, /openSearchPlaylist\(playlist\)/);
});


test("search playlist cache is persistent and warmed before opening", () => {
  assert.match(searchPageSource, /getCachedPlaylistAsync/);
  assert.match(searchPageSource, /searchPlaylistCache\.set\(cacheKey/);
  assert.match(searchPageSource, /setCachedPlaylist\(offlineOwnerKey, hydrated\)/);
});


test("search playlist prewarms artwork from cached and hydrated tracks", () => {
  assert.match(searchPageSource, /warmTrackArtwork\(cachedPlaylist\.tracks\)/);
  assert.match(searchPageSource, /warmTrackArtwork\(cached\.tracks\)/);
  assert.match(searchPageSource, /warmTrackArtwork\(hydrated\.tracks\)/);
  assert.match(searchPageSource, /warmTrackArtwork\(rows\)/);
  assert.match(openHandler, /warmPlaylistAudio\(shell\.tracks\)/);
  assert.match(searchPageSource, /hs-playlist-loading-rows/);
});
