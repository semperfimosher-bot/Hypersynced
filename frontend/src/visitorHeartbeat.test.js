import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VISITOR_HEARTBEAT_MIN_INTERVAL_MS,
  shouldSendVisitorHeartbeat,
} from "./visitorHeartbeat.js";

describe("visitor heartbeat throttling", () => {
  it("allows the initial heartbeat", () => {
    assert.equal(shouldSendVisitorHeartbeat(0, 1000), true);
  });

  it("throttles repeated visibility-triggered heartbeats", () => {
    assert.equal(shouldSendVisitorHeartbeat(1000, 1001), false);
    assert.equal(
      shouldSendVisitorHeartbeat(1000, 1000 + VISITOR_HEARTBEAT_MIN_INTERVAL_MS - 1),
      false,
    );
  });

  it("allows the heartbeat after the configured interval", () => {
    assert.equal(
      shouldSendVisitorHeartbeat(1000, 1000 + VISITOR_HEARTBEAT_MIN_INTERVAL_MS),
      true,
    );
  });
});
