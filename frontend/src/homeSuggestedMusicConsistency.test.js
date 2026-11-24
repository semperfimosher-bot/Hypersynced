import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("Home replaces Recently Played section with cached personalized Suggested Music", () => {
  const page = fs.readFileSync(new URL("./components/pages/HomePage.jsx", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("./profileApi.js", import.meta.url), "utf8");
  assert.match(page, /title="Suggested Music"/); assert.doesNotMatch(page, /title="Recently Played"/);
  assert.match(page, /readCachedHomeSuggestions/); assert.match(page, /writeCachedHomeSuggestions/);
  assert.match(page, /getSuggestedMusic/); assert.match(page, /contextTrackIds/); assert.match(page, /bottomSuggestions/); assert.match(page, /personalizedSuggestions/); assert.match(page, /recentlyPlayed/); assert.match(page, /suggestionsRequestRef/); assert.match(page, /requestId !== suggestionsRequestRef\.current/); assert.match(api, /\/recommendations\/autoplay/); assert.match(page, /seedQueueFromSuggestions\(suggestedTracks\)/);
});
