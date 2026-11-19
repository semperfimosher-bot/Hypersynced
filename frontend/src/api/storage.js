/*
 * Authentication state is intentionally token-memory-only in the frontend.
 * The HttpOnly refresh cookie and server-side session are authoritative.
 * A minimal cached profile is stored only to avoid falsely presenting the
 * account as logged out during temporary refresh/network failures. It is
 * never accepted as proof of authentication by the backend.
 */

export const ACCESS_TOKEN_KEY = "hypersync_access_token";
export const SESSION_ACTIVE_KEY = "hypersync_session_active";
export const REMEMBER_ME_KEY = "hypersync_remember_me";
export const CACHED_USER_KEY = "hypersync_user_profile";

let memoryAccessToken = null;
let memorySessionActive = false;
let memoryUserProfile = null;

function safeStorage(name) {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null;
  }
}

function sanitizeProfile(user) {
  if (!user || typeof user !== "object") return null;
  const allowed = ["id", "username", "display_name", "role", "account_type", "is_active"];
  const profile = {};
  for (const key of allowed) {
    const value = user[key];
    if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
      profile[key] = value;
    }
  }
  return profile.id ? profile : null;
}

function removeLegacyBrowserState() {
  // Remove only legacy persisted auth credentials. Account-scoped playback,
  // library, queue and recent-listening caches must survive reloads: deleting
  // them forces startup to wait for remote state and causes the guest flash.
  for (const storage of [safeStorage("localStorage"), safeStorage("sessionStorage")]) {
    if (!storage) continue;
    try {
      storage.removeItem(ACCESS_TOKEN_KEY);
      storage.removeItem(SESSION_ACTIVE_KEY);
      storage.removeItem(REMEMBER_ME_KEY);
    } catch {
      // Browser storage may be unavailable or blocked.
    }
  }
}

removeLegacyBrowserState();

function loadCachedProfile() {
  const storage = safeStorage("localStorage");
  try {
    const profile = sanitizeProfile(JSON.parse(storage?.getItem(CACHED_USER_KEY) ?? "null"));
    memoryUserProfile = profile;
  } catch {
    memoryUserProfile = null;
    try { storage?.removeItem(CACHED_USER_KEY); } catch {}
  }
}

loadCachedProfile();

export function shouldRememberSession() {
  // Refresh-cookie lifetime and revocation are controlled by the server.
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
  const profile = sanitizeProfile(user);
  if (!profile) return;
  memoryUserProfile = profile;
  try {
    safeStorage("localStorage")?.setItem(CACHED_USER_KEY, JSON.stringify(profile));
  } catch {
    // Cached identity is an optimization, not required for authentication.
  }
}

export function clearCachedUserProfile() {
  memoryUserProfile = null;
  try {
    safeStorage("localStorage")?.removeItem(CACHED_USER_KEY);
  } catch {
    // Browser storage may be unavailable or blocked.
  }
}

export function shouldRestoreSession() {
  // Always validate/refresh using the HttpOnly refresh cookie at startup.
  return true;
}

export function saveAuthSession(accessToken) {
  memoryAccessToken = accessToken || null;
  memorySessionActive = Boolean(accessToken);
}

export function clearAuthSession() {
  memoryAccessToken = null;
  memorySessionActive = false;
  clearCachedUserProfile();
}
