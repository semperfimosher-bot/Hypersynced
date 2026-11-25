import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./styles/search.css", import.meta.url), "utf8");
const player = readFileSync(new URL("./components/player/PlayerBar.jsx", import.meta.url), "utf8");

test("mobile search filters are restricted to All, Playlists, Artists, People", () => {
  assert.match(css, /@media\s*\(max-width:\s*979px\)[\s\S]*?button\[data-filter="albums"\][\s\S]*?button\[data-filter="collaborations"\][\s\S]*?button\[data-filter="tracks"\][\s\S]*?display:\s*none\s*!important/);
});

test("mobile search result copy stays left aligned and avoids oversized metadata columns", () => {
  assert.match(css, /\.hs-search-track__copy[\s\S]*?justify-self:\s*start\s*!important/);
  assert.match(css, /grid-template-columns:\s*22px\s+42px\s+minmax\(0,\s*1fr\)\s+minmax\(44px,\s*70px\)\s+34px\s+28px/);
});

test("mobile player swipes skip tracks in both directions", () => {
  assert.match(player, /onPointerDownCapture/);
  assert.match(player, /onPointerUp/);
  assert.match(player, /if\s*\(dx\s*<\s*0\)\s*handleNext\(\);\s*else\s*handlePrevious\(\);/);
  assert.match(css, /\.player-bar\s*\{\s*touch-action:\s*pan-y;/);
});
