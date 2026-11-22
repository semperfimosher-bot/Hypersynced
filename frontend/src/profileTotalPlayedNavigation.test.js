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
});
