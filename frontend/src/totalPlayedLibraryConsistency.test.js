import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Total Played reuses Library page shell, typography, and track row styling", () => {
  const page = fs.readFileSync(
    new URL("./components/pages/TotalPlayedPage.jsx", import.meta.url),
    "utf8",
  );
  const profileStyles = fs.readFileSync(
    new URL("./styles/profile.css", import.meta.url),
    "utf8",
  );
  const libraryStyles = fs.readFileSync(
    new URL("./styles/search.css", import.meta.url),
    "utf8",
  );

  assert.match(page, /hs-search-page hs-library-page hs-total-played-route/);
  assert.match(page, /hs-search-playlist-view__nav/);
  assert.match(page, /hs-search-playlist-view__hero hs-total-played-hero/);
  assert.match(page, /hs-search-playlist-view__copy hs-total-played-heading/);
  assert.match(page, /hs-search-track hs-library-track-row hs-total-played-track/);
  assert.match(page, /hs-search-track__rank/);
  assert.match(page, /hs-search-track__art/);
  assert.match(page, /hs-search-track__copy/);
  assert.match(page, /hs-search-track__play/);

  assert.match(libraryStyles, /\.hs-search-track\s*\{/);
  assert.match(profileStyles, /\.hs-total-played-track\s*\{[\s\S]*grid-template-columns/);
  assert.match(profileStyles, /\.hs-total-played-track\s*\{[\s\S]*min-height: 64px/);
  assert.match(profileStyles, /\.hs-total-played-heading\s*\{[\s\S]*margin: 0/);
});
