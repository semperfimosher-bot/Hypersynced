import test from "node:test";
import assert from "node:assert/strict";

import {
  getHomeRecentlyPlayed,
  getHomeRecentlyPlayedForOwner,
  writeCachedHomeRecentlyPlayed,
  notifyListeningHistoryChanged,
  subscribeListeningHistoryChanged,
  canRecordListeningHistory,
  shouldBeginListeningEvent,
} from "./homeRecentlyPlayed.js";

test("remembered sessions record history while their access token is refreshing", () => {
  assert.equal(canRecordListeningHistory(null, true), true);
  assert.equal(canRecordListeningHistory("token", false), true);
  assert.equal(canRecordListeningHistory(null, false), false);
});


test(
  "returns recently played tracks in backend order",
  () => {
    const profile = {
      recently_played: [
        { id: "3", title: "Third" },
        { id: "2", title: "Second" },
        { id: "1", title: "First" },
      ],
    };

    assert.deepEqual(
      getHomeRecentlyPlayed(profile),
      profile.recently_played,
    );
  },
);

test("accepts the focused recently played endpoint array directly", () => {
  const tracks = [
    { id: "newest", title: "Newest", play_count: 3 },
    { id: "older", title: "Older", play_count: 1 },
  ];
  assert.deepEqual(getHomeRecentlyPlayed(tracks), tracks);
});


test(
  "limits home recently played to twelve tracks",
  () => {
    const profile = {
      recently_played: Array.from(
        { length: 40 },
        (_, index) => ({
          id: String(index + 1),
        }),
      ),
    };

    assert.equal(
      getHomeRecentlyPlayed(
        profile,
      ).length,
      12,
    );
  },
);


test(
  "returns an empty list when there is no history",
  () => {
    assert.deepEqual(
      getHomeRecentlyPlayed(null),
      [],
    );

    assert.deepEqual(
      getHomeRecentlyPlayed({}),
      [],
    );
  },
);


test(
  "notifies active Home listeners when listening history changes",
  () => {
    const target =
      new EventTarget();

    let calls = 0;

    const unsubscribe =
      subscribeListeningHistoryChanged(
        () => {
          calls += 1;
        },
        target,
      );

    assert.equal(
      notifyListeningHistoryChanged(
        target,
      ),
      true,
    );

    assert.equal(
      calls,
      1,
    );

    unsubscribe();

    notifyListeningHistoryChanged(
      target,
    );

    assert.equal(
      calls,
      1,
    );
  },
);

 test("older history responses cannot overwrite newer playback or another account", async () => {
  const { isCurrentHistoryResponse } = await import("./homeRecentlyPlayed.js");
  assert.equal(isCurrentHistoryResponse(1, 2, "alice", "alice"), false);
  assert.equal(isCurrentHistoryResponse(2, 2, "alice", "bob"), false);
  assert.equal(isCurrentHistoryResponse(2, 2, "alice", "alice"), true);
});


test("recently played cache is account-scoped and bounded", async () => {
  const {
    readCachedHomeRecentlyPlayed,
    writeCachedHomeRecentlyPlayed,
  } = await import("./homeRecentlyPlayed.js");
  const values = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  try {
    const tracks = Array.from({ length: 15 }, (_, index) => ({
      id: String(index + 1),
      title: "Track " + (index + 1),
    }));
    assert.equal(writeCachedHomeRecentlyPlayed("user-a", tracks), true);
    assert.equal(readCachedHomeRecentlyPlayed("user-a").length, 12);
    assert.deepEqual(readCachedHomeRecentlyPlayed("user-b"), []);
    assert.equal(readCachedHomeRecentlyPlayed("user-a")[0].id, "1");
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test("recently played cache deduplicates tracks and tolerates blocked storage", async () => {
  const {
    readCachedHomeRecentlyPlayed,
    writeCachedHomeRecentlyPlayed,
  } = await import("./homeRecentlyPlayed.js");
  const values = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  try {
    assert.equal(writeCachedHomeRecentlyPlayed("user-c", [
      { id: 1, title: "First" },
      { id: "1", title: "Duplicate" },
      { id: 2, title: "Second" },
    ]), true);
    assert.deepEqual(
      readCachedHomeRecentlyPlayed("user-c").map((track) => track.id),
      [1, 2],
    );
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});


test("recently played immediately uses the active account cache without leaking the previous account", () => {
  const values = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };

  try {
    writeCachedHomeRecentlyPlayed("alice", [{ id: "a1", title: "Alice track" }]);
    writeCachedHomeRecentlyPlayed("bob", [{ id: "b1", title: "Bob track" }]);

    assert.deepEqual(
      getHomeRecentlyPlayedForOwner("alice", "alice", [{ id: "a2" }]),
      [{ id: "a2" }],
    );
    assert.deepEqual(
      getHomeRecentlyPlayedForOwner("bob", "alice", [{ id: "a2" }]),
      [{ id: "b1", title: "Bob track" }],
    );
    assert.deepEqual(
      getHomeRecentlyPlayedForOwner(null, "alice", [{ id: "a2" }]),
      [],
    );
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});


test("listening history counts a distinct track start, not pause/resume or buffering", () => {
  assert.equal(shouldBeginListeningEvent(null, "track-a"), true);
  assert.equal(shouldBeginListeningEvent("track-a", "track-a"), false);
  assert.equal(shouldBeginListeningEvent("track-a", "track-b"), true);
  assert.equal(shouldBeginListeningEvent("track-a", null), false);
  assert.equal(shouldBeginListeningEvent(42, "42"), false);
});

test("optimistic playback moves a track to the front and increments its play count", async () => {
  const { applyOptimisticRecentlyPlayed } = await import("./homeRecentlyPlayed.js");
  const current = [
    { id: "old", title: "Older", play_count: 3 },
    { id: "song", title: "Song", artist: "Artist", play_count: 4 },
  ];
  const next = applyOptimisticRecentlyPlayed(current, {
    id: "song",
    title: "Song",
    artist: "Artist",
    artworkUrl: "/art/song.jpg",
  });
  assert.deepEqual(next.map((track) => track.id), ["song", "old"]);
  assert.equal(next[0].play_count, 5);
  assert.equal(next[0].artwork_url, "/art/song.jpg");
  assert.equal(next[0].last_played_at.length > 0, true);
});

test("listening history notifications carry optimistic playback details", () => {
  const target = new EventTarget();
  let received = null;
  target.addEventListener("hypersynced:listening-history-changed", (event) => {
    received = event.detail;
  });
  assert.equal(
    notifyListeningHistoryChanged(
      { type: "optimistic-play", track: { id: "song" } },
      target,
    ),
    true,
  );
  assert.deepEqual(received, {
    type: "optimistic-play",
    track: { id: "song" },
  });
});

test("recently played snapshot survives a page-module reload and omits playable URLs", async () => {
  const values = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  try {
    writeCachedHomeRecentlyPlayed("reload-user", [
      { id: "track-1", title: "Saved", audio_url: "https://private.example/audio", src: "blob:temporary" },
    ]);
    const reloaded = await import("./homeRecentlyPlayed.js?reload=recent-cache");
    const tracks = reloaded.readCachedHomeRecentlyPlayed("reload-user");
    assert.equal(tracks[0].id, "track-1");
    assert.equal("audio_url" in tracks[0], false);
    assert.equal("src" in tracks[0], false);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});


test("recently played cache expires after seven days and rejects future timestamps", async () => {
  const { readCachedHomeRecentlyPlayed, writeCachedHomeRecentlyPlayed } = await import("./homeRecentlyPlayed.js");
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const savedAt = 1_000_000;
  try {
    writeCachedHomeRecentlyPlayed("cache-expiry-user", [{ id: "old" }], 12, savedAt);
    assert.equal(readCachedHomeRecentlyPlayed("cache-expiry-user", 12, savedAt + 1)[0].id, "old");
    assert.deepEqual(readCachedHomeRecentlyPlayed("cache-expiry-user", 12, savedAt + 7 * 24 * 60 * 60 * 1000 + 1), []);
    writeCachedHomeRecentlyPlayed("cache-future-user", [{ id: "future" }], 12, savedAt + 120_000);
    assert.deepEqual(readCachedHomeRecentlyPlayed("cache-future-user", 12, savedAt), []);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});


test("recent-history cache changes from another tab notify owner-scoped listeners", async () => {
  const { RECENT_CACHE_PREFIX, subscribeListeningHistoryChanged } = await import("./homeRecentlyPlayed.js");
  const target = new EventTarget();
  let received = null;
  const unsubscribe = subscribeListeningHistoryChanged((event) => { received = event.detail; }, target);
  try {
    const storageEvent = new Event("storage");
    Object.defineProperty(storageEvent, "key", { value: RECENT_CACHE_PREFIX + encodeURIComponent("owner-z") });
    target.dispatchEvent(storageEvent);
    assert.deepEqual(received, { type: "cache-updated", owner: "owner-z" });
  } finally {
    unsubscribe();
  }
});
