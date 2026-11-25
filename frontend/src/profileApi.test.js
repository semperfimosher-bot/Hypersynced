import test from "node:test";
import assert from "node:assert/strict";

import { getMyRecentlyPlayed, getSuggestedMusic, searchUsers } from "./profileApi.js";

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


test("Find People supports the empty-query active user directory", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  const people = [{ username: "listener", display_name: "Listener" }];

  globalThis.fetch = async (url, options) => {
    const request = { url: String(url), options };
    requested.push(request);
    if (request.url === "/api/auth/refresh") {
      return new Response(JSON.stringify({ access_token: "test-access-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(people), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    assert.deepEqual(await searchUsers(""), people);
    assert.ok(requested.some((request) => request.url === "/api/users/search?q="));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Find New Tunes requests authenticated personalized autoplay suggestions", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  const tracks = [{ id: "recommended-track", title: "Recommended" }];

  globalThis.fetch = async (url, options) => {
    const request = { url: String(url), options };
    requested.push(request);
    if (request.url === "/api/auth/refresh") {
      return new Response(JSON.stringify({ access_token: "test-access-token" }), {
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
    assert.deepEqual(await getSuggestedMusic({
      currentTrackId: "context-track",
      contextTrackIds: ["context-track"],
      excludeTrackIds: ["context-track"],
      limit: 40,
      homeExplore: false,
    }), tracks);
    const request = requested.find((item) => item.url === "/api/recommendations/autoplay");
    assert.ok(request);
    assert.equal(request.options?.method, "POST");
    assert.deepEqual(JSON.parse(request.options.body), {
      current_track_id: "context-track",
      exclude_track_ids: ["context-track"],
      context_track_ids: ["context-track"],
      limit: 40,
      home_explore: false,
      never_played_only: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
