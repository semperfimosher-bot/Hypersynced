import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mobileStyles = fs.readFileSync(
  new URL("./styles/mobile.css", import.meta.url),
  "utf8",
);

test("mobile navigation and music UI keep legacy micro-labels readable", () => {
  const baseline = mobileStyles.slice(
    mobileStyles.indexOf("/* Mobile readability baseline:"),
  );

  for (const [selectorPattern, minimum] of [
    ["\\.mobile-bottom-nav button", 11],
    ["\\.player-bar__track small", 11],
    ["\\.library-track-index,\\s*\\.library-track-duration", 11],
    ["\\.library-track-copy small", 11],
    ["\\.settings-panel--settings \\.settings-row > span", 12],
    ["\\.mobile-player-details__queue-index", 11],
    ["\\.mobile-player-details__queue-copy small", 11],
    ["\\.mobile-player-details__queue-status", 11],
    ["\\.mobile-player-details__empty p", 12],
  ]) {
    const rule = new RegExp(
      `${selectorPattern}\\s*\\{[^}]*font-size:\\s*${minimum}px`,
      "s",
    );
    assert.match(baseline, rule, `Expected selector to use at least ${minimum}px`);
  }
});
