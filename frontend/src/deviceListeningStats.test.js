import test from "node:test";
import assert from "node:assert/strict";
import { readDeviceListeningStats, readDevicePlayedHistory, recordDevicePlayback } from "./deviceListeningStats.js";

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


test("device play starts update local history immediately with per-track play counts", () => {
  withStorage(() => {
    const owner = "device-history-user";
    const loadingState = { trackId: "song-a", paused: true, phase: "loading", currentTime: 0, title: "Song A", artist: "Artist A", album: "Album A", genre: "pop", releaseYear: 2025, artworkUrl: "art-a", audioUrl: "audio-a" };
    const first = recordDevicePlayback(owner, { ...loadingState, paused: false, phase: "playing" }, loadingState);
    let history = readDevicePlayedHistory(owner);
    assert.equal(first.tracksPlayed, 1);
    assert.equal(history.length, 1);
    assert.equal(history[0].title, "Song A");
    assert.equal(history[0].artist, "Artist A");
    assert.equal(history[0].play_count, 1);
    assert.equal(history[0].audio_url, "audio-a");
    assert.equal(history[0].genre, "pop");
    assert.equal(history[0].release_year, 2025);

    const nextLoading = { ...loadingState, trackId: "song-b", title: "Song B", artist: "Artist B" };
    recordDevicePlayback(owner, { ...nextLoading, paused: false, phase: "playing" }, loadingState);
    recordDevicePlayback(owner, { ...loadingState, paused: false, phase: "playing" }, nextLoading);
    history = readDevicePlayedHistory(owner);
    assert.deepEqual(history.map((track) => track.id), ["song-a", "song-b"]);
    assert.equal(history.find((track) => track.id === "song-a").play_count, 2);
    assert.equal(history.find((track) => track.id === "song-b").play_count, 1);
  });
});
