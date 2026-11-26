import test from "node:test";
import assert from "node:assert/strict";
import { readDeviceListeningStats, recordDevicePlayback } from "./deviceListeningStats.js";

function withStorage(run) {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try { run(); } finally { globalThis.localStorage = original; }
}

test("device listening counters count starts and bounded playback deltas", () => {
  withStorage(() => {
    const owner = "device-user";
    const first = recordDevicePlayback(owner, { trackId: "t1", paused: false, currentTime: 0 }, null);
    const next = recordDevicePlayback(owner, { trackId: "t1", paused: false, currentTime: 1.5 }, { trackId: "t1", currentTime: 0 });
    const skipped = recordDevicePlayback(owner, { trackId: "t1", paused: false, currentTime: 25 }, { trackId: "t1", currentTime: 1.5 });
    const secondTrack = recordDevicePlayback(owner, { trackId: "t2", paused: false, currentTime: 0 }, { trackId: "t1", currentTime: 25 });
    assert.deepEqual(first, { tracksPlayed: 1, listenedSeconds: 0 });
    assert.equal(next.listenedSeconds, 1.5);
    assert.equal(skipped.listenedSeconds, 4.5);
    assert.deepEqual(secondTrack, { tracksPlayed: 2, listenedSeconds: 4.5 });
    assert.deepEqual(readDeviceListeningStats(owner), secondTrack);
  });
});
