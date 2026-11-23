import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mobileStyles = fs.readFileSync(
  new URL("./styles/mobile.css", import.meta.url),
  "utf8",
);

test("mobile navigation and music UI keep legacy micro-labels readable", () => {
  for (const rule of [
    /\.mobile-bottom-nav button\s*\{[^}]*font-size:\s*10px/s,
    /\.library-track-index,\s*\.library-track-duration\s*\{[^}]*font-size:\s*10px/s,
    /\.library-track-copy small\s*\{[^}]*font-size:\s*10px/s,
    /\.settings-panel--settings \.settings-row > span\s*\{[^}]*font-size:\s*10px/s,
    /\.mobile-player-details__queue-index\s*\{[^}]*font-size:\s*10px/s,
    /\.mobile-player-details__queue-copy small\s*\{[^}]*font-size:\s*9px/s,
    /\.mobile-player-details__queue-status\s*\{[^}]*font-size:\s*8px/s,
    /\.mobile-player-details__empty p\s*\{[^}]*font-size:\s*10px/s,
  ]) {
    assert.match(mobileStyles, rule);
  }
});
