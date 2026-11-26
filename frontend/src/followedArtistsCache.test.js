import test from "node:test";
import assert from "node:assert/strict";
import { readFollowedArtistsCache, writeFollowedArtistsCache } from "./followedArtistsCache.js";

function withStorage(run) {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try { run(values); } finally { globalThis.localStorage = original; }
}

test("followed artist cache hydrates and expires safely", () => {
  withStorage(() => {
    const artists = [{ artist: "Test Artist", artwork_url: "/art.jpg" }];
    assert.equal(writeFollowedArtistsCache("user-1", artists, 1000), true);
    assert.deepEqual(readFollowedArtistsCache("user-1", 2000), artists);
    assert.equal(readFollowedArtistsCache("user-1", 31 * 24 * 60 * 60 * 1000), null);
  });
});
