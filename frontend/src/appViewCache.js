import { normalizeAppViewState } from "./appViewState.js";

const PREFIX = "hypersynced_app_view_v1:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function keyFor(ownerId) {
  return ownerId ? PREFIX + String(ownerId) : "";
}

export function readCachedAppView(ownerId, role = "user", now = Date.now()) {
  const key = keyFor(ownerId);
  if (!key) return null;
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const savedAt = Number(cached?.savedAt);
    if (!Number.isFinite(savedAt) || now - savedAt > CACHE_TTL_MS || savedAt > now + 60_000) {
      storage()?.removeItem(key);
      return null;
    }
    // Search query is deliberately omitted from this local cache.
    return normalizeAppViewState({
      active_page: cached?.active_page,
      search_query: "",
      profile_username: cached?.profile_username,
    }, role);
  } catch {
    return null;
  }
}

export function writeCachedAppView(ownerId, state, role = "user", now = Date.now()) {
  const key = keyFor(ownerId);
  if (!key) return false;
  const normalized = normalizeAppViewState({
    active_page: state?.active_page,
    search_query: "",
    profile_username: state?.profile_username,
  }, role);
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(key, JSON.stringify({
      active_page: normalized.activePage,
      profile_username: normalized.profileUsername,
      savedAt: now,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearCachedAppView(ownerId) {
  const key = keyFor(ownerId);
  if (!key) return;
  try {
    storage()?.removeItem(key);
  } catch {
    // Browser storage may be unavailable.
  }
}
