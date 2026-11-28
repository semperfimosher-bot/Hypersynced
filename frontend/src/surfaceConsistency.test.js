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
  assert.match(shared, /--hs-surface:\s*#020A10/i);
  assert.doesNotMatch(shared, /--hs-surface:\s*#000F1A/i);
  assert.ok(shared.includes(".hs-search-console__surface-group"));
  assert.ok(shared.includes(".hs-library-console__surface-group"));
  assert.ok(shared.includes(".hs-messages-console__surface-group"));
  assert.match(shared, /--hs-surface-hover:\s*#012036/i);
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
  assert.match(shared, /\.hs-search-track-list[\s\S]*border-radius:\s*8px/);
  assert.ok(shared.includes("border-bottom: 1px solid var(--hs-shared-row-divider);"));
  assert.ok(shared.includes(".hs-search-track:hover"));
  assert.ok(shared.includes("background: var(--hs-surface-hover);"));
  assert.match(shared, /@media \(max-width:\s*979px\)[\s\S]*min-width:\s*0/);
  assert.ok(!shared.includes(".hs-message-conversation.is-active,"));
  assert.ok(shared.includes(".hs-playing-indicator {"));
  assert.ok(shared.includes("color: var(--blue);"));
  assert.match(shared, /prefers-reduced-motion/);
  assert.match(base, /--panel:\s*#020a10/i);
  assert.match(search, /--hs-panel:\s*#020A10/i);
  assert.match(profile, /--hs-panel:\s*#020A10/i);
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


test("admin dashboard hover highlight is limited to real action controls", () => {
  const shared = fs.readFileSync(new URL("./styles/surfaceConsistency.css", import.meta.url), "utf8");
  const hoverBlock = shared.split("/* Ordinary interactive surfaces share the requested hover color.")[1]?.split("/* Touch devices")[0] ?? "";
  assert.doesNotMatch(hoverBlock, /\.admin-panel--interactive:hover|\.admin-stat-card:hover|\.admin-explorer-folder:hover|\.admin-explorer-file:hover/);
});

test("uploads page removes the published catalog list while preserving metadata backfill", () => {
  const uploads = fs.readFileSync(new URL("./components/pages/AdminUploadsPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(uploads, /Published Tracks|admin-upload-catalog|publishedPage|RowPager|deleteCatalogTrack/);
  assert.match(uploads, /Backfill Genre & Year/);
});


test("lyrics lines use a transparent single-color surface", () => {
  const lyrics = fs.readFileSync(new URL("./styles/lyrics.css", import.meta.url), "utf8");
  assert.match(lyrics, /\.live-lyrics__line,[\s\S]*background: transparent !important/);
  assert.match(lyrics, /\.live-lyrics__viewport,[\s\S]*background: var\(--hs-surface\) !important/);
});


test("mobile Search and Library width containment prevents zoom and bottom-nav overflow", () => {
  const shared = fs.readFileSync(new URL("./styles/surfaceConsistency.css", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /name="viewport"[\s\S]*width=device-width, initial-scale=1\.0/);
  assert.match(shared, /\.hs-search-page,[\s\S]*\.hs-library-page,[\s\S]*width: 100%/);
  assert.match(shared, /\.mobile-bottom-nav[\s\S]*max-width:100vw/);
  assert.match(shared, /\.hs-search-track__actions,[\s\S]*flex-wrap:wrap/);
});


test("Library albums and artists render as playlist-style rows", () => {
  const library = fs.readFileSync(new URL("./components/pages/LibraryPage.jsx", import.meta.url), "utf8");
  const shared = fs.readFileSync(new URL("./styles/search.css", import.meta.url), "utf8");
  assert.ok(library.includes("hs-library-entity-row hs-search-track"));
  assert.ok(library.includes("hs-search-track__rank"));
  assert.ok(library.includes("hs-search-track__art"));
  assert.ok(library.includes("hs-search-track__copy"));
  assert.ok(shared.includes(".hs-library-entity-row {"));
  assert.match(shared, /\.hs-library-entity-row[\s\S]*grid-template-columns:\s*28px\s+46px\s+minmax\(0,\s*1fr\)\s+18px/);
  assert.doesNotMatch(library, /className="hs-search-entity-card hs-library-entity-card"/);
});


test("mobile rows share one desktop-matched row geometry across Search and Library", () => {
  const shared = fs.readFileSync(new URL("./styles/surfaceConsistency.css", import.meta.url), "utf8");
  const rowSystem = shared.slice(shared.lastIndexOf("MOBILE NORMAL ROW SYSTEM"));
  for (const selector of [".hs-library-playlist-row", ".hs-library-entity-row", ".hs-search-entity-card", ".hs-collaboration-song-row", ".hs-artist-row"]) {
    assert.ok(rowSystem.includes(selector), "missing mobile row selector " + selector);
  }
  assert.match(rowSystem, /grid-template-columns:\s*46px\s+minmax\(0,\s*1fr\)\s+29px/);
  assert.match(rowSystem, /hs-search-track__art[\s\S]*width:\s*46px\s*!important/);
  assert.match(rowSystem, /hs-search-track__copy[\s\S]*grid-column:\s*2\s*!important/);
  assert.match(rowSystem, /hs-search-track__play[\s\S]*width:\s*29px\s*!important/);
  assert.match(rowSystem, /text-overflow:\s*ellipsis\s*!important/);
  assert.match(rowSystem, /white-space:\s*nowrap\s*!important/);
  assert.match(rowSystem, /grid-template-columns:\s*46px\s+minmax\(0,\s*1fr\)\s+29px\s+30px/);
  assert.doesNotMatch(shared, /MOBILE ROW RESTORE|ENTITY ROW TEXT FIX|width:\s*calc\(100%\s*\+\s*300px\)/);
});
