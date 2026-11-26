import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const searchPageSource = readFileSync(new URL("./components/pages/SearchPage.jsx", import.meta.url), "utf8");

test("SearchPage uses relevance filtering and intent-aware ordering consistently", () => {
  assert.match(searchPageSource, /filterSearchResultsForQuery\(combinedResults, normalizedQuery\)/, "Expected general searches to filter by direct query relevance.");
  assert.match(searchPageSource, /orderSearchResultsForDisplay\(relevant\)/, "Expected display ordering to run on relevant results.");
  assert.match(searchPageSource, /pickTopSignal\(\s*displayResults\s*,?\s*\)/, "Top Signal must use the same filtered display results.");
  assert.match(searchPageSource, /displayResults\.tracks\.map\(/, "Track rows must use displayResults.tracks.");
  assert.match(searchPageSource, /displayResults\.artists\.map\(/, "Artist rows must use displayResults.artists.");
  assert.match(searchPageSource, /collaborationTracks\.map\(/, "Collaboration rows must use direct collaborative track results.");
  assert.match(searchPageSource, /displayResults\.albums\.map\(/, "Album rows must use displayResults.albums.");
  assert.match(searchPageSource, /displayResults\.people\.map\(/, "People rows must use displayResults.people.");
});
