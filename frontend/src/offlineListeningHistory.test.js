import test from "node:test";
import assert from "node:assert/strict";

import {
  createListeningEventId,
  enqueueOfflineListeningEvent,
  flushOfflineListeningEvents,
  readOfflineListeningEvents,
} from "./offlineListeningHistory.js";

function withLocalStorage(run) {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  try { run(values); }
  finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

test("offline listening queue is owner-scoped, bounded, and deduplicates event IDs", () => {
  withLocalStorage(() => {
    const event = {
      eventId: createListeningEventId(),
      trackId: "track-a",
      listenedAt: "2026-11-23T20:00:00.000Z",
    };
    assert.equal(enqueueOfflineListeningEvent("owner-a", event), true);
    assert.equal(enqueueOfflineListeningEvent("owner-a", event), true);
    assert.equal(readOfflineListeningEvents("owner-a").length, 1);
    assert.deepEqual(readOfflineListeningEvents("owner-b"), []);
  });
});

test(
  "offline listening sync removes acknowledged events and retains the failed event",
  async () => {
    await withLocalStorageAsync(async () => {
      const events = [
        {
          eventId: createListeningEventId(),
          trackId: "track-1",
          listenedAt: "2026-11-23T20:00:00.000Z",
        },
        {
          eventId: createListeningEventId(),
          trackId: "track-2",
          listenedAt: "2026-11-23T20:01:00.000Z",
        },
      ];
      events.forEach((event) =>
        enqueueOfflineListeningEvent("owner-a", event),
      );
      const sent = [];
      const uploaded = await flushOfflineListeningEvents(
        "owner-a",
        async (_path, options) => {
          sent.push(JSON.parse(options.body));
          if (sent.length === 2) throw new Error("offline again");
          return { recorded: true };
        },
      );
      assert.equal(uploaded, 1);
      assert.equal(sent.length, 2);
      assert.equal(sent[0].event_id, events[0].eventId);
      assert.equal(sent[0].track_id, events[0].trackId);
      assert.equal(sent[0].listened_at, events[0].listenedAt);
      assert.deepEqual(readOfflineListeningEvents("owner-a"), [events[1]]);
    });
  },
);

async function withLocalStorageAsync(run) {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  try { await run(values); }
  finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}
