import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("ProfilePage receives navigation callback for Total Played stat", () => {
  const appSource = fs.readFileSync(
    new URL("./App.jsx", import.meta.url),
    "utf8",
  );
  const profileSource = fs.readFileSync(
    new URL("./components/pages/ProfilePage.jsx", import.meta.url),
    "utf8",
  );

  const profileRender = appSource.slice(
    appSource.indexOf("<ProfilePage"),
    appSource.indexOf("<PublicProfilePage"),
  );

  assert.match(profileRender, /onNavigate\s*=\s*\{\s*onNavigate\s*\}/);
  assert.match(profileSource, /label="Total Played"[\s\S]*?onClick=\{\s*\(\)\s*=>\s*onNavigate\?\.\("total-played"\)/);
  assert.match(appSource, /totalPlayedVisited/);
  assert.match(appSource, /hs-total-played-keepalive/);
  assert.match(appSource, /totalPlayedScrollPositionRef/);
  assert.match(appSource, /main\.scrollTop = totalPlayedScrollPositionRef\.current/);
  assert.match(appSource, /<TotalPlayedPage currentUser=\{currentUser\} isActive=\{activePage === "total-played"\} \/>/);
  const totalPlayedSource = fs.readFileSync(new URL("./components/pages/TotalPlayedPage.jsx", import.meta.url), "utf8");
  assert.match(totalPlayedSource, /rootMargin: "1400px 0px"/);
  assert.match(totalPlayedSource, /tracksRef\.current/);
  assert.doesNotMatch(totalPlayedSource, /Back to Profile|hs-search-playlist-back/);
  assert.match(profileSource, /DATA FROM ACROSS ACCOUNT/);
  assert.match(profileSource, /PER THIS DEVICE/);
});


test("Per Device Played opens a local-history page matching Total Played rows", () => {
  const profile = fs.readFileSync(new URL("./components/pages/ProfilePage.jsx", import.meta.url), "utf8");
  const appSource = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const devicePage = fs.readFileSync(new URL("./components/pages/DevicePlayedPage.jsx", import.meta.url), "utf8");
  const stats = fs.readFileSync(new URL("./deviceListeningStats.js", import.meta.url), "utf8");
  assert.match(profile, /deviceListeningStats\.tracksPlayed\.toLocaleString\(\)[\s\S]*?onClick=\{\(\) => onNavigate\?\.\("device-played"\)\}/);
  assert.ok(appSource.includes('page === "device-played"'));
  assert.ok(appSource.includes('case "device-played"'));
  assert.ok(devicePage.includes("hs-total-played-track"));
  assert.ok(devicePage.includes("hs-total-played-table-head"));
  assert.ok(devicePage.includes("DEVICE_PLAYED_HISTORY_CHANGED_EVENT"));
  assert.ok(devicePage.includes("readDevicePlayedHistory"));
  assert.ok(stats.includes("saveDevicePlayedHistory"));
  assert.ok(stats.includes("DEVICE_PLAYED_HISTORY_CHANGED_EVENT"));
});
