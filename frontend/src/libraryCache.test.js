import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "fake-indexeddb/auto";
import {
  applySavedPlaylistMembership, settleSavedPlaylistMembership,
  assert.match(libraryPageSource, /getCachedLibraryAsync\(\s*libraryCacheKey,?\s*\)/);
  getCachedLibraryPageAsync, getCachedPlaylistAsync,
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
    tracks[0].audio_url = "https://media.example.test/temporary-signed-link";
    await setCachedLibrary(owner, { owned: [], saved: [], tracks });
    assert.equal(getCachedLibrary(owner).tracks.length, 4000);
    const playlist = { id: "playlist-1", tracks };
    await setCachedPlaylist(owner, playlist);
    await setCachedLibraryPageAsync(owner, 1000, [{ id: "page-track" }]);
    assert.equal(writes, 0);
    const reopened = await import("./libraryCache.js?persistent-reopen-" + Date.now());
    const reopenedLibrary = await reopened.getCachedLibraryAsync(owner);
    assert.equal(reopenedLibrary.tracks.length, 4000);
    assert.equal(reopenedLibrary.tracks[0].audio_url, undefined);
    const reopenedPlaylist = await reopened.getCachedPlaylistAsync(owner, playlist.id);
    assert.equal(reopenedPlaylist.tracks.length, 4000);
    assert.equal(reopenedPlaylist.tracks[0].audio_url, undefined);
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


test("invalidating changed-library pages clears stale pages only for that account", async () => {
  const suffix = Date.now().toString();
  const ownerA = "page-owner-a-" + suffix;
  const ownerB = "page-owner-b-" + suffix;
  await setCachedLibraryPageAsync(ownerA, 0, [{ id: "old-a-0" }]);
  await setCachedLibraryPageAsync(ownerA, 1000, [{ id: "old-a-1" }]);
  await setCachedLibraryPageAsync(ownerB, 0, [{ id: "keep-b-0" }]);
  await setCachedLibraryPageAsync(ownerB, 1000, [{ id: "keep-b-1" }]);
  await clearCachedLibraryPages(ownerA);
  assert.equal(await getCachedLibraryPageAsync(ownerA, 0), null);
  assert.equal(await getCachedLibraryPageAsync(ownerA, 1000), null);
  assert.deepEqual(await getCachedLibraryPageAsync(ownerB, 0), [{ id: "keep-b-0" }]);
  assert.deepEqual(await getCachedLibraryPageAsync(ownerB, 1000), [{ id: "keep-b-1" }]);
});


test("optimistic saved-playlist changes update the Library snapshot immediately and can be settled", async () => {
  const owner = "optimistic-library-" + Date.now();
  const playlist = { id: "saved-playlist", title: "Saved instantly" };
  await setCachedLibrary(owner, { owned: [], saved: [], tracks: [] });
  const optimistic = applySavedPlaylistMembership(owner, playlist, true);
  assert.equal(optimistic.saved[0].id, playlist.id);
  assert.equal(optimistic.saved[0].is_saved, true);
  assert.deepEqual(optimistic.pendingSavedPlaylistChanges, {
    [playlist.id]: true,
  });

  applySavedPlaylistMembership(owner, playlist, false);
  assert.deepEqual(getCachedLibrary(owner).saved, []);
  assert.equal(getCachedLibrary(owner).pendingSavedPlaylistChanges[playlist.id], false);

  settleSavedPlaylistMembership(owner, playlist.id);
  assert.deepEqual(getCachedLibrary(owner).pendingSavedPlaylistChanges, {});
  const persisted = await getCachedLibraryAsync(owner);
  assert.deepEqual(persisted.saved, []);
  assert.deepEqual(persisted.pendingSavedPlaylistChanges, {});
});

test("Library renders a persisted snapshot before validating it with the network and caches the first server response", () => {
  const libraryPageSource = readFileSync(
    new URL("./components/pages/LibraryPage.jsx", import.meta.url),
    "utf8",
  );
  assert.match(libraryPageSource, /getCachedLibraryAsync\\(\\s*libraryCacheKey\\s*\\)/);
  assert.match(libraryPageSource, /if \(cached && !quiet\) setLoading\(false\)/);
  assert.match(libraryPageSource, /await Promise\.all\(\s*\[\s*setCachedLibrary\([\s\S]*?setCachedLibraryPageAsync\(/);
  assert.match(libraryPageSource, /getLibraryTracks\(\s*\{\s*limit:\s*LIBRARY_TRACKS_PAGE_SIZE,\s*offset:\s*0/);
});
