/*
 * Fast, bounded, same-runtime Library cache.
 *
 * Persistent Library/playlist snapshots are deliberately not stored in
 * localStorage or IndexedDB. Neon remains authoritative. Offline access is
 * provided by the dedicated offline-download records in mediaStore.js.
 */

const libraryByOwner = new Map();
const playlistPages = new Map();
const playlistsByOwner = new Map();

function ownerKey(userKey) {
  return String(userKey ?? "").trim() || "anonymous";
}

function pageKey(userKey, offset) {
  if (!Number.isInteger(offset) || offset < 0) return null;
  return ownerKey(userKey) + "|page|" + offset;
}

function playlistMap(userKey) {
  const key = ownerKey(userKey);
  if (!playlistsByOwner.has(key)) playlistsByOwner.set(key, new Map());
  return playlistsByOwner.get(key);
}

export async function getCachedLibraryPageAsync(userKey, offset = 0) {
  const key = pageKey(userKey, offset);
  return key ? (playlistPages.get(key) ?? null) : null;
}

export async function setCachedLibraryPageAsync(userKey, offset, tracks) {
  const key = pageKey(userKey, offset);
  if (!key || !Array.isArray(tracks)) return false;
  playlistPages.set(key, tracks);
  return true;
}

export function getCachedLibrary(userKey) {
  return libraryByOwner.get(ownerKey(userKey)) ?? null;
}

export async function getCachedLibraryAsync(userKey) {
  return getCachedLibrary(userKey);
}

export function setCachedLibrary(userKey, library) {
  if (!library || typeof library !== "object") return Promise.resolve(false);
  libraryByOwner.set(ownerKey(userKey), { ...library, cachedAt: Date.now() });
  return Promise.resolve(true);
}

export function clearCachedLibraryScope(userKey) {
  const owner = ownerKey(userKey);
  libraryByOwner.delete(owner);
  playlistsByOwner.delete(owner);
  const prefix = owner + "|page|";
  for (const key of playlistPages.keys()) {
    if (key.startsWith(prefix)) playlistPages.delete(key);
  }
  return Promise.resolve(0);
}

export function clearCachedLibrary(userKey) {
  libraryByOwner.delete(ownerKey(userKey));
  return Promise.resolve(true);
}

export function getCachedPlaylist(userKey, playlistId) {
  if (!playlistId) return null;
  return playlistMap(userKey).get(String(playlistId)) ?? null;
}

export async function getCachedPlaylistAsync(userKey, playlistId) {
  return getCachedPlaylist(userKey, playlistId);
}

export function setCachedPlaylist(userKey, playlist) {
  if (!playlist?.id) return Promise.resolve(false);
  playlistMap(userKey).set(String(playlist.id), { ...playlist, cachedAt: Date.now() });
  return Promise.resolve(true);
}

export function removeCachedPlaylist(userKey, playlistId) {
  if (!playlistId) return Promise.resolve(false);
  return Promise.resolve(playlistMap(userKey).delete(String(playlistId)));
}
