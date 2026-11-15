import test from "node:test";
import assert from "node:assert/strict";

import { getMyRecentlyPlayed } from "./profileApi.js";

test("Home recently played uses the focused Neon endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  const tracks = [{ id: "track-1", title: "First play" }];

  globalThis.fetch = async (url, options) => {
    requested.push({ url: String(url), options });
    return new Response(JSON.stringify(tracks), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    assert.deepEqual(await getMyRecentlyPlayed(), tracks);
    assert.equal(requested.length, 1);
    assert.equal(requested[0].url, "/api/users/me/recently-played");
    assert.equal(requested[0].options?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
