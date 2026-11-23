import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeRecentlyPlayedWithOptimisticCache } from "./homeRecentlyPlayed.js";

// Local player/app state is browser-scoped; the account DB only receives listening events.
test("app shell and playback restore from local snapshots without cross-device state API calls", () => {
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const sync = readFileSync(new URL("./accountPlayback.js", import.meta.url), "utf8");
  assert.match(app, /accountStateReady/);
  assert.match(app, /<MainPage/);
  assert.match(app, /<PlayerBar/);
  assert.ok(sync.includes("device-playback.v2"));
  assert.match(sync, /restoreCachedTrackMetadata/);
  assert.doesNotMatch(sync, /restoreTrackPaused/);
  assert.doesNotMatch(sync, /setInterval/);
  assert.doesNotMatch(sync, /apiRequest|playback-state|expected_playback_updated_at/);
  assert.ok(!app.includes("/users/me/app-state"));
  assert.ok(!app.includes("appStateSaveQueueRef"));
  assert.ok(!app.includes("appStateVersionRef"));
  assert.doesNotMatch(app, /<Activity|warmPages|warmPageKey|PAGE_WARM_SWEEP_MS/);
  assert.match(app, /renderPage\(activePage, profileUsername\)/);
});

test("upcoming audio and playlist artwork warm before transitions", () => {
  const source = readFileSync(new URL("./audioPlayer.js", import.meta.url), "utf8");
  assert.match(source, /remaining > 5/);
  assert.match(source, /warmQueuedAudioEntry\(nextEntry/);
  assert.match(source, /playbackPhase !== "loading"/);
  assert.match(source, /setPlaybackPhase\("loading"\)/);
});

test("listening progress is checkpointed only when a page becomes hidden or exits", () => {
  const source = readFileSync(new URL("./audioPlayer.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /saveListeningProgress/);
  assert.match(source, /function saveListeningCheckpoint/);
  assert.match(source, /if \(hidden\) \{\s*sampleListeningProgress\(\);\s*void saveListeningCheckpoint\(true\);/);
  assert.match(source, /if \(event\.checkpointPromise\) \{\s*await event\.checkpointPromise;\s*\}/);
  assert.match(source, /finishListeningEvent/);
});

test("recently played retains owner cache while the server history is empty", () => {
  const cached = [{ id: "cached-track", last_played_at: "2026-11-21T16:00:00Z" }];
  assert.deepEqual(mergeRecentlyPlayedWithOptimisticCache([], cached), cached);
  assert.deepEqual(mergeRecentlyPlayedWithOptimisticCache([], []), []);
  const server = [{ id: "server-track", last_played_at: "2026-11-21T15:00:00Z" }];
  assert.deepEqual(mergeRecentlyPlayedWithOptimisticCache(server, []), server);
  const newerCache = [{ id: "new-local-track", last_played_at: "2026-11-21T17:00:00Z" }];
  assert.deepEqual(mergeRecentlyPlayedWithOptimisticCache(server, newerCache), [...newerCache, ...server]);
  const olderCache = [{ id: "stale-track", last_played_at: "2026-11-21T14:00:00Z" }];
  assert.deepEqual(mergeRecentlyPlayedWithOptimisticCache(server, olderCache), server);
});

test("Home Recently Played is device-local and reacts to local playback events", () => {
  const home = readFileSync(new URL("./components/pages/HomePage.jsx", import.meta.url), "utf8");
  assert.match(home, /readCachedHomeRecentlyPlayed\(recentOwner\)/);
  assert.match(home, /subscribeListeningHistoryChanged/);
  assert.match(home, /applyOptimisticRecentlyPlayed\(cached, detail\.track, 12/);
  assert.match(home, /writeCachedHomeRecentlyPlayed\(recentOwner, instant\)/);
  assert.doesNotMatch(home, /getMyRecentlyPlayed|mergeRecentlyPlayedWithOptimisticCache|recently-played/);
});

test("Profile Recently Played is device-local while account analytics remain sourced from profile API", () => {
  const profile = readFileSync(new URL("./components/pages/ProfilePage.jsx", import.meta.url), "utf8");
  assert.match(profile, /readCachedHomeRecentlyPlayed\(recentOwner\)/);
  assert.match(profile, /subscribeListeningHistoryChanged/);
  assert.match(profile, /applyOptimisticRecentlyPlayed\(cachedTracks, detail\.track, 12/);
  assert.match(profile, /writeCachedHomeRecentlyPlayed\(recentOwner, next\)/);
  assert.match(profile, /recentTracks\.map/);
  assert.doesNotMatch(profile, /getMyRecentlyPlayed|mergeRecentlyPlayedWithOptimisticCache|useQuietRefresh|profile\??\.recently_played/);
  assert.match(profile, /profile\?\.tracks_played/);
});

test("Total Played opens the dedicated full-page account listening history", () => {
  const profile = readFileSync(new URL("./components/pages/ProfilePage.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("./components/pages/TotalPlayedPage.jsx", import.meta.url), "utf8");
  assert.match(profile, /label="Total Played"[\s\S]*?onClick=\{\(\) => onNavigate\?\.\("total-played"\)\}/);
  assert.ok(app.includes('page === "total-played"'));
  assert.ok(page.includes("YOUR LISTENING HISTORY"));
  assert.ok(page.includes("most recently played at the top"));
  assert.ok(page.includes("getMyTotalPlayed"));
  assert.ok(page.includes("LAST PLAYED"));
  assert.ok(page.includes("PLAYS"));
  assert.ok(page.includes("IntersectionObserver"));
  assert.ok(page.includes("hs-total-played-scroll-sentinel"));
  assert.ok(page.includes("rootMargin: \"1400px 0px\""));
  assert.ok(!page.includes("Load more"));
  assert.ok(page.includes("Retry loading history"));
  assert.ok(page.includes("TrackActionMenu"));
  assert.ok(profile.includes("profile?.tracks_played"));
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
