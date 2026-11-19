import test from "node:test";
import assert from "node:assert/strict";
import { readMessagesListSnapshot, writeMessagesListSnapshot, clearMessagesListSnapshot } from "./messagesListCache.js";

function mockStorage(name) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  const values = new Map();
  Object.defineProperty(globalThis, name, { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  } });
  return { restore: () => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; } };
}

test("message directory snapshot is account scoped and stored in session storage", () => {
  const mock = mockStorage("sessionStorage");
  try {
    const data = { unread_count: 2, conversations: [{ username: "alice", display_name: "Alice", latest_body: "Hello", unread_count: 2 }] };
    assert.equal(writeMessagesListSnapshot("user-7", data, 500), true);
    assert.equal(readMessagesListSnapshot("user-7", 501).conversations[0].latest_body, "Hello");
    assert.equal(readMessagesListSnapshot("user-8", 501), null);
  } finally { mock.restore(); }
});

test("message list snapshot expires and can be cleared", () => {
  const mock = mockStorage("sessionStorage");
  try {
    writeMessagesListSnapshot("u", { conversations: [] }, 0);
    assert.equal(readMessagesListSnapshot("u", 2 * 60 * 60 * 1000 + 1), null);
    writeMessagesListSnapshot("u", { conversations: [] }, 5);
    clearMessagesListSnapshot("u");
    assert.equal(readMessagesListSnapshot("u", 6), null);
  } finally { mock.restore(); }
});
