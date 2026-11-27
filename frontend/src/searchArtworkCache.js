const DB = "hs-search-art";
const STORE = "imgs";
const MAX = 200;
const MAX_BYTES = 40 * 1024 * 1024;
const REVALIDATE_MS = 24 * 60 * 60 * 1000;
const inflight = new Map();

function open() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "url" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
async function get(url) {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE);
    const req = tx.objectStore(STORE).get(url);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
  });
}
async function put(entry) {
  const db = await open();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = tx.onabort = () => { db.close(); resolve(false); };
  });
}
async function trim() {
  const db = await open();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || []).sort((a, b) => a.last - b.last);
      let bytes = items.reduce((sum, item) => sum + (item.blob?.size || 0), 0);
      while (items.length > MAX || bytes > MAX_BYTES) {
        const item = items.shift();
        if (!item) break;
        bytes -= item.blob?.size || 0;
        store.delete(item.url);
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}
export async function getSearchArtwork(url) {
  const item = await get(url);
  if (!item?.blob) return null;
  void put({ ...item, last: Date.now() });
  return { blob: item.blob, stale: Date.now() - item.saved > REVALIDATE_MS };
}
export async function refreshSearchArtwork(url) {
  if (!url) return null;
  if (inflight.has(url)) return inflight.get(url);
  const task = (async () => {
    try {
      const response = await fetch(url, { cache: "no-cache", credentials: "omit" });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return null;
      const blob = await response.blob();
      if (!blob.size || blob.size > 2 * 1024 * 1024) return null;
      const old = await get(url);
      if (old?.blob?.size === blob.size && old.blob.type === blob.type) {
        await put({ ...old, saved: Date.now(), last: Date.now() });
        return old.blob;
      }
      await put({ url, blob, saved: Date.now(), last: Date.now() });
      await trim();
      return blob;
    } catch {
      // Direct <img src> still renders even when cross-origin cache fetch is blocked.
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, task);
  return task;
}
