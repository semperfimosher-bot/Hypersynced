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
  assert.match(appSource, /<TotalPlayedPage currentUser=\{currentUser\} onNavigate=\{onNavigate\} isActive=\{activePage === "total-played"\} \/>/);
  const totalPlayedSource = fs.readFileSync(new URL("./components/pages/TotalPlayedPage.jsx", import.meta.url), "utf8");
  assert.match(totalPlayedSource, /rootMargin: "1400px 0px"/);
  assert.match(totalPlayedSource, /tracksRef\.current/);
});
