import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("shared design tokens use requested surfaces without changing the page canvas", () => {
  const entry = fs.readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const shared = fs.readFileSync(new URL("./styles/surfaceConsistency.css", import.meta.url), "utf8");
  const base = fs.readFileSync(new URL("./styles/base.css", import.meta.url), "utf8");
  const mobile = fs.readFileSync(new URL("./styles/mobile.css", import.meta.url), "utf8");
  const profile = fs.readFileSync(new URL("./styles/profile.css", import.meta.url), "utf8");
  const search = fs.readFileSync(new URL("./styles/search.css", import.meta.url), "utf8");
  const desktop = fs.readFileSync(new URL("./styles/desktop.css", import.meta.url), "utf8");

  assert.match(entry, /@import "\.\/styles\/surfaceConsistency\.css";/);
  assert.ok(entry.indexOf("surfaceConsistency.css") > entry.indexOf("./styles/search.css"));
  assert.match(shared, /--hs-surface:\s*#012036/i);
  assert.match(shared, /@media \(min-width:\s*980px\)[\s\S]*--hs-surface:\s*#000F1A/i);
  assert.ok(shared.includes(".hs-search-console__surface-group"));
  assert.ok(shared.includes(".hs-library-console__surface-group"));
  assert.ok(shared.includes(".hs-messages-console__surface-group"));
  assert.match(shared, /--hs-surface-hover:\s*#004573/i);
  assert.ok(base.includes("background: var(--hs-surface);"));
  assert.ok(search.includes("background: var(--hs-surface);"));
  assert.ok(profile.includes("background: var(--hs-surface);"));
  assert.ok(mobile.includes("background: var(--hs-surface);"));
  assert.match(base, /--bg:\s*#03070b/i);
  assert.match(base, /background:\s*#03070b/i);
  assert.match(shared, /\.hs-search-page[\s\S]*background:\s*transparent/);
  assert.ok(shared.includes(".hs-search-console__heading"));
  assert.ok(shared.includes("background: var(--hs-surface);"));
  assert.match(shared, /\.hs-total-played-list[\s\S]*gap:\s*0/);
  assert.match(shared, /\.hs-search-track-list[\s\S]*border-radius:\s*12px/);
  assert.ok(shared.includes("border-bottom: 1px solid var(--hs-shared-row-divider);"));
  assert.ok(shared.includes(".hs-search-track:hover"));
  assert.ok(shared.includes("background: var(--hs-surface-hover);"));
  assert.ok(shared.includes(".hs-message-conversation:hover,"));
  assert.ok(!shared.includes(".hs-message-conversation.is-active,"));
  assert.ok(shared.includes(".hs-playing-indicator {"));
  assert.ok(shared.includes("color: var(--blue);"));
  assert.match(shared, /prefers-reduced-motion/);
  assert.match(base, /--panel:\s*#012036/i);
  assert.match(search, /--hs-panel:\s*#012036/i);
  assert.match(profile, /--hs-panel:\s*#012036/i);
  assert.match(desktop, /\.desktop-sidebar/);
  assert.doesNotMatch(base, /\.hs-messages-list__heading\s*\{[^}]*background:/);
  assert.doesNotMatch(base, /\.hs-message-thread__header\s*\{[^}]*background:/);
  assert.doesNotMatch(base, /\.hs-message-conversation:hover,\s*\.hs-message-conversation\.is-active\s*\{[^}]*background:/);
  assert.doesNotMatch(mobile, /\.hs-admin-device-list\s*\{[^}]*background:/);
  assert.doesNotMatch(mobile, /\.admin-device-registry__row:hover\s*\{[^}]*background:/);
  assert.doesNotMatch(profile, /One shared list surface for Search, Library, Messages, Devices, and Total Played/);
  assert.doesNotMatch(search, /\.hs-search-track:hover,\s*\.hs-search-track\.is-selected\s*\{[^}]*background:/);
});

test("main list pages reuse shared row classes", () => {
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
    if (path.includes("SearchPage")) assert.ok(source.includes("hs-search-console__surface-group"));
    if (path.includes("LibraryPage")) assert.ok(source.includes("hs-library-console__surface-group"));
    if (path.includes("MessagesPage")) assert.ok(source.includes("hs-messages-console__surface-group"));
  }
});
