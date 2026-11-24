import assert from "node:assert/strict";
import test from "node:test";
import { readCachedSocialList, writeCachedSocialList } from "./socialCache.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
}

test("social list cache is scoped by username and list type", () => {
  globalThis.localStorage = createStorage();
  const followers = [{ username: "one" }];
  const following = [{ username: "two" }];
  assert.equal(writeCachedSocialList("Alice", "followers", followers, 1000), true);
  assert.equal(writeCachedSocialList("Alice", "following", following, 1000), true);
  assert.deepEqual(readCachedSocialList("alice", "followers", 2000), followers);
  assert.deepEqual(readCachedSocialList("alice", "following", 2000), following);
  assert.equal(readCachedSocialList("bob", "followers", 2000), null);
});

test("social list cache expires old snapshots and rejects invalid modes", () => {
  globalThis.localStorage = createStorage();
  assert.equal(writeCachedSocialList("Alice", "requests", [{ username: "secret" }]), false);
  assert.equal(readCachedSocialList("Alice", "requests"), null);
  writeCachedSocialList("Alice", "followers", [{ username: "one" }], 1000);
  assert.equal(readCachedSocialList("Alice", "followers", 15 * 24 * 60 * 60 * 1000), null);
});

test("social list cache handles storage failure without breaking the UI", () => {
  globalThis.localStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.equal(writeCachedSocialList("Alice", "followers", [{ username: "one" }]), false);
  assert.equal(readCachedSocialList("Alice", "followers"), null);
});
