import assert from "node:assert/strict";
import test from "node:test";

import {
  filterOfflinePlayableTracks,
  isOfflineUnavailableTrack,
} from "./offlinePlayability.js";

const tracks = [
  { id: "a", title: "Downloaded" },
  { id: "b", title: "Not downloaded" },
  { id: "c", title: "Downloaded too" },
];
const downloaded = new Set(["a", "c"]);

test("keeps the full collection playable online", () => {
  assert.deepEqual(filterOfflinePlayableTracks(tracks, true, downloaded), tracks);
});

test("only queues downloaded tracks offline", () => {
  assert.deepEqual(filterOfflinePlayableTracks(tracks, false, downloaded), [
    tracks[0],
    tracks[2],
  ]);
});

test("does not treat downloaded status as unavailable online", () => {
  assert.equal(isOfflineUnavailableTrack(tracks[1], false, downloaded), false);
});

test("marks only un-downloaded tracks unavailable offline", () => {
  assert.equal(isOfflineUnavailableTrack(tracks[0], true, downloaded), false);
  assert.equal(isOfflineUnavailableTrack(tracks[1], true, downloaded), true);
});

test("returns no tracks offline when nothing is downloaded", () => {
  assert.deepEqual(filterOfflinePlayableTracks(tracks, false, new Set()), []);
});

test("supports string ids and stringifies downloaded ids", () => {
  assert.deepEqual(
    filterOfflinePlayableTracks(
      [{ id: 5 }, { id: "6" }],
      false,
      new Set(["5"]),
    ),
    [{ id: 5 }],
  );
});
