import { getArtistArtworkStatus } from "./artistApi.js";

const DB_NAME = "hypersynced-artist-portraits";
const STORE = "portraits";
const memory = new Map();
const inflight = new Map();
const polling = new Map();

function key(name) {
  return String(name || "").trim().toLocaleLowerCase();
}
function fingerprint(url) {
  try {
    const value = new URL(url);
    return value.origin + value.pathname;
  } catch {
    return String(url || "");
  }
}
function openDb() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "name" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
async function read(name) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE);
    const req = tx.objectStore(STORE).get(name);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
  });
}
async function write(entry) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = tx.onabort = () => { db.close(); resolve(false); };
  });
}
async function storePortrait(name, url) {
  if (!url) return null;
  const prior = memory.get(name) || await read(name);
  if (prior && Date.now() - prior.saved < 6 * 60 * 60 * 1000
      && prior.sourceFingerprint === fingerprint(url)) {
    memory.set(name, prior);
    return prior.blob;
  }
  try {
    const response = await fetch(url, { cache: "no-cache", credentials: "omit" });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
      return prior?.blob || null;
    }
    const blob = await response.blob();
    if (!blob.size || blob.size > 4 * 1024 * 1024) return prior?.blob || null;
    const entry = { name, blob, sourceFingerprint: fingerprint(url), saved: Date.now() };
    memory.set(name, entry);
    await write(entry);
    return blob;
  } catch {
    return prior?.blob || null;
  }
}
async function pollUntilReady(name) {
  if (polling.has(name)) return polling.get(name);
  const task = (async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      let status;
      try { status = await getArtistArtworkStatus(name); } catch { continue; }
      if (status?.artwork_url) await storePortrait(name, status.artwork_url);
      if (status?.status === "ready") return;
      if (["missing", "failed"].includes(status?.status)) return;
    }
  })().finally(() => polling.delete(name));
  polling.set(name, task);
  return task;
}
export async function getArtistPortrait(name) {
  const normalized = key(name);
  if (memory.has(normalized)) return memory.get(normalized).blob;
  const entry = await read(normalized);
  if (entry?.blob) {
    memory.set(normalized, entry);
    return entry.blob;
  }
  return null;
}
export async function refreshArtistPortrait(name, fallbackUrl) {
  const normalized = key(name);
  if (!normalized) return null;
  if (inflight.has(normalized)) return inflight.get(normalized);
  const task = (async () => {
    let status = null;
    try { status = await getArtistArtworkStatus(name); } catch {}
    const source = status?.artwork_url || fallbackUrl;
    const cached = source ? await storePortrait(normalized, source) : await getArtistPortrait(name);
    if (status && !["ready", "missing", "failed"].includes(status.status)) {
      void pollUntilReady(normalized);
    }
    return cached;
  })().finally(() => inflight.delete(normalized));
  inflight.set(normalized, task);
  return task;
}
