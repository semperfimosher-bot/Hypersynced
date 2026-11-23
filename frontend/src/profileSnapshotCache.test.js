import test from "node:test";
import assert from "node:assert/strict";
import { readProfileSnapshot, writeProfileSnapshot, clearProfileSnapshot } from "./profileSnapshotCache.js";

function mockStorage(name) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  const values = new Map();
  Object.defineProperty(globalThis, name, { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  } });
  return { restore: () => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; } };
}

test("profile snapshot returns instant-display data and removes playable URLs", () => {
  const mock = mockStorage("localStorage");
  try {
    const source = { display_name: "Test", tracks_played: 9, recently_played: [{ id: 2, title: "Song", audio_url: "secret", artwork_url: "/art" }], top_artists: [{ artist: "Artist", plays: 3 }] };
    assert.equal(writeProfileSnapshot("user-1", source, 1000), true);
    const cached = readProfileSnapshot("user-1", 1001);
    assert.equal(cached.display_name, "Test");
    assert.equal(cached.recently_played[0].audio_url, undefined);
    assert.equal(cached.recently_played[0].title, "Song");
    assert.deepEqual(cached.top_artists, [{ artist: "Artist", plays: 3 }]);
    assert.equal(readProfileSnapshot("user-2", 1001), null);
  } finally { mock.restore(); }
});

test("profile snapshot expires and can be cleared", () => {
  const mock = mockStorage("localStorage");
  try {
    writeProfileSnapshot("u", { display_name: "A" }, 10);
    assert.equal(readProfileSnapshot("u", 10 + 7 * 24 * 60 * 60 * 1000 + 1), null);
    writeProfileSnapshot("u", { display_name: "B" }, 20);
    clearProfileSnapshot("u");
    assert.equal(readProfileSnapshot("u", 21), null);
  } finally { mock.restore(); }
});


test("profile snapshot updates are broadcast to same-tab and other-tab subscribers", async () => {
  const { PROFILE_SNAPSHOT_CHANGED_EVENT, subscribeProfileSnapshotChanged } = await import("./profileSnapshotCache.js");
  const target = new EventTarget();
  let calls = 0;
  const unsubscribe = subscribeProfileSnapshotChanged("owner-1", () => { calls += 1; }, target);
  try {
    const sameTabEvent = new CustomEvent(PROFILE_SNAPSHOT_CHANGED_EVENT, { detail: { owner: "owner-1" } });
    target.dispatchEvent(sameTabEvent);
    const storageEvent = new Event("storage");
    Object.defineProperty(storageEvent, "key", { value: "hypersynced.profile-snapshot.v1:owner-1" });
    target.dispatchEvent(storageEvent);
    const wrongOwnerEvent = new CustomEvent(PROFILE_SNAPSHOT_CHANGED_EVENT, { detail: { owner: "owner-2" } });
    target.dispatchEvent(wrongOwnerEvent);
    assert.equal(calls, 2);
  } finally {
    unsubscribe();
  }
});
