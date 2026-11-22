import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./components/pages/LibraryPage.jsx", import.meta.url),
  "utf8",
);

test("Library playlist detail requests are shared and persisted for instant reopen", () => {
  assert.match(source, /playlistPrefetchRequestsRef = useRef\(new Map\(\)\)/);
  assert.match(source, /const existing = playlistPrefetchRequestsRef\.current\.get\(key\)/);
  assert.match(source, /setCachedPlaylist\(libraryCacheKey, playlist\)/);
  assert.match(source, /getCachedPlaylistAsync\(libraryCacheKey, playlistId\)/);
});

test("playlist hover and keyboard focus warm details, and background warming uses two workers", () => {
  assert.match(source, /playlistPrefetchRequestsRef\.current\.size >= 2/);
  assert.match(source, /onMouseEnter=\{\(\) => \{\s*void prefetchPlaylistDetails\(playlist\.id\)/);
  assert.match(source, /onFocus=\{\(\) => \{\s*void prefetchPlaylistDetails\(playlist\.id\)/);\n  assert.match(source, /await requestPlaylistDetails\(playlistId\)\.catch\(\(\) => null\)/);
});

test("opening a playlist reuses its prefetch request rather than issuing a duplicate", () => {
  assert.match(source, /const serverPlaylistPromise = requestPlaylistDetails\(playlistId\)/);
});
