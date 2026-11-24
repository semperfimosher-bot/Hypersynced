import assert from "node:assert/strict";
import test from "node:test";
import * as constants from "./constants.js";

test("search exposes the requested functional vibe commands", () => {
  assert.deepEqual(constants.SEARCH_QUICK_COMMANDS, [
    { id: "pop", label: "Pop", query: "pop", filter: "tracks", focus: false },
    { id: "country", label: "Country", query: "country", filter: "tracks", focus: false },
    { id: "rock", label: "Rock", query: "rock", filter: "tracks", focus: false },
    { id: "electronic", label: "Electronic", query: "electronic", filter: "tracks", focus: false },
    { id: "rap-hip-hop", label: "Rap / Hip-Hop", query: "rap hip hop", filter: "tracks", focus: false },
    { id: "alternative", label: "Alternative", query: "alternative", filter: "tracks", focus: false },
    { id: "chill", label: "Chill", query: "chill", filter: "tracks", focus: false },
    { id: "driving", label: "Driving", query: "driving", filter: "tracks", focus: false },
    { id: "hype", label: "Hype", query: "hype", filter: "tracks", focus: false },
  ]);
  assert.equal(new Set(constants.SEARCH_QUICK_COMMANDS.map((item) => item.id)).size, 9);
  assert.ok(constants.SEARCH_QUICK_COMMANDS.every((item) => item.filter === "tracks" && item.query.trim()));
});
