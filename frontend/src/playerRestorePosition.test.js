import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldCorrectRestoredPlaybackClock,
  shouldReleaseRestoredPosition,
} from "./playerRestorePosition.js";

test("restore clock correction catches end jumps without fighting normal playback", () => {
  assert.equal(shouldCorrectRestoredPlaybackClock(38.5, 119.8, 120), true);
  assert.equal(shouldCorrectRestoredPlaybackClock(38.5, 0, 120), true);
  assert.equal(shouldCorrectRestoredPlaybackClock(38.5, 39.2, 120), false);
  assert.equal(shouldCorrectRestoredPlaybackClock(116, 119.8, 120), false);
});

test("restored position stays authoritative until live playback advances near it", () => {
  assert.equal(shouldReleaseRestoredPosition(38.5, 38.5, false, 120), false);
  assert.equal(shouldReleaseRestoredPosition(38.5, 119.8, false, 120), false);
  assert.equal(shouldReleaseRestoredPosition(38.5, 39.0, true, 120), false);
  assert.equal(shouldReleaseRestoredPosition(38.5, 39.0, false, 120), true);
  assert.equal(shouldReleaseRestoredPosition(116, 119.8, false, 120), true);
});
