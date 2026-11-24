import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Home renders cached personalized suggestions and keeps mood filtering connected", () => {
  const page = fs.readFileSync(new URL("./components/pages/HomePage.jsx", import.meta.url), "utf8");
  const sections = fs.readFileSync(new URL("./components/home/HomeFeedSections.jsx", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("./profileApi.js", import.meta.url), "utf8");

  // The section uses a dynamic heading so mood selections update its label.
  assert.match(page, /id="home-suggested-music"/);
  assert.match(page, /Suggested Music/);
  assert.doesNotMatch(page, /title="Recently Played"/);

  assert.match(page, /readCachedHomeSuggestions/);
  assert.match(page, /writeCachedHomeSuggestions/);
  assert.match(page, /getSuggestedMusic/);
  assert.match(page, /contextTrackIds/);
  assert.match(page, /bottomSuggestions/);
  assert.match(page, /personalizedSuggestions/);
  assert.match(page, /recentlyPlayed/);
  assert.match(page, /suggestionsRequestRef/);
  assert.match(page, /requestId !== suggestionsRequestRef\.current/);
  assert.match(page, /seedQueueFromSuggestions\(suggestedTracks\)/);
  assert.match(page, /setMood/);
  assert.match(page, /moodRecommendations/);
  assert.match(sections, /activeMood/);
  assert.match(sections, /onChange/);
  assert.match(api, /recommendations\/autoplay/);
});
