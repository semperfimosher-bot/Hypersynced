import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import {
  clearCachedLibraryScope, getCachedLibrary, getCachedLibraryAsync,
  getCachedLibraryPageAsync, getCachedPlaylist, getCachedPlaylistAsync,
  setCachedLibrary, setCachedLibraryPageAsync, setCachedPlaylist,
} from "./libraryCache.js";

test("Library and playlist snapshots persist in IndexedDB without using localStorage", async () => {
  const owner = "persistent-library-" + Date.now();
  let writes = 0;
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() { writes += 1; },
    removeItem() { writes += 1; },
  };
  try {
    const tracks = Array.from({ length: 4000 }, (_, index) => ({ id: "track-" + index }));
    await setCachedLibrary(owner, { owned: [], saved: [], tracks });
    assert.equal(getCachedLibrary(owner).tracks.length, 4000);
    const playlist = { id: "playlist-1", tracks };
    await setCachedPlaylist(owner, playlist);
    await setCachedLibraryPageAsync(owner, 1000, [{ id: "page-track" }]);
    assert.equal(writes, 0);
    const reopened = await import("./libraryCache.js?persistent-reopen-" + Date.now());
    assert.equal((await reopened.getCachedLibraryAsync(owner)).tracks.length, 4000);
    assert.equal((await reopened.getCachedPlaylistAsync(owner, playlist.id)).tracks.length, 4000);
    assert.deepEqual(await reopened.getCachedLibraryPageAsync(owner, 1000), [{ id: "page-track" }]);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("persistent Library and playlist caches are isolated by account and cleared on logout", async () => {
  const suffix = Date.now().toString();
  const ownerA = "owner-a-" + suffix;
  const ownerB = "owner-b-" + suffix;
  await setCachedLibrary(ownerA, { tracks: [{ id: "a" }] });
  await setCachedLibrary(ownerB, { tracks: [{ id: "b" }] });
  await setCachedPlaylist(ownerA, { id: "playlist-a", tracks: [] });
  await setCachedPlaylist(ownerB, { id: "playlist-b", tracks: [] });
  await setCachedLibraryPageAsync(ownerA, 1000, [{ id: "page-a" }]);
  await setCachedLibraryPageAsync(ownerB, 1000, [{ id: "page-b" }]);
  assert.equal(getCachedLibrary(ownerA).tracks[0].id, "a");
  assert.equal(getCachedLibrary(ownerB).tracks[0].id, "b");
  assert.equal(await getCachedPlaylistAsync(ownerB, "playlist-a"), null);
  await clearCachedLibraryScope(ownerA);
  assert.equal(getCachedLibrary(ownerA), null);
  assert.equal(await getCachedLibraryAsync(ownerA), null);
  assert.equal(await getCachedPlaylistAsync(ownerA, "playlist-a"), null);
  assert.equal(await getCachedLibraryPageAsync(ownerA, 1000), null);
  assert.equal(getCachedLibrary(ownerB).tracks[0].id, "b");
  assert.equal((await getCachedPlaylistAsync(ownerB, "playlist-b")).id, "playlist-b");
  assert.deepEqual(await getCachedLibraryPageAsync(ownerB, 1000), [{ id: "page-b" }]);
});

test("anonymous Library snapshots are not written to persistent storage", async () => {
  await setCachedLibrary("anonymous", { tracks: [{ id: "guest" }] });
  const reopened = await import("./libraryCache.js?anonymous-reopen-" + Date.now());
  assert.equal(await reopened.getCachedLibraryAsync("anonymous"), null);
});
