/*
 * Authentication state is intentionally memory-only in the frontend.
 * The HttpOnly refresh cookie and server-side session are authoritative.
 * No profile, token, remember-me flag, or session marker is written to
 * localStorage or sessionStorage.
 */

export const ACCESS_TOKEN_KEY = "hypersync_access_token";
export const SESSION_ACTIVE_KEY = "hypersync_session_active";
export const REMEMBER_ME_KEY = "hypersync_remember_me";
export const CACHED_USER_KEY = "hypersync_user_profile";

let memoryAccessToken = null;
let memorySessionActive = false;
let memoryUserProfile = null;

function removeLegacyBrowserState() {
  const fixedKeys = [ACCESS_TOKEN_KEY, SESSION_ACTIVE_KEY, REMEMBER_ME_KEY, CACHED_USER_KEY];
  const prefixes = [
    "hypersync-library-v1:",
    "hypersync_player_state_v2:",
    "hypersync-home-recent-v1:",
    "hypersync:playlist-pins-v1:",
  ];
  for (const storageName of ["localStorage", "sessionStorage"]) {
    try {
      const storage = globalThis[storageName];
      if (!storage) continue;
      for (const key of fixedKeys) storage.removeItem(key);
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
          storage.removeItem(key);
        }
      }
    } catch {
      // Browser storage may be unavailable or blocked.
    }
  }
}

removeLegacyBrowserState();

export function shouldRememberSession() {
  // Refresh-cookie lifetime is controlled by the server.
  return true;
}

export function getActiveStorage() {
  return null;
}

export function getAccessToken() {
  return memoryAccessToken;
}

export function hasStoredSession() {
  return memorySessionActive;
}

export function readCachedUserProfile() {
  return memoryUserProfile;
}

export function cacheUserProfile(user) {
  if (user && typeof user === "object") memoryUserProfile = { ...user };
}

export function clearCachedUserProfile() {
  memoryUserProfile = null;
}

export function shouldRestoreSession() {
  // Always check the HttpOnly refresh cookie on app startup.
  return true;
}

export function saveAuthSession(accessToken) {
  memoryAccessToken = accessToken || null;
  memorySessionActive = Boolean(accessToken);
}

export function clearAuthSession() {
  memoryAccessToken = null;
  memorySessionActive = false;
  memoryUserProfile = null;
}
