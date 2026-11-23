import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("shared page surfaces are centralized and loaded after legacy styles", () => {
  const entry = fs.readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const shared = fs.readFileSync(new URL("./styles/surfaceConsistency.css", import.meta.url), "utf8");
  const base = fs.readFileSync(new URL("./styles/base.css", import.meta.url), "utf8");
  const mobile = fs.readFileSync(new URL("./styles/mobile.css", import.meta.url), "utf8");
  const profile = fs.readFileSync(new URL("./styles/profile.css", import.meta.url), "utf8");
  const search = fs.readFileSync(new URL("./styles/search.css", import.meta.url), "utf8");

  assert.match(entry, /@import "\.\/styles\/surfaceConsistency\.css";/);
  assert.ok(entry.indexOf("surfaceConsistency.css") > entry.indexOf("./styles/search.css"));
  assert.match(shared, /--hs-shared-surface:\s*rgb\(2,\s*10,\s*16\)/);
  assert.match(shared, /--hs-shared-row-highlight:/);
  assert.match(shared, /--hs-shared-row-highlight-shadow:/);

  for (const selector of [
    ".hs-search-console",
    ".hs-library-console",
    ".hs-search-section",
    ".hs-messages-console",
    ".hs-total-played-hero",
    ".hs-total-played-list",
    ".hs-admin-device-list",
    ".hs-message-thread__header",
    ".hs-messages-list__heading",
    ".hs-search-section__heading",
    ".hs-search-track-list",
    ".hs-total-played-rows",
    ".hs-admin-device-rows",
    ".hs-message-conversation-list",
  ]) {
    assert.ok(shared.includes(selector), "shared surface missing " + selector);
  }

  assert.match(shared, /\.hs-search-track:hover[\s\S]*\.hs-message-conversation\.is-active[\s\S]*background:\s*var\(--hs-shared-row-highlight\)/);
  assert.match(shared, /\.library-track-row:hover[\s\S]*box-shadow:\s*var\(--hs-shared-row-highlight-shadow\)/);

  assert.doesNotMatch(base, /\.hs-messages-list__heading\s*\{[^}]*background:/);
  assert.doesNotMatch(base, /\.hs-message-thread__header\s*\{[^}]*background:/);
  assert.doesNotMatch(base, /\.hs-message-conversation:hover,\s*\.hs-message-conversation\.is-active\s*\{[^}]*background:/);
  assert.doesNotMatch(mobile, /\.hs-admin-device-list\s*\{[^}]*background:/);
  assert.doesNotMatch(mobile, /\.admin-device-registry__row:hover\s*\{[^}]*background:/);
  assert.doesNotMatch(profile, /One shared list surface for Search, Library, Messages, Devices, and Total Played/);
  assert.doesNotMatch(search, /\.hs-search-track:hover,\s*\.hs-search-track\.is-selected\s*\{[^}]*background:/);
});

test("the five main page components use the common row and header classes", () => {
  const pages = [
    ["./components/pages/SearchPage.jsx", "hs-search-track"],
    ["./components/pages/LibraryPage.jsx", "hs-library-console"],
    ["./components/pages/MessagesPage.jsx", "hs-message-conversation"],
    ["./components/pages/TotalPlayedPage.jsx", "hs-total-played-track"],
    ["./components/pages/AdminVisitorDevicesPage.jsx", "hs-admin-device-row"],
  ];
  for (const [path, className] of pages) {
    const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(source.includes(className), path + " missing shared class " + className);
  }
});
