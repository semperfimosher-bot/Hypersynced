import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  readCachedHomeRecentlyAdded,
  writeCachedHomeRecentlyAdded,
} from "./homeRecentlyAdded.js";

function withStorage(run) {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  try {
    run(values);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

test("Home newest-added cache deduplicates and limits tracks to 12", () => {
  withStorage((values) => {
    const source = Array.from({ length: 14 }, (_, index) => ({ id: String(index), title: `Track ${index}` }));
    source.splice(2, 0, { ...source[1] });
    const result = writeCachedHomeRecentlyAdded(source, 1000);
    assert.equal(result.length, 12);
    assert.equal(new Set(result.map((track) => track.id)).size, 12);
    assert.deepEqual(readCachedHomeRecentlyAdded(1001), result);
    assert.ok(values.has("hypersynced.home-recently-added.v1"));
  });
});

test("Home newest-added cache expires safely", () => {
  withStorage((values) => {
    writeCachedHomeRecentlyAdded([{ id: "fresh" }], 1000);
    assert.deepEqual(readCachedHomeRecentlyAdded(1000 + 30 * 60 * 1000 + 1), []);
    assert.equal(values.has("hypersynced.home-recently-added.v1"), false);
  });
});

test("newest-added endpoint sorts by insertion timestamp and limits to twelve", () => {
  const backend = fs.readFileSync(new URL("../../backend/app/api/routes/catalog.py", import.meta.url), "utf8");
  const home = fs.readFileSync(new URL("./components/pages/HomePage.jsx", import.meta.url), "utf8");
  const helper = fs.readFileSync(new URL("./homeRecentlyAdded.js", import.meta.url), "utf8");
  assert.match(backend, /\/recently-added/);
  assert.match(backend, /Track\.created_at\.desc\(\)/);
  assert.match(backend, /\.limit\(12\)/);
  assert.match(home, /refreshHomeRecentlyAdded/);
  assert.match(home, /tracks=\{recentlyAdded\}/);
  assert.match(home, /JUST ADDED TO HYPERSYNCED/);
  assert.match(helper, /\/catalog\/recently-added/);
});
