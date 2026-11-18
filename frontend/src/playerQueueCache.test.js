import test from "node:test";
import assert from "node:assert/strict";

import {
  readPlayerQueueSnapshot,
  writePlayerQueueSnapshot,
} from "./playerQueueCache.js";

function installStorage() {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const previous = globalThis.localStorage;
  globalThis.localStorage = storage;
  return () => {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  };
}

test("queue snapshots restore quickly without persisting expiring audio URLs", () => {
  const restore = installStorage();
  try {
    const queue = [
      {
        id: "track-one",
        meta: {
          title: "First song",
          artist: "Artist",
          audioUrl: "https://temporary.example/signed-audio-token",
          artworkUrl: "https://images.example/cover.jpg",
          mediaVersion: "v1",
          durationSeconds: 180,
        },
      },
      { id: "track-two", meta: { title: "Second song", audio_url: "https://temporary.example/other-token" } },
    ];

    assert.equal(writePlayerQueueSnapshot("account-1", queue, 1, 1000), true);
    const restored = readPlayerQueueSnapshot("account-1", 2000);

    assert.equal(restored.queueIndex, 1);
    assert.equal(restored.queue.length, 2);
    assert.equal(restored.queue[0].meta.title, "First song");
    assert.equal(restored.queue[0].meta.artworkUrl, "https://images.example/cover.jpg");
    assert.equal(restored.queue[0].meta.audioUrl, undefined);

    const raw = globalThis.localStorage.getItem("hypersynced-player-queue-v1:account-1");
    assert.equal(raw.includes("signed-audio-token"), false);
    assert.equal(raw.includes("other-token"), false);
  } finally {
    restore();
  }
});

test("queue snapshots expire and remain isolated by account", () => {
  const restore = installStorage();
  try {
    writePlayerQueueSnapshot("account-1", [{ id: "one", meta: { title: "One" } }], 0, 1000);
    assert.equal(readPlayerQueueSnapshot("account-2", 2000), null);
    assert.equal(readPlayerQueueSnapshot("account-1", 1000 + 30 * 24 * 60 * 60 * 1000 + 1), null);
  } finally {
    restore();
  }
});
