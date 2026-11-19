import assert from "node:assert/strict";
import test from "node:test";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("cached app view restores saved page but not search query", async () => {
  globalThis.localStorage = createStorage();
  const cache = await import(`./appViewCache.js?test=${Date.now()}`);
  assert.equal(cache.writeCachedAppView("user-1", {
    active_page: "search",
    search_query: "private search term",
    profile_username: "",
  }, "user", 1000), true);
  assert.deepEqual(cache.readCachedAppView("user-1", "user", 2000), {
    activePage: "search",
    searchQuery: "",
    profileUsername: "",
  });
  assert.equal(localStorage.getItem("hypersynced_app_view_v1:user-1").includes("private search term"), false);
});

test("cached app view preserves valid public profile route", async () => {
  globalThis.localStorage = createStorage();
  const cache = await import(`./appViewCache.js?public=${Date.now()}`);
  cache.writeCachedAppView("user-2", {
    active_page: "public-profile",
    profile_username: "ArtistFriend",
  }, "user", 1000);
  assert.equal(cache.readCachedAppView("user-2", "user", 1001).profileUsername, "ArtistFriend");
});

test("cached app view rejects admin route for non-admin users", async () => {
  globalThis.localStorage = createStorage();
  const cache = await import(`./appViewCache.js?role=${Date.now()}`);
  cache.writeCachedAppView("user-3", { active_page: "admin", profile_username: "" }, "admin", 1000);
  assert.equal(cache.readCachedAppView("user-3", "user", 1001).activePage, "home");
});

test("cached app view expires and malformed data is safely ignored", async () => {
  globalThis.localStorage = createStorage();
  const cache = await import(`./appViewCache.js?expiry=${Date.now()}`);
  cache.writeCachedAppView("user-4", { active_page: "library" }, "user", 1000);
  assert.equal(cache.readCachedAppView("user-4", "user", 1000 + 31 * 86400000), null);
  localStorage.setItem("hypersynced_app_view_v1:user-4", "invalid json");
  assert.equal(cache.readCachedAppView("user-4", "user", 1001), null);
});

test("cached app view storage errors do not throw", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new DOMException("Blocked", "SecurityError"); },
  });
  try {
    const cache = await import(`./appViewCache.js?blocked=${Date.now()}`);
    assert.equal(cache.writeCachedAppView("user-5", { active_page: "home" }), false);
    assert.equal(cache.readCachedAppView("user-5"), null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});
