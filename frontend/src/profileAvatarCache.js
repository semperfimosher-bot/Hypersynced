const DATABASE_NAME = "hypersynced-profile-avatar-cache-v1";
const STORE_NAME = "avatars";
const MAX_AVATAR_ENTRIES = 48;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
let databasePromise = null;

function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "url" });
        store.createIndex("cachedAt", "cachedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Avatar cache failed to open."));
  }).catch((error) => { databasePromise = null; throw error; });
  return databasePromise;
}

export async function getProfileAvatarBlob(url) {
  if (!url) return null;
  const db = await openDatabase();
  if (!db) return null;
  const transaction = db.transaction(STORE_NAME, "readonly");
  return new Promise((resolve, reject) => {
    const request = transaction.objectStore(STORE_NAME).get(String(url));
    request.onsuccess = () => resolve(request.result?.blob ?? null);
    request.onerror = () => reject(request.error ?? new Error("Avatar cache read failed."));
  });
}

export async function putProfileAvatarBlob(url, blob) {
  if (!url || !(blob instanceof Blob) || !blob.type.startsWith("image/") || blob.size > MAX_AVATAR_BYTES) return false;
  const db = await openDatabase();
  if (!db) return false;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ url: String(url), blob, cachedAt: Date.now() });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error("Avatar cache write failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Avatar cache write aborted."));
  });
  await pruneProfileAvatarCache(db);
  return true;
}

async function pruneProfileAvatarCache(db) {
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const records = (request.result ?? []).sort((a, b) => Number(b.cachedAt) - Number(a.cachedAt));
      for (const record of records.slice(MAX_AVATAR_ENTRIES)) store.delete(record.url);
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error("Avatar cache pruning failed."));
  });
}
