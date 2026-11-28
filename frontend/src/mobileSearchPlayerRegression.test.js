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


test("mobile rows restore normal horizontal layout and hide rank numbers", () => {
  assert.match(sharedRows, /MOBILE ROW RESTORE[\s\S]*?\.hs-search-page \.hs-search-track__rank[\s\S]*?display:\s*none\s*!important/);
  assert.match(sharedRows, /grid-template-columns:\s*40px\s+minmax\(0,\s*1fr\)\s+32px\s*!important/);
  assert.match(sharedRows, /min-height:\s*64px\s*!important/);
  assert.match(sharedRows, /padding:\s*8px\s+10px\s*!important/);
});
