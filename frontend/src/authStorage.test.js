import assert from "node:assert/strict";
import test from "node:test";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
}

test("legacy auth tokens are cleared but account playback caches and identity persist", async () => {
  globalThis.localStorage = createStorage({
    hypersync_access_token: "old-token",
    hypersync_session_active: "true",
    hypersync_remember_me: "true",
    hypersync_user_profile: JSON.stringify({ id: "old-user", username: "listener" }),
    "hypersync-library-v1:old-user": "{}",
    "hypersync_player_state_v2:old-user": "{}",
    "hypersync-home-recent-v1:old-user": "[]",
    "hypersync:playlist-pins-v1:old-user": "[]",
  });
  globalThis.sessionStorage = createStorage({
    hypersync_access_token: "old-session-token",
    hypersync_session_active: "true",
  });

  const storage = await import(`./api/storage.js?cache-safe=${Date.now()}`);

  for (const key of [
    "hypersync_access_token",
    "hypersync_session_active",
    "hypersync_remember_me",
  ]) assert.equal(localStorage.getItem(key), null, key);
  for (const key of [
    "hypersync-library-v1:old-user",
    "hypersync_player_state_v2:old-user",
    "hypersync-home-recent-v1:old-user",
    "hypersync:playlist-pins-v1:old-user",
  ]) assert.notEqual(localStorage.getItem(key), null, key);
  assert.notEqual(localStorage.getItem("hypersync_user_profile"), null);
  assert.equal(storage.readCachedUserProfile().id, "old-user");
  assert.equal(sessionStorage.getItem("hypersync_access_token"), null);
  assert.equal(sessionStorage.getItem("hypersync_session_active"), null);

  storage.saveAuthSession("live-memory-token");
  assert.equal(storage.getAccessToken(), "live-memory-token");
  assert.equal(storage.hasStoredSession(), true);
  assert.equal(localStorage.length, 5);
  assert.equal(sessionStorage.length, 0);

  storage.cacheUserProfile({ id: "user-1", username: "listener", display_name: "Listener", access_token: "must-not-save" });
  assert.equal(storage.readCachedUserProfile().id, "user-1");
  assert.equal(localStorage.length, 5);
  assert.equal(sessionStorage.length, 0);
  assert.equal(localStorage.getItem("hypersync_user_profile").includes("must-not-save"), false);

  storage.clearAuthSession();
  assert.equal(storage.getAccessToken(), null);
  assert.equal(storage.hasStoredSession(), false);
  assert.equal(storage.readCachedUserProfile(), null);
  assert.equal(localStorage.getItem("hypersync_user_profile"), null);
  assert.equal(localStorage.length, 4);
});

test("legacy remember-me flag is cleared from persistent storage on startup", async () => {
  globalThis.localStorage = createStorage({ hypersync_remember_me: "true" });
  globalThis.sessionStorage = createStorage();
  await import(`./api/storage.js?legacy-remember=${Date.now()}`);
  assert.equal(localStorage.getItem("hypersync_remember_me"), null);
});

test("session restoration always checks the HttpOnly refresh cookie", async () => {
  globalThis.localStorage = createStorage();
  globalThis.sessionStorage = createStorage();
  const storage = await import(`./api/storage.js?restore=${Date.now()}`);
  assert.equal(storage.shouldRestoreSession(), true);
  assert.equal(storage.shouldRememberSession(), true);
  assert.equal(storage.getActiveStorage(), null);
});

test("unchecked remember-me is session scoped and profile is not persisted locally", async () => {
  globalThis.localStorage = createStorage();
  globalThis.sessionStorage = createStorage();
  const storage = await import(`./api/storage.js?remember-off=${Date.now()}`);
  storage.saveAuthSession("volatile-token", { remember: false });
  storage.cacheUserProfile({ id: "user-2", username: "temporary" }, { remember: false });
  assert.equal(storage.getAccessToken(), "volatile-token");
  assert.equal(storage.shouldRememberSession(), false);
  assert.equal(storage.shouldRestoreSession(), false);
  assert.equal(localStorage.getItem("hypersync_user_profile"), null);
  assert.equal(sessionStorage.getItem("hypersync_remember_me"), "false");
  assert.equal(JSON.parse(sessionStorage.getItem("hypersync_user_profile")).id, "user-2");
  storage.clearAuthSession();
  assert.equal(sessionStorage.getItem("hypersync_remember_me"), null);
  assert.equal(sessionStorage.getItem("hypersync_user_profile"), null);
});

test("blocked browser storage does not crash authentication startup", async () => {
  const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() { throw new DOMException("Storage access denied", "SecurityError"); },
    });
  }
  try {
    const storage = await import(`./api/storage.js?blocked=${Date.now()}`);
    assert.equal(storage.shouldRestoreSession(), true);
    assert.doesNotThrow(() => storage.saveAuthSession("memory-token"));
    assert.equal(storage.getAccessToken(), "memory-token");
    assert.doesNotThrow(() => storage.cacheUserProfile({ id: "user-1" }));
    assert.doesNotThrow(() => storage.clearAuthSession());
  } finally {
    for (const [name, descriptor] of [
      ["localStorage", localDescriptor],
      ["sessionStorage", sessionDescriptor],
    ]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});


test("logout clears local state immediately and calls backend directly without refresh", async () => {
  globalThis.localStorage = createStorage({ hypersync_user_profile: JSON.stringify({ id: "user-logout", username: "listener" }) });
  globalThis.sessionStorage = createStorage({ hypersync_remember_me: "false", hypersync_user_profile: JSON.stringify({ id: "user-logout" }) });
  const originalFetch = globalThis.fetch;
  let observed = null;
  globalThis.fetch = async (url, options) => {
    observed = { url: String(url), options, profileAtRequest: localStorage.getItem("hypersync_user_profile") };
    return { ok: true, status: 200 };
  };
  try {
    const auth = await import(`./api/auth.js?logout-direct=${Date.now()}`);
    await auth.logoutSession();
    assert.ok(observed.url.endsWith("/auth/logout"), observed.url);
    assert.equal(observed.options.method, "POST");
    assert.equal(observed.options.credentials, "include");
    assert.equal(observed.profileAtRequest, null, "profile must be cleared before the logout request");
    assert.equal(localStorage.getItem("hypersync_user_profile"), null);
    assert.equal(sessionStorage.getItem("hypersync_remember_me"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
