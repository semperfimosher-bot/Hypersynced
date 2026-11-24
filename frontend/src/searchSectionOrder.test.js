import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";


const searchPageSource =
  readFileSync(
    new URL(
      "./components/pages/SearchPage.jsx",
      import.meta.url,
    ),
    "utf8",
  );

const searchStylesSource = readFileSync(
  new URL("../styles/search.css", import.meta.url),
  "utf8",
);

const messagesPageSource = readFileSync(
  new URL("./components/pages/MessagesPage.jsx", import.meta.url),
  "utf8",
);


test(
  "search result sections preserve the current discovery layout",
  () => {
    const playlistIndex =
      searchPageSource.indexOf(
        "{showPlaylists &&",
      );

    const discoveryIndex =
      searchPageSource.indexOf(
        'className="hs-search-discovery-shell"',
      );

    const discoveryGridIndex =
      searchPageSource.indexOf(
        'className="hs-search-discovery-grid"',
        discoveryIndex,
      );

    const albumIndex =
      searchPageSource.indexOf(
        "{albumPanel}",
        discoveryGridIndex,
      );

    const artistIndex =
      searchPageSource.indexOf(
        "{artistPanel}",
        discoveryGridIndex,
      );

    const collaborationIndex =
      searchPageSource.indexOf(
        "{collaborationPanel}",
        discoveryGridIndex,
      );

    const peopleIndex =
      searchPageSource.indexOf(
        "{showPeople &&",
      );

    const tracksIndex =
      searchPageSource.indexOf(
        "{showTracks &&",
      );


    assert.ok(
      playlistIndex >= 0,
      "Playlist section was not found.",
    );

    assert.ok(
      discoveryIndex >= 0,
      "Discovery section was not found.",
    );

    assert.ok(
      albumIndex >= 0,
      "Album panel was not found.",
    );

    assert.ok(
      artistIndex >= 0,
      "Artist panel was not found.",
    );

    assert.ok(
      collaborationIndex >= 0,
      "Collaboration panel was not found.",
    );

    assert.ok(
      peopleIndex >= 0,
      "People section was not found.",
    );

    assert.ok(
      tracksIndex >= 0,
      "Tracks section was not found.",
    );


    assert.ok(
      playlistIndex <
        discoveryIndex,
      "Playlists must stay above the discovery deck.",
    );

    assert.ok(
      albumIndex <
        artistIndex,
      "Albums must appear before Artists.",
    );

    assert.ok(
      artistIndex <
        collaborationIndex,
      "Artists must appear before Collaborations.",
    );

    assert.ok(
      tracksIndex <
        discoveryIndex,
      "Tracks must stay above the discovery deck.",
    );

    assert.ok(
      discoveryIndex <
        peopleIndex,
      "Discovery sections must appear before People.",
    );
  },
);

test(
  "search completion state is defined and empty-state only follows the current completed query",
  () => {
    assert.match(searchPageSource, /const \[completedSearchQuery, setCompletedSearchQuery\] = useState/);
    assert.match(searchPageSource, /completedSearchQuery === normalizedQuery/);
    assert.match(searchPageSource, /setCompletedSearchQuery\(normalizedQuery\)/);
    const timerIndex = searchPageSource.indexOf("const timer =");
    const timerBody = searchPageSource.slice(timerIndex, timerIndex + 12000);
    assert.match(timerBody, /\},\s*0,\s*\);/);
  },
);


test("search shortcut polish and instant social cache are present", () => {
  assert.match(searchPageSource, /is-newly-released/);
  assert.match(searchStylesSource, /hs-search-discovery__tile\.is-newly-released::before/);
  assert.match(searchStylesSource, /min-height: 82px/);
  assert.match(searchStylesSource, /hs-library-console \.hs-search-primary-action/);
  assert.match(searchStylesSource, /hs-library-console \.hs-search-filterbar/);
  assert.doesNotMatch(messagesPageSource, /hs-messages-unread/);
});


test("search history appears only as matching suggestions while typing and discovery tiles warm artwork", () => {
  assert.match(searchPageSource, /normalizedQuery && !openedPlaylist && recentSearches\.length/);
  assert.match(searchPageSource, /hs-search-history-suggestions/);
  assert.doesNotMatch(searchPageSource, /YOUR HISTORY/);
  assert.match(searchPageSource, /discoveryArtworkCache/);
  assert.match(searchPageSource, /getSuggestedMusic\(\{ limit: 12, homeExplore: false \}\)/);
  assert.match(searchPageSource, /PlaylistArtwork/);
  assert.match(searchStylesSource, /hs-search-history-suggestions/);
  assert.match(searchStylesSource, /hs-search-discovery__tile-art/);
});
