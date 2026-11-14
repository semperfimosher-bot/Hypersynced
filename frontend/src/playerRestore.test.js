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
  } finally {
    player?.stopTrack();
    if (originalAudioDescriptor) Object.defineProperty(globalThis, "Audio", originalAudioDescriptor);
    else delete globalThis.Audio;
    if (originalWindowDescriptor) Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    else delete globalThis.window;
  }
});
