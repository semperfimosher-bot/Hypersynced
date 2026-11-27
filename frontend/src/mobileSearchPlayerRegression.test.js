import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./styles/search.css", import.meta.url), "utf8");
const sharedRows = readFileSync(new URL("./styles/surfaceConsistency.css", import.meta.url), "utf8");
const player = readFileSync(new URL("./components/player/PlayerBar.jsx", import.meta.url), "utf8");

test("mobile search filters are restricted to All, Playlists, Artists, People", () => {
  assert.match(css, /@media\s*\(max-width:\s*979px\)[\s\S]*?button\[data-filter="albums"\][\s\S]*?button\[data-filter="collaborations"\][\s\S]*?button\[data-filter="tracks"\][\s\S]*?display:\s*none\s*!important/);
});

test("mobile search result copy stays left aligned and avoids oversized metadata columns", () => {
  assert.match(sharedRows, /MOBILE ROW SYSTEM[\s\S]*?\.hs-search-page \.hs-search-track__copy[\s\S]*?text-align:\s*left\s*!important/);
  assert.match(sharedRows, /padding-inline-start:\s*24px\s*!important/);
  assert.match(sharedRows, /\.hs-search-page \.hs-search-entity-card[\s\S]*?grid-template-columns:\s*20px\s+40px\s+minmax\(0,\s*1fr\)\s+16px\s*!important/);
  assert.match(sharedRows, /\.hs-search-page \.hs-search-track:not\([\s\S]*?grid-template-columns:\s*18px\s+40px\s+minmax\(0,\s*1fr\)\s+32px\s*!important/);
  assert.match(sharedRows, /Mobile row titles\/subtitles wrap instead of being truncated/);
  assert.match(sharedRows, /white-space:\s*normal\s*!important/);
  assert.match(sharedRows, /overflow-wrap:\s*anywhere\s*!important/);
  assert.match(sharedRows, /text-overflow:\s*clip\s*!important/);
});

test("mobile player swipes skip tracks in both directions", () => {
  assert.match(player, /onPointerDownCapture/);
  assert.match(player, /onPointerUp/);
  assert.match(player, /if\s*\(dx\s*<\s*0\)\s*handleNext\(\);\s*else\s*handlePrevious\(\);/);
  assert.match(css, /\.player-bar\s*\{\s*touch-action:\s*pan-y;/);
});
