import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The complete app shell renders immediately; Neon state hydrates it in the background.
test("app shell renders page and player while database state restores", () => {
  const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const sync = readFileSync(new URL("./accountPlayback.js", import.meta.url), "utf8");
  assert.match(source, /accountStateReady/);
  assert.doesNotMatch(source, /Restoring your account from the database/);
  assert.match(source, /<MainPage/);
  assert.match(source, /<PlayerBar/);
  assert.match(source, /void restoreSavedAppView/);
  assert.match(source, /setCurrentUser\\(user\\);[\\s\\S]*?void restoreSavedAppView/);
  assert.match(sync, /onInitialRestoreComplete/);
  assert.match(sync, /void player\.restoreTrackPaused/);
  assert.doesNotMatch(sync, /await player\.restoreTrackPaused/);
});

test("app shell restores and persists account playback through the existing API", () => {
  const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const sync = readFileSync(new URL("./accountPlayback.js", import.meta.url), "utf8");
  assert.match(source, /bindAccountPlayback/);
  assert.match(source, /accountPlayback/);
  assert.match(sync, /\/users\/me\/playback-state/);
  assert.match(sync, /player\.setPlaybackPersistenceOwner/);
  assert.match(sync, /expected_playback_updated_at/);
  assert.doesNotMatch(sync, /pagehide|save\(true,\s*true\)/);
  assert.doesNotMatch(source, /playbackDevices|playbackRemoteCommands|playback-devices|setRemotePlaybackController/);
});

test("app view is restored and persisted only through the account database API", () => {
  const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /persistedAppView|readPersistedAppView|writePersistedAppView|localStorage/);
  assert.match(source, /\/users\/me\/app-state/);
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /expected_updated_at/);
});

test("playback state is restored only from Neon, never from persistent browser storage", () => {
  const player = readFileSync(new URL("./audioPlayer.js", import.meta.url), "utf8");
  assert.match(player, /setPlaybackPersistenceOwner/);
  assert.match(player, /restoreTrackPaused/);
  assert.doesNotMatch(player, /playerPersistence|PersistedPlayerState|localStorage|sessionStorage/);
});

class TestAudio extends EventTarget {
  paused = true;
  currentTime = 0;
  duration = 120;
  readyState = 1;
  volume = 1;
  muted = false;
  src = "";
  get currentSrc() { return this.src; }
  pause() { this.paused = true; }
  async play() { this.paused = false; }
  load() {}
  removeAttribute(name) { if (name === "src") this.src = ""; }
}

globalThis.Audio = TestAudio;
const player = await import("./audioPlayer.js");

test("player exposes only local control, with no remote injection or Jam callback", () => {
  for (const name of ["setRemotePlaybackController", "setJamTrackEndedController", "restoreAccountPlayback", "restoreAccountPlaybackQueue", "syncAccountPlaybackShadow"]) {
    assert.equal(name in player, false, name);
  }
});

test("automatic offline retention starts only after the audio element emits playing", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response("[]", { headers: { "Content-Type": "application/json" } }),
  );

  const mediaStore = await import("./mediaStore.js");
  const trackId = "retention-event-track";
  const mediaVersion = "retention-event-version";

  await player.playTrack(trackId, {
    title: "Retention event",
    artist: "Test",
    audioUrl: "https://example.invalid/retention-event.mp3",
    mediaVersion,
    mimeType: "audio/mpeg",
    fileSize: 1024,
  });

  const beforePlaying = await mediaStore.getMediaRecord(trackId, mediaVersion);
  assert.equal(beforePlaying, null, "selecting a track must not start retention");

  player._getAudioElement().dispatchEvent(new Event("playing"));

  let played = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    played = await mediaStore.getMediaRecord(trackId, mediaVersion);
    if (played?.lastPlayedAt !== null && played?.lastPlayedAt !== undefined) break;
  }

  assert.ok(Number.isSafeInteger(played?.lastPlayedAt));
  assert.ok(Number.isSafeInteger(played?.expiresAt));
  assert.equal(played.expiresAt, played.lastPlayedAt + mediaStore.MEDIA_EXPIRY_MS);
  player.stopTrack();
});


test("database restore reapplies the saved position to an already-loaded track and pauses it", async () => {
  const trackId = "restore-same-loaded-track";
  await player.playTrack(trackId, {
    title: "Restored track",
    artist: "Test",
    audioUrl: "https://example.invalid/restored-track.mp3",
  });

  const audio = player._getAudioElement();
  audio.currentTime = 73;
  audio.paused = false;

  await player.restoreTrackPaused({
    id: trackId,
    title: "Restored track",
    artist: "Test",
    audio_url: "https://example.invalid/restored-track.mp3",
  }, 18);

  assert.equal(audio.currentTime, 18, "Neon position must replace the stale in-memory position");
  assert.equal(audio.paused, true, "database restoration must never continue local playback");
  assert.equal(player.getState().phase, "paused");
  player.stopTrack();
});

test("seek, volume and pause change the local audio element", () => {
  const audio = player._getAudioElement();
  audio.src = "https://example.invalid/test.mp3";
  audio.paused = false;
  player.seekTo(47);
  player.setVolume(0.35);
  player.pausePlayback();
  assert.equal(audio.currentTime, 47);
  assert.equal(audio.volume, 0.35);
  assert.equal(audio.paused, true);
  player.stopTrack();
});

test("local queue plays, advances on track end, and supports previous and next", async (t) => {
  // Only the autoplay recommendation request needs HTTP. Audio playback and
  // queue transitions below use the real player with a browser Audio stand-in.
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    return new Response("[]", { headers: { "Content-Type": "application/json" } });
  });
  const tracks = [
    { id: "first-local-track", title: "First", audioUrl: "https://example.invalid/first.mp3" },
    { id: "second-local-track", title: "Second", audioUrl: "https://example.invalid/second.mp3" },
  ];
  await player.playTrackQueue(tracks);
  assert.equal(player.getState().trackId, tracks[0].id);
  assert.equal(player._getAudioElement().paused, false);
  player._getAudioElement().dispatchEvent(new Event("ended"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(player.getState().trackId, tracks[1].id);
  player.seekTo(0);
  await player.skipToPrevious();
  assert.equal(player.getState().trackId, tracks[0].id);
  await player.skipToNext();
  assert.equal(player.getState().trackId, tracks[1].id);
  assert.equal(player.getState().queue.length, 2);
  assert.equal(requests.some((url) => /playback-devices|playback-state|jams/.test(url)), false);
  player.stopTrack();
});
