import assert from "node:assert/strict";
import {
  existsSync,
} from "node:fs";
import test from "node:test";
import { filterSearchResultsForQuery, splitArtistCredits, isCollaborativeTrack } from "./searchAlphabetical.js";


const moduleUrl =
  new URL(
    "./searchAlphabetical.js",
    import.meta.url,
  );


test(
  "search results are alphabetized without mutating the original arrays",
  async () => {
    assert.ok(
      existsSync(moduleUrl),
      "Expected searchAlphabetical.js to exist.",
    );

    const {
      alphabetizeSearchResults,
    } = await import(
      "./searchAlphabetical.js"
    );

    const results = {
      tracks: [
        {
          id: "3",
          title: "Zulu",
          artist: "Beta",
        },
        {
          id: "1",
          title: "Alpha",
          artist: "Zulu",
        },
        {
          id: "2",
          title: "Alpha",
          artist: "Beta",
        },
      ],

      artists: [
        { name: "Zulu" },
        { name: "alpha" },
        { name: "Beta" },
      ],

      collaborations: [
        { name: "Zulu & Beta" },
        { name: "Alpha & Beta" },
      ],

      albums: [
        {
          title: "Zulu",
          artist: "Alpha",
        },
        {
          title: "Alpha",
          artist: "Zulu",
        },
        {
          title: "Alpha",
          artist: "Beta",
        },
      ],

      people: [
        {
          display_name: "Zulu",
          username: "zulu",
        },
        {
          display_name: "Alpha",
          username: "zebra",
        },
        {
          display_name: "Alpha",
          username: "apple",
        },
      ],
    };

    const originalTracks =
      [...results.tracks];

    const sorted =
      alphabetizeSearchResults(
        results,
      );

    assert.deepEqual(
      sorted.tracks.map(
        (track) =>
          `${track.title}:${track.artist}`,
      ),
      [
        "Alpha:Beta",
        "Alpha:Zulu",
        "Zulu:Beta",
      ],
    );

    assert.deepEqual(
      sorted.artists.map(
        (artist) => artist.name,
      ),
      [
        "alpha",
        "Beta",
        "Zulu",
      ],
    );

    assert.deepEqual(
      sorted.collaborations.map(
        (item) => item.name,
      ),
      [
        "Alpha & Beta",
        "Zulu & Beta",
      ],
    );

    assert.deepEqual(
      sorted.albums.map(
        (album) =>
          `${album.title}:${album.artist}`,
      ),
      [
        "Alpha:Beta",
        "Alpha:Zulu",
        "Zulu:Alpha",
      ],
    );

    assert.deepEqual(
      sorted.people.map(
        (person) =>
          `${person.display_name}:${person.username}`,
      ),
      [
        "Alpha:apple",
        "Alpha:zebra",
        "Zulu:zulu",
      ],
    );

    assert.deepEqual(
      results.tracks,
      originalTracks,
      "Original results must not be mutated.",
    );
  },
);


test("short search terms only return direct name/title/credit matches", () => {

  const result = filterSearchResultsForQuery({
    tracks:[{title:"Moonlight",artist:"Morgan",album:"Midnight"},{title:"Summer",artist:"Taylor",album:"Daylight"}],
    artists:[{name:"Morgan"},{name:"Taylor"}],
    collaborations:[],albums:[{title:"Midnight",artist:"Morgan"},{title:"Summer",artist:"Taylor"}],
    people:[],playlists:[{title:"Morgan Mix",description:""},{title:"Summer Hits",description:""}],
  }, "m");
  assert.deepEqual(result.artists.map(x=>x.name),["Morgan"]);
  assert.deepEqual(result.tracks.map(x=>x.title),["Moonlight"]);
  assert.deepEqual(result.playlists.map(x=>x.title),["Morgan Mix"]);
});

test("artist credits split collaboration names into distinct profile targets", () => {

  assert.deepEqual(splitArtistCredits("Artist One feat. Artist Two"),["Artist One","Artist Two"]);
  assert.equal(isCollaborativeTrack({artist:"Artist One & Artist Two",title:"Song"}),true);
  assert.equal(isCollaborativeTrack({artist:"Artist One",title:"Song ft Artist Two"}),true);
});
