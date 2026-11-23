import test from "node:test";
import assert from "node:assert/strict";
import { readTotalPlayedCache, writeTotalPlayedCache, mergeTotalPlayedTracks } from "./totalPlayedCache.js";
test("Total Played cache is account-scoped and removes playable URLs", () => {
  const values = new Map(), original = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  try { writeTotalPlayedCache("cache-test-a", [{ id: "track-a", title: "Cached", audio_url: "https://private/audio", play_count: 5 }], true);
    const saved = readTotalPlayedCache("cache-test-a"); assert.equal(saved.tracks[0].title, "Cached"); assert.equal(saved.hasMore, true);
    assert.equal("audio_url" in saved.tracks[0], false); assert.deepEqual(readTotalPlayedCache("cache-test-b"), { tracks: [], hasMore: false });
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});
test("Total Played cache merges pages without duplicate IDs", () => { assert.deepEqual(mergeTotalPlayedTracks([{ id: "1" }], [{ id: "1" }, { id: "2" }]).map((track) => track.id), ["1", "2"]); });
