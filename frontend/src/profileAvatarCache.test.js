import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cache = fs.readFileSync(new URL("./profileAvatarCache.js", import.meta.url), "utf8");
const avatar = fs.readFileSync(new URL("./components/profile/Avatar.jsx", import.meta.url), "utf8");

test("profile avatars use a bounded persistent cache and eager image loading", () => {
  assert.match(cache, /indexedDB\.open\(DATABASE_NAME/);
  assert.match(cache, /MAX_AVATAR_ENTRIES\s*=\s*48/);
  assert.match(cache, /MAX_AVATAR_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
  assert.match(avatar, /getProfileAvatarBlob/);
  assert.match(avatar, /putProfileAvatarBlob/);
  assert.match(avatar, /loading="eager"/);
  assert.match(avatar, /fetchPriority="high"/);
});
