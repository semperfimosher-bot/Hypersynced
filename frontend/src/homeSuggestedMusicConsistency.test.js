import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Home keeps Picked for You and removes the redundant Suggested shelf", () => {
  const page = fs.readFileSync(new URL("./components/pages/HomePage.jsx", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("./profileApi.js", import.meta.url), "utf8");

  assert.match(page, /title="Picked for you"/);
  assert.doesNotMatch(page, /Suggested Music/);
  assert.doesNotMatch(page, /home-suggested-music/);
  assert.doesNotMatch(page, /MoodCards/);

  // Personalized tracks still power Home discovery and quick picks.
  assert.match(page, /readCachedHomeSuggestions/);
  assert.match(page, /writeCachedHomeSuggestions/);
  assert.match(page, /getSuggestedMusic/);
  assert.match(page, /fallbackTracks=\{recentlyAdded\}/);
  assert.match(page, /activeTrack \? onPlay\(activeTrack\)/);
  assert.match(page, /contextTrackIds/);
  assert.match(page, /recentlyPlayed/);
  assert.match(page, /suggestionsRequestRef/);
  assert.match(page, /requestId !== suggestionsRequestRef\.current/);
  assert.match(page, /const usableTracks = tracks\.length \? tracks : cached/);
  assert.match(page, /homeDiscoveryPool = suggestedTracks\.length \? suggestedTracks : recentlyAdded/);
  assert.match(page, /fallbackTracks=\{recentlyAdded\}/);
  assert.match(page, /seedQueueFromSuggestions\(suggestedTracks\)/);
  assert.match(api, /recommendations\/autoplay/);
});
