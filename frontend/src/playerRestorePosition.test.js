import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldCorrectRestoredPlaybackClock,
  shouldReleaseRestoredPosition,
  isRestoredClockProgressing,
} from "./playerRestorePosition.js";

test("zero-position restore corrects stale clocks and releases after real progress", () => {
  assert.equal(shouldCorrectRestoredPlaybackClock(0, 119.8, 120), true);
  assert.equal(shouldCorrectRestoredPlaybackClock(0, 2.0, 120), false);
  assert.equal(shouldReleaseRestoredPosition(0, 0, false, 120), false);
  assert.equal(shouldReleaseRestoredPosition(0, 0.5, false, 120), true);
  assert.equal(isRestoredClockProgressing(0, 0.5, 0, 120), true);
  assert.equal(isRestoredClockProgressing(0, 119.8, 0, 120), false);
});

test("restore clock correction catches end jumps without fighting normal playback", () => {
  assert.equal(shouldCorrectRestoredPlaybackClock(38.5, 119.8, 120), true);
  assert.equal(shouldCorrectRestoredPlaybackClock(38.5, 0, 120), true);
  assert.equal(shouldCorrectRestoredPlaybackClock(38.5, 39.2, 120), false);
  assert.equal(shouldCorrectRestoredPlaybackClock(116, 119.8, 120), true);
  assert.equal(shouldCorrectRestoredPlaybackClock(119, 120, 120), false);
});

test("restored position stays authoritative until live playback advances near it", () => {
  assert.equal(shouldReleaseRestoredPosition(38.5, 38.5, false, 120), false);
  assert.equal(shouldReleaseRestoredPosition(38.5, 119.8, false, 120), false);
  assert.equal(shouldReleaseRestoredPosition(38.5, 39.0, true, 120), false);
  assert.equal(shouldReleaseRestoredPosition(38.5, 39.0, false, 120), true);
  assert.equal(shouldReleaseRestoredPosition(116, 119.8, false, 120), true);
});


test("restored clock release requires small, consecutive forward progress", () => {
  assert.equal(isRestoredClockProgressing(38.5, 39.0, 38.5, 120), true);
  assert.equal(isRestoredClockProgressing(38.5, 43.0, 38.5, 120), false);
  assert.equal(isRestoredClockProgressing(38.5, 40.5, 38.5, 120), false);
  assert.equal(isRestoredClockProgressing(38.5, 38.4, 38.5, 120), false);
  assert.equal(isRestoredClockProgressing(116.0, 116.5, 116.0, 120), true);
});
