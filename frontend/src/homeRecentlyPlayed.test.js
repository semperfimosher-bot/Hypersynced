import test from "node:test";
import assert from "node:assert/strict";

import {
  getHomeRecentlyPlayed,
  notifyListeningHistoryChanged,
  subscribeListeningHistoryChanged,
  canRecordListeningHistory,
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
