import assert from "node:assert/strict";
import test from "node:test";

import {
  sortResultItems,
} from "./sortResults.js";


const tracks = [
  {
    id: "one",
    title: "Zulu",
    artist: "Beta",
    album: "Second",
    last_played_at:
      "2026-09-20T12:00:00Z",
  },
  {
    id: "two",
    title: "Alpha",
    artist: "Alpha",
    album: "First",
    last_played_at:
      "2026-09-23T12:00:00Z",
  },
  {
    id: "three",
    title: "Bravo",
    artist: "Alpha",
    album: "First",
    last_played_at:
      null,
  },
];


test(
  "smart sort orders played tracks newest first and unplayed tracks last",
  () => {
    assert.deepEqual(
      sortResultItems(
        tracks,
        "smart",
      ).map(
        (track) => track.id,
      ),
      [
        "two",
        "one",
        "three",
      ],
    );
  },
);


test(
  "library smart sort puts recent track metadata first and unknown recency last",
  () => {
    assert.deepEqual(
      sortResultItems(tracks, "librarySmart").map((track) => track.id),
      ["two", "one", "three"],
    );
  },
);

test(
  "recent sort orders played tracks newest first and unplayed tracks last",
  () => {
    assert.deepEqual(
      sortResultItems(tracks, "recent").map((track) => track.id),
      ["two", "one", "three"],
    );
  },
);

test(
  "albums mode groups by album then artist and title",
  () => {
    assert.deepEqual(
      sortResultItems(
        tracks,
        "albums",
      ).map(
        (track) => track.id,
      ),
      [
        "two",
        "three",
        "one",
      ],
    );
  },
);


test(
  "alphabetical sorts by visible title",
  () => {
    assert.deepEqual(
      sortResultItems(
        tracks,
        "alphabetical",
      ).map(
        (track) => track.title,
      ),
      [
        "Alpha",
        "Bravo",
        "Zulu",
      ],
    );
  },
);

test(
  "sorting all search entity types preserves identity and playback index for the clicked track",
  () => {
    const tracks = [
      { id: "track-z", title: "Zulu" },
      { id: "track-a", title: "Alpha" },
      { id: "track-m", title: "Mike" },
    ];
    const playlists = [
      { id: "playlist-z", title: "Zulu Mix" },
      { id: "playlist-a", title: "Alpha Mix" },
    ];
    const artists = [
      { id: "artist-z", name: "Zulu" },
      { id: "artist-a", name: "Alpha" },
    ];
    const sortedTracks = sortResultItems(tracks, "alphabetical");
    const sortedPlaylists = sortResultItems(playlists, "alphabetical");
    const sortedArtists = sortResultItems(artists, "alphabetical");

    assert.deepEqual(sortedTracks.map((item) => item.id), ["track-a", "track-m", "track-z"]);
    assert.deepEqual(sortedPlaylists.map((item) => item.id), ["playlist-a", "playlist-z"]);
    assert.deepEqual(sortedArtists.map((item) => item.id), ["artist-a", "artist-z"]);

    const clickedId = "track-m";
    const queueIndex = sortedTracks.findIndex((item) => String(item.id) === clickedId);
    assert.equal(sortedTracks[queueIndex].id, clickedId);
  },
);
