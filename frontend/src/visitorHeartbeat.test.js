import { describe, it } from "node:test";
import fs from "node:fs";
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

describe("app heartbeat coordination", () => {
  const appSource = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  it("persists a shared heartbeat timestamp so tabs throttle each other", () => {
    assert.match(appSource, /hs-visitor-heartbeat-last-at/);
    assert.match(appSource, /localStorage\.getItem\(heartbeatStorageKey\)/);
    assert.match(appSource, /localStorage\.setItem\(heartbeatStorageKey, String\(now\)\)/);
    assert.match(appSource, /setInterval\(sendHeartbeat, 300_000\)/);
    assert.equal(VISITOR_HEARTBEAT_MIN_INTERVAL_MS, 300_000);
  });
});
