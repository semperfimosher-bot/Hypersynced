import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./styles/search.css", import.meta.url), "utf8");
const sharedRows = readFileSync(new URL("./styles/surfaceConsistency.css", import.meta.url), "utf8");
const player = readFileSync(new URL("./components/player/PlayerBar.jsx", import.meta.url), "utf8");

test("mobile search filters are restricted to All, Playlists, Artists, People", () => {
  assert.match(css, /@media\s*\(max-width:\s*979px\)[\s\S]*?button\[data-filter="albums"\][\s\S]*?button\[data-filter="collaborations"\][\s\S]*?button\[data-filter="tracks"\][\s\S]*?display:\s*none\s*!important/);
});

test("mobile Search and Library rows restore compact horizontal artwork-copy-action layout", () => {
  assert.match(sharedRows, /MOBILE NORMAL ROW SYSTEM[\s\S]*?\.hs-search-page \.hs-search-track__copy[\s\S]*?text-align:\s*left\s*!important/);
  assert.match(sharedRows, /grid-template-columns:\s*42px\s+minmax\(0,\s*1fr\)\s+32px\s*!important/);
  assert.match(sharedRows, /\.hs-search-page \.hs-search-track__rank[\s\S]*display:\s*none\s*!important/);
  assert.match(sharedRows, /white-space:\s*nowrap\s*!important/);
  assert.match(sharedRows, /text-overflow:\s*ellipsis\s*!important/);
});

test("mobile player swipes skip tracks in both directions", () => {
  assert.match(player, /onPointerDownCapture/);
  assert.match(player, /onPointerUp/);
  assert.match(player, /if\s*\(dx\s*<\s*0\)\s*handleNext\(\);\s*else\s*handlePrevious\(\);/);
  assert.match(css, /\.player-bar\s*\{\s*touch-action:\s*pan-y;/);
});


test("mobile album, artist, and collaboration cards use the same normal horizontal row", () => {
  assert.match(sharedRows, /MOBILE NORMAL ROW SYSTEM[\\s\\S]*?\\.hs-search-page \\.hs-search-entity-card[\\s\\S]*?grid-template-columns:\\s*42px\\s+minmax\\(0,\\s*1fr\\)\\s+32px\\s*!important/);
  assert.match(sharedRows, /\\.hs-search-page \\.hs-collaboration-song-row/);
  assert.match(sharedRows, /\\.hs-search-page \\.hs-search-entity-card > svg:last-child[\\s\\S]*grid-column:\\s*3\\s*!important/);
  assert.match(sharedRows, /\\.hs-artist-row/);
  assert.match(sharedRows, /text-overflow:\\s*ellipsis\\s*!important/);
  assert.match(sharedRows, /display:\\s*none\\s*!important/);
});

test("mobile album artist and collaboration artwork cannot overlap row copy", () => {
  assert.match(sharedRows, /ENTITY ROW TEXT FIX[\\s\\S]*?grid-template-columns:\\s*42px\\s+minmax\\(0,\\s*1fr\\)\\s+32px\\s*!important/);
  assert.match(sharedRows, /hs-search-entity-card > \\.hs-search-track__art[\\s\\S]*?width:\\s*42px\\s*!important[\\s\\S]*?height:\\s*42px\\s*!important/);
  assert.match(sharedRows, /hs-search-entity-card > \\.hs-search-track__copy[\\s\\S]*?grid-column:\\s*2\\s*!important/);
  assert.match(sharedRows, /hs-collaboration-song-row > \\.hs-search-track__copy/);
  assert.match(sharedRows, /object-fit:\\s*cover\\s*!important/);
});
