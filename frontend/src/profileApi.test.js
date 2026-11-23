import test from "node:test";
import assert from "node:assert/strict";

import { getMyRecentlyPlayed } from "./profileApi.js";

test("Home recently played uses the focused Neon endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  const tracks = [{ id: "track-1", title: "First play" }];

  globalThis.fetch = async (url, options) => {
    const request = { url: String(url), options };
    requested.push(request);

    if (request.url === "/api/auth/refresh") {
      return new Response(JSON.stringify({
        access_token: "test-access-token",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(tracks), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    assert.deepEqual(await getMyRecentlyPlayed(), tracks);
    const recentRequests = requested.filter(
      (request) => request.url === "/api/users/me/recently-played",
    );
    assert.equal(recentRequests.length, 1);
    assert.equal(recentRequests[0].options?.cache, "no-store");
    assert.ok(requested.some(
      (request) => request.url === "/api/auth/refresh",
    ));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
