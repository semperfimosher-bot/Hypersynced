import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const searchPageSource = readFileSync(
  new URL("./components/pages/SearchPage.jsx", import.meta.url),
  "utf8",
);
const openHandlerStart = searchPageSource.indexOf("function openSearchPlaylist(playlistSeed)");
const openHandlerEnd = searchPageSource.indexOf("\n\n\nfunction closeSearchPlaylist()", openHandlerStart);
const openHandler = searchPageSource.slice(openHandlerStart, openHandlerEnd);

test("search playlist navigation renders the shell before awaiting playlist data", () => {
  assert.ok(openHandlerStart >= 0 && openHandlerEnd > openHandlerStart);
  assert.ok(
    openHandler.indexOf("setOpenedPlaylist(shell)") < openHandler.indexOf("getPlaylist(playlistId"),
    "The playlist shell must be committed before the playlist request starts.",
  );
  assert.match(openHandler, /searchPlaylistCache\.get\(key\)/);
});

test("search playlist hydration fetches the first page and progressively appends ordered pages", () => {
  assert.match(openHandler, /limit:\s*1000,\s*offset:\s*0/);
  assert.match(openHandler, /pageOffsets\.slice\(index,\s*index\s*\+\s*3\)/);
  assert.match(openHandler, /tracks:\s*\[\s*\.\.\.hydrated\.tracks,[\s\S]*?pages\.flatMap/);
  assert.match(openHandler, /searchPlaylistCache\.set\(key,\s*hydrated\)/);
});

test("playlist fetches are deduplicated and stale responses are guarded", () => {
  assert.match(openHandler, /searchPlaylistRequests\.get\(key\)/);
  assert.match(openHandler, /searchPlaylistRequests\.set\(key,\s*request\)/);
  assert.match(openHandler, /openedPlaylistIdRef\.current === key/);
  assert.match(searchPageSource, /openSearchPlaylist\(playlist\)/);
});
