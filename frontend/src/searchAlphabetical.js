function normalizeSortText(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toLocaleLowerCase(
      "en-US",
    );
}


function compareText(
  left,
  right,
) {
  const normalizedLeft =
    normalizeSortText(
      left,
    );

  const normalizedRight =
    normalizeSortText(
      right,
    );

  if (
    normalizedLeft <
    normalizedRight
  ) {
    return -1;
  }

  if (
    normalizedLeft >
    normalizedRight
  ) {
    return 1;
  }

  return 0;
}


function compareWithTieBreaker(
  leftPrimary,
  rightPrimary,
  leftSecondary,
  rightSecondary,
) {
  const primaryResult =
    compareText(
      leftPrimary,
      rightPrimary,
    );

  if (primaryResult !== 0) {
    return primaryResult;
  }

  return compareText(
    leftSecondary,
    rightSecondary,
  );
}


export function alphabetizeSearchResults(
  results,
) {
  return {
    ...results,

    tracks: [
      ...(results?.tracks || []),
    ].sort(
      (left, right) =>
        compareWithTieBreaker(
          left.title,
          right.title,
          left.artist,
          right.artist,
        ),
    ),

    artists: [
      ...(results?.artists || []),
    ].sort(
      (left, right) =>
        compareText(
          left.name,
          right.name,
        ),
    ),

    collaborations: [
      ...(
        results?.collaborations ||
        []
      ),
    ].sort(
      (left, right) =>
        compareText(
          left.name,
          right.name,
        ),
    ),

    albums: [
      ...(results?.albums || []),
    ].sort(
      (left, right) =>
        compareWithTieBreaker(
          left.title,
          right.title,
          left.artist,
          right.artist,
        ),
    ),

    people: [
      ...(results?.people || []),
    ].sort(
      (left, right) =>
        compareWithTieBreaker(
          left.display_name,
          right.display_name,
          left.username,
          right.username,
        ),
    ),
  };
}

export function orderSearchResultsForDisplay(
  results,
) {
  const ordered =
    alphabetizeSearchResults(
      results,
    );

  const intent =
    results?.intent ?? "general";

  if (
    intent === "my_most_played" ||
    intent === "new_releases" ||
    intent === "recent"
  ) {
    ordered.tracks = [
      ...(results?.tracks || []),
    ];
  }

  if (intent === "top_artists") {
    ordered.artists = [
      ...(results?.artists || []),
    ];
  }

  if (intent === "top_albums") {
    ordered.albums = [
      ...(results?.albums || []),
    ];
  }

  if (intent === "people") {
    ordered.people = [
      ...(results?.people || []),
    ];
  }

  return ordered;
}


function matchesSearchQuery(value, query) {
  const normalizedValue = normalizeSortText(value);
  const normalizedQuery = normalizeSortText(query);
  if (!normalizedValue || !normalizedQuery) return false;
  if (normalizedValue.startsWith(normalizedQuery)) return true;
  return normalizedValue.split(/[\\s&,+/|]+/).some((token) => token.startsWith(normalizedQuery));
}


/** Keep short/general searches focused on direct name/title/credit matches. */
export function filterSearchResultsForQuery(results, query) {
  const normalizedQuery = normalizeSortText(query);
  if (!normalizedQuery || normalizedQuery.length < 1) return results;
  const filter = (items, fields) => (items || []).filter((item) => fields.some((field) => matchesSearchQuery(item?.[field], normalizedQuery)));
  return {
    ...results,
    tracks: filter(results?.tracks, ["title", "artist", "album"]),
    artists: filter(results?.artists, ["name"]),
    collaborations: filter(results?.collaborations, ["name"]),
    albums: filter(results?.albums, ["title", "artist"]),
    people: filter(results?.people, ["display_name", "username"]),
    playlists: filter(results?.playlists, ["title", "description", "owner_username"]),
  };
}


export function splitArtistCredits(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const parts = raw.split(/\\s*(?:,|&|\\band\\b|\\bwith\\b|\\bfeat(?:uring)?\\.?|\\bft\\.?|\\bvs\\.?|\\bversus)\\s*|\\s+x\\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

export function isCollaborativeTrack(track) {
  const credits = splitArtistCredits(track?.artist);
  const featured = /\\b(?:feat(?:uring)?|ft)\\.?\\s+[^)\\]}]+/i.test(String(track?.title ?? ""));
  return credits.length > 1 || featured;
}


export function trackArtistCredits(track) {
  const primary = splitArtistCredits(track?.artist);
  const title = String(track?.title ?? "");
  const featureMatch = title.match(/\\b(?:feat(?:uring)?|ft)\\.?\\s+([^)]*)/i);
  const featured = featureMatch ? splitArtistCredits(featureMatch[1].replace(/[\\]}].*$/, "").replace(/\\s*[-–]\\s*(?:live|remix|version).*$/i, "")) : [];
  const merged = [...primary];
  for (const name of featured) if (!merged.some((existing) => normalizeSortText(existing) === normalizeSortText(name))) merged.push(name);
  return merged.join(" & ");
}
