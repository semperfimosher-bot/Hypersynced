import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Library tabs are only Playlists and Artists", () => {
  const constants = read("./constants.js");
  assert.match(constants, /LIBRARY_TABS\s*=\s*\[\s*"Playlists"\s*,\s*"Artists"\s*,?\s*\]/);
});

test("Library Artists comes from followed profiles and uses profile artwork", () => {
  const library = read("./components/pages/LibraryPage.jsx");
  const api = read("./profileApi.js");
  const backend = read("../../backend/app/api/routes/artists.py");
  assert.match(library, /getFollowedArtists/);
  assert.match(library, /followedArtists\s*\.map/);
  assert.match(library, /artwork_url:\s*follow\?\.artwork_url\s*\|\|\s*null/);
  assert.match(api, /\/artists\/following/);
  assert.match(backend, /"\/following"/);
  assert.match(backend, /"artwork_url"/);
});

test("Song action menu has no standalone offline download action", () => {
  const menu = read("./components/music/TrackActionMenu.jsx");
  assert.doesNotMatch(menu, /Download for offline/);
  assert.doesNotMatch(menu, /async function downloadTrack\(/);
  assert.match(menu, /downloadTrackForOffline/); // Liked Songs retains its background offline cache.
});

test("Find Your Mix asks for never-played candidates and refreshes cache quietly", () => {
  const home = read("./components/pages/HomePage.jsx");
  const api = read("./profileApi.js");
  const recommendations = read("../../backend/app/api/routes/recommendations.py");
  const autoplay = read("../../backend/app/services/autoplay.py");
  assert.match(home, /neverPlayedOnly:\s*true/);
  assert.match(home, /writeCachedHomeSuggestions/);
  assert.match(api, /never_played_only:\s*neverPlayedOnly/);
  assert.match(recommendations, /never_played_only/);
  assert.match(autoplay, /never_played_only\s+and\s+user_id\s+is\s+not\s+None/);
  assert.match(autoplay, /ListeningEvent\.user_id\s*==\s*user_id/);
});
