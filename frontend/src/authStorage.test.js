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

test("auth tokens, session markers and cached profiles are memory-only", async () => {
  globalThis.localStorage = createStorage({
    hypersync_access_token: "old-token",
    hypersync_session_active: "true",
    hypersync_remember_me: "true",
    hypersync_user_profile: JSON.stringify({ id: "old-user" }),
    "hypersync-library-v1:old-user": "{}",
    "hypersync_player_state_v2:old-user": "{}",
    "hypersync-home-recent-v1:old-user": "[]",
    "hypersync:playlist-pins-v1:old-user": "[]",
  });
  globalThis.sessionStorage = createStorage({
    hypersync_access_token: "old-session-token",
    hypersync_session_active: "true",
  });

  const storage = await import(`./api/storage.js?memory-only=${Date.now()}`);

  for (const key of [
    "hypersync_access_token",
    "hypersync_session_active",
    "hypersync_remember_me",
    "hypersync_user_profile",
    "hypersync-library-v1:old-user",
    "hypersync_player_state_v2:old-user",
    "hypersync-home-recent-v1:old-user",
    "hypersync:playlist-pins-v1:old-user",
  ]) assert.equal(localStorage.getItem(key), null, key);
  assert.equal(sessionStorage.getItem("hypersync_access_token"), null);
  assert.equal(sessionStorage.getItem("hypersync_session_active"), null);

  storage.saveAuthSession("live-memory-token");
  assert.equal(storage.getAccessToken(), "live-memory-token");
  assert.equal(storage.hasStoredSession(), true);
  assert.equal(localStorage.length, 0);
  assert.equal(sessionStorage.length, 0);

  storage.cacheUserProfile({ id: "user-1", username: "listener" });
  assert.equal(storage.readCachedUserProfile().id, "user-1");
  assert.equal(localStorage.length, 0);
  assert.equal(sessionStorage.length, 0);

  storage.clearAuthSession();
  assert.equal(storage.getAccessToken(), null);
  assert.equal(storage.hasStoredSession(), false);
  assert.equal(storage.readCachedUserProfile(), null);
});

test("session restoration always checks the HttpOnly refresh cookie", async () => {
  globalThis.localStorage = createStorage();
  globalThis.sessionStorage = createStorage();
  const storage = await import(`./api/storage.js?restore=${Date.now()}`);
  assert.equal(storage.shouldRestoreSession(), true);
  assert.equal(storage.shouldRememberSession(), true);
  assert.equal(storage.getActiveStorage(), null);
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
