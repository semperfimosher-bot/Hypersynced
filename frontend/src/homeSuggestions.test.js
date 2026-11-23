import test from "node:test";
import assert from "node:assert/strict";
import { readCachedHomeSuggestions, writeCachedHomeSuggestions } from "./homeSuggestions.js";
test("home suggestion cache is account-scoped and strips playable URLs", () => {
  const values = new Map(), original = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  try { writeCachedHomeSuggestions("suggestions-test-a", [{ id: "one", title: "One", audio_url: "https://private/audio" }, { id: "two", title: "Two" }]);
    const cached = readCachedHomeSuggestions("suggestions-test-a"); assert.deepEqual(cached.map((track) => track.id), ["one", "two"]);
    assert.equal("audio_url" in cached[0], false); assert.deepEqual(readCachedHomeSuggestions("suggestions-test-b"), []);
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});
