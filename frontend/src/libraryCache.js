/*
 * Account-scoped, bounded Library cache.
 * IndexedDB snapshots survive app restarts; the API remains authoritative.
 */
const libraryByOwner = new Map();
const playlistPages = new Map();
const playlistsByOwner = new Map();
const DATABASE_NAME = "hypersynced-library-cache-v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "snapshots";
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PLAYLISTS_PER_OWNER = 100;
const MAX_PAGES_PER_OWNER = 40;
let databasePromise = null;

function ownerKey(userKey) {
  return String(userKey ?? "").trim() || "anonymous";
}
function canPersist(userKey) {
  return ownerKey(userKey) !== "anonymous";
}
function recordKey(userKey, kind, itemId = "root") {
  return encodeURIComponent(ownerKey(userKey)) + "|" + kind + "|" + encodeURIComponent(String(itemId));
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
function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("ownerKey", "ownerKey", { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Unable to open Library cache."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Opening the Library cache was blocked."));
    };
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Library cache request failed."));
  });
}

// Signed audio URLs are short-lived bearer links. Never persist them; the
// player can resolve a fresh source from the stable track ID when needed.
function stripTransientAudioUrls(value) {
  if (Array.isArray(value)) return value.map(stripTransientAudioUrls);
  if (!value || typeof value !== "object") return value;
  const transientKeys = new Set([
    "audio_url", "audiourl", "media_url", "mediaurl",
    "signed_url", "signedurl", "stream_url", "streamurl",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !transientKeys.has(key.toLowerCase()))
      .map(([key, nested]) => [key, stripTransientAudioUrls(nested)]),
  );
}
async function deleteRecord(userKey, kind, itemId = "root") {
  if (!canPersist(userKey)) return false;
  const database = await openDatabase();
  if (!database) return false;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(recordKey(userKey, kind, itemId));
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear Library cache."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Clearing Library cache was aborted."));
  });
}
async function readRecord(userKey, kind, itemId = "root") {
  if (!canPersist(userKey)) return null;
  const database = await openDatabase();
  if (!database) return null;
  const transaction = database.transaction(STORE_NAME, "readonly");
  const record = await requestResult(transaction.objectStore(STORE_NAME).get(recordKey(userKey, kind, itemId)));
  if (!record) return null;
  if (!Number.isFinite(record.cachedAt) || Date.now() - record.cachedAt > CACHE_MAX_AGE_MS) {
    await deleteRecord(userKey, kind, itemId);
    return null;
  }
  return record.value ?? null;
}
function pruneOwnerRecords(database, userKey, kind, maxCount) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index("ownerKey").getAll(ownerKey(userKey));
    request.onsuccess = () => {
      const now = Date.now();
      const selected = (request.result ?? []).filter((record) => record.kind === kind);
      for (const record of selected) {
        if (!Number.isFinite(record.cachedAt) || now - record.cachedAt > CACHE_MAX_AGE_MS) {
          store.delete(record.key);
        }
      }
      const fresh = selected
        .filter((record) => Number.isFinite(record.cachedAt) && now - record.cachedAt <= CACHE_MAX_AGE_MS)
        .sort((left, right) => right.cachedAt - left.cachedAt);
      for (const record of fresh.slice(maxCount)) store.delete(record.key);
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error("Library cache cleanup failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Library cache cleanup was aborted."));
  });
}
async function writeRecord(userKey, kind, itemId, value) {
  if (!canPersist(userKey)) return false;
  const database = await openDatabase();
  if (!database) return false;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      key: recordKey(userKey, kind, itemId),
      ownerKey: ownerKey(userKey),
      kind,
      cachedAt: Date.now(),
      value: stripTransientAudioUrls(value),
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save Library cache."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saving Library cache was aborted."));
  });
  if (kind === "playlist") await pruneOwnerRecords(database, userKey, kind, MAX_PLAYLISTS_PER_OWNER);
  if (kind === "page") await pruneOwnerRecords(database, userKey, kind, MAX_PAGES_PER_OWNER);
  return true;
}

export async function getCachedLibraryPageAsync(userKey, offset = 0) {
  const key = pageKey(userKey, offset);
  if (!key) return null;
  if (playlistPages.has(key)) return playlistPages.get(key);
  const value = await readRecord(userKey, "page", offset);
  if (Array.isArray(value)) playlistPages.set(key, value);
  return Array.isArray(value) ? value : null;
}
export async function setCachedLibraryPageAsync(userKey, offset, tracks) {
  const key = pageKey(userKey, offset);
  if (!key || !Array.isArray(tracks)) return false;
  playlistPages.set(key, tracks);
  return writeRecord(userKey, "page", offset, tracks);
}
export function getCachedLibrary(userKey) {
  return libraryByOwner.get(ownerKey(userKey)) ?? null;
}
export async function getCachedLibraryAsync(userKey) {
  const memory = getCachedLibrary(userKey);
  if (memory) return memory;
  const value = await readRecord(userKey, "library");
  if (value && typeof value === "object") {
    libraryByOwner.set(ownerKey(userKey), value);
    return value;
  }
  return null;
}
export function setCachedLibrary(userKey, library) {
  if (!library || typeof library !== "object") return Promise.resolve(false);
  const snapshot = { ...library, cachedAt: Date.now() };
  libraryByOwner.set(ownerKey(userKey), snapshot);
  return writeRecord(userKey, "library", "root", snapshot);
}
export async function clearCachedLibraryPages(userKey) {
  const owner = ownerKey(userKey);
  const prefix = owner + "|page|";
  let removed = 0;
  for (const key of playlistPages.keys()) {
    if (key.startsWith(prefix)) {
      playlistPages.delete(key);
      removed += 1;
    }
  }
  if (!canPersist(userKey)) return removed;
  const database = await openDatabase();
  if (!database) return removed;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index("ownerKey").getAll(owner);
    request.onsuccess = () => {
      for (const record of request.result ?? []) {
        if (record.kind === "page") {
          store.delete(record.key);
          removed += 1;
        }
      }
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve(removed);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear cached Library pages."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Clearing cached Library pages was aborted."));
  });
}

export function clearCachedLibraryScope(userKey) {
  const owner = ownerKey(userKey);
  libraryByOwner.delete(owner);
  playlistsByOwner.delete(owner);
  const prefix = owner + "|page|";
  for (const key of playlistPages.keys()) if (key.startsWith(prefix)) playlistPages.delete(key);
  if (!canPersist(userKey)) return Promise.resolve(0);
  return openDatabase().then((database) => {
    if (!database) return 0;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).index("ownerKey").openCursor(owner);
      let removed = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        removed += 1;
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(removed);
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear account Library cache."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Clearing account Library cache was aborted."));
    });
  });
}
export function clearCachedLibrary(userKey) {
  libraryByOwner.delete(ownerKey(userKey));
  return deleteRecord(userKey, "library", "root");
}
export function getCachedPlaylist(userKey, playlistId) {
  if (!playlistId) return null;
  return playlistMap(userKey).get(String(playlistId)) ?? null;
}
export async function getCachedPlaylistAsync(userKey, playlistId) {
  if (!playlistId) return null;
  const memory = getCachedPlaylist(userKey, playlistId);
  if (memory) return memory;
  const value = await readRecord(userKey, "playlist", playlistId);
  if (value && typeof value === "object") {
    playlistMap(userKey).set(String(playlistId), value);
    return value;
  }
  return null;
}
export function setCachedPlaylist(userKey, playlist) {
  if (!playlist?.id) return Promise.resolve(false);
  const snapshot = { ...playlist, cachedAt: Date.now() };
  playlistMap(userKey).set(String(playlist.id), snapshot);
  return writeRecord(userKey, "playlist", playlist.id, snapshot);
}
export function removeCachedPlaylist(userKey, playlistId) {
  if (!playlistId) return Promise.resolve(false);
  playlistMap(userKey).delete(String(playlistId));
  return deleteRecord(userKey, "playlist", playlistId);
}
