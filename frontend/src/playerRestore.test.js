import assert from "node:assert/strict";
import test from "node:test";

test("a reopened player ignores legacy browser playback state and waits for Neon restore", async () => {
  const originalAudioDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

  class RestoreTestAudio extends EventTarget {
    paused = true;
    currentTime = 0;
    duration = 120;
    volume = 1;
    muted = false;
    readyState = 1;
    src = "";
    preload = "";
    crossOrigin = "";
    get currentSrc() { return this.src; }
    getAttribute(name) { return name === "src" ? this.src : null; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
    load() {}
    pause() { this.paused = true; }
    async play() { this.paused = false; }
  }

  globalThis.Audio = RestoreTestAudio;
  globalThis.window = {
    localStorage: {
      getItem() {
        return JSON.stringify({
          trackId: "stale-browser-track",
          meta: { audioUrl: "https://media.example.test/stale.mp3", title: "Stale" },
          currentTime: 47.25,
          volume: 0.42,
        });
      },
      setItem() {},
      removeItem() {},
    },
    location: { origin: "https://app.example.test" },
  };

  let player;
  try {
    player = await import(`./audioPlayer.js?neon-restore=${Date.now()}-${Math.random()}`);
    player.setPlaybackPersistenceOwner("restore-test-user");
    const state = player.getState();
    assert.equal(state.trackId, null);
    assert.equal(state.currentTime, 0);
    assert.equal(state.volume, 1);
    assert.equal(state.paused, true);
    assert.equal(player._getAudioElement().currentSrc, "");

    const cached = player.restoreCachedTrackMetadata(
      {
        id: "cached-track",
        title: "Cached Song",
        artist: "Cached Artist",
        album: "Cached Album",
        artwork_url: "/api/catalog/tracks/cached-track/artwork",
        media_version: "cached-v1",
        mime_type: "audio/mpeg",
        file_size: 4096,
      },
      38.5,
    );
    assert.equal(cached.trackId, "cached-track");
    assert.equal(cached.title, "Cached Song");
    assert.equal(cached.artist, "Cached Artist");
    assert.equal(cached.album, "Cached Album");
    assert.equal(cached.currentTime, 38.5);
    assert.equal(cached.paused, true);
    assert.equal(cached.src, null);
    assert.equal(player._getAudioElement().currentSrc, "");
    assert.equal(player.getState().mediaVersion, "cached-v1");

    // Some browser refresh restores fire "playing" while currentTime still
    // points at the stale/end value. The bar must keep the saved value and
    // force the media clock back to it until a matching seeked event arrives.
    player._getAudioElement().dispatchEvent(new Event("playing"));
    assert.equal(player._getAudioElement().currentTime, 38.5);
    assert.equal(player.getState().currentTime, 38.5);

    // Regression: a browser may subsequently report the end-of-track clock
    // after restore. The fallback must remain visible and force the clock back.
    const restoredAudio = player._getAudioElement();
    restoredAudio.currentTime = 119.8;
    restoredAudio.dispatchEvent(new Event("timeupdate"));
    assert.equal(restoredAudio.currentTime, 38.5);
    assert.equal(player.getState().currentTime, 38.5);

    // A seeked event alone cannot release the fallback. It only releases after
    // playback is active and the live clock has progressed from the saved point.
    restoredAudio.dispatchEvent(new Event("seeked"));
    assert.equal(player.getState().currentTime, 38.5);
    restoredAudio.paused = false;
    restoredAudio.currentTime = 39.0;
    restoredAudio.dispatchEvent(new Event("timeupdate"));
    assert.equal(player.getState().currentTime, 39.0);

    // A deliberate seek must replace the saved-position fallback shown by the UI.
    player.seekTo(12);
    assert.equal(player._getAudioElement().currentTime, 12);

  } finally {
    player?.stopTrack();
    if (originalAudioDescriptor) Object.defineProperty(globalThis, "Audio", originalAudioDescriptor);
    else delete globalThis.Audio;
    if (originalWindowDescriptor) Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    else delete globalThis.window;
  }
});
