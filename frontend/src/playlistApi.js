import {
  apiRequest,
} from "./api/client.js";


export function getLibraryChanges() {
  return apiRequest("/playlists/library/changes");
}


export function getMyPlaylists() {
  return apiRequest(
    "/playlists/mine",
  );
}


export function getSavedPlaylists() {
  return apiRequest(
    "/playlists/saved",
  );
}


export const LIBRARY_TRACKS_PAGE_SIZE = 1000;
const TRACKS_PAGE_SIZE = LIBRARY_TRACKS_PAGE_SIZE;


function buildTrackPageQuery(
  limit,
  offset,
) {
  const params = new URLSearchParams();
  const hasOffset =
    Number.isInteger(offset) && offset >= 0;
  const pageLimit =
    Number.isInteger(limit) && limit > 0
      ? limit
      : hasOffset
        ? TRACKS_PAGE_SIZE
        : null;

  if (pageLimit !== null) {
    params.set("limit", String(pageLimit));
    params.set(
      "offset",
      String(hasOffset ? offset : 0),
    );
  }

  return params.toString();
}


async function getAllLibraryTrackPages() {
  const tracks = [];

  for (
    let offset = 0;
    ;
    offset += TRACKS_PAGE_SIZE
  ) {
    const query = buildTrackPageQuery(
      TRACKS_PAGE_SIZE,
      offset,
    );
    const page = await apiRequest(
      `/playlists/library/tracks?${query}`,
    );
    const pageTracks = Array.isArray(page)
      ? page
      : [];

    tracks.push(...pageTracks);

    if (pageTracks.length < TRACKS_PAGE_SIZE) {
      return tracks;
    }
  }
}


export function getLibraryTracks({
  limit,
  offset,
} = {}) {
  if (
    !Number.isInteger(limit) &&
    !Number.isInteger(offset)
  ) {
    return getAllLibraryTrackPages();
  }

  const query = buildTrackPageQuery(
    limit,
    offset,
  );

  return apiRequest(
    "/playlists/library/tracks" +
      (query ? `?${query}` : ""),
  );
}


export async function getLibraryTrack(
  trackId,
) {
  const normalizedTrackId =
    String(
      trackId ?? "",
    ).trim();

  if (!normalizedTrackId) {
    return null;
  }

  /*
   * Resolve a single track directly instead of downloading and scanning
   * the user's entire library for every track action. This is important
   * for large libraries and avoids multiplying a full-library response
   * by each offline-download or liked-song action.
   */
  try {
    return await apiRequest(
      `/catalog/tracks/${encodeURIComponent(
        normalizedTrackId,
      )}`,
    );
  } catch {
    return null;
  }
}


export async function getPlaylist(
  playlistId,
  {
    limit,
    offset,
  } = {},
) {
  const encodedId = encodeURIComponent(
    playlistId,
  );
  const explicitlyPaged =
    Number.isInteger(limit) ||
    Number.isInteger(offset);

  if (explicitlyPaged) {
    const query = buildTrackPageQuery(
      limit,
      offset,
    );

    return apiRequest(
      `/playlists/${encodedId}` +
        (query ? `?${query}` : ""),
    );
  }

  const firstQuery = buildTrackPageQuery(
    TRACKS_PAGE_SIZE,
    0,
  );
  const firstPage = await apiRequest(
    `/playlists/${encodedId}?${firstQuery}`,
  );
  const tracks = Array.isArray(firstPage?.tracks)
    ? [...firstPage.tracks]
    : [];

  if (tracks.length < TRACKS_PAGE_SIZE) {
    return {
      ...firstPage,
      tracks,
    };
  }

  const expectedTrackCount = Number(firstPage?.track_count);

  if (
    Number.isInteger(expectedTrackCount) &&
    expectedTrackCount > tracks.length
  ) {
    const remainingOffsets = [];
    for (
      let pageOffset = TRACKS_PAGE_SIZE;
      pageOffset < expectedTrackCount;
      pageOffset += TRACKS_PAGE_SIZE
    ) {
      remainingOffsets.push(pageOffset);
    }

    // Keep collection opening responsive without flooding the API for very
    // large playlists. Each small batch is fetched concurrently, then appended
    // in offset order so playback order remains unchanged.
    const PAGE_REQUEST_CONCURRENCY = 3;
    for (
      let index = 0;
      index < remainingOffsets.length;
      index += PAGE_REQUEST_CONCURRENCY
    ) {
      const batchOffsets = remainingOffsets.slice(
        index,
        index + PAGE_REQUEST_CONCURRENCY,
      );
      const pages = await Promise.all(
        batchOffsets.map(async (pageOffset) => {
          const query = buildTrackPageQuery(
            TRACKS_PAGE_SIZE,
            pageOffset,
          );
          return apiRequest(
            `/playlists/${encodedId}?${query}`,
          );
        }),
      );

      for (const page of pages) {
        if (Array.isArray(page?.tracks)) {
          tracks.push(...page.tracks);
        }
      }
    }

    return {
      ...firstPage,
      tracks,
    };
  }

  // Older API responses may not include track_count. Preserve the safe
  // short-page termination behavior for those responses.
  for (
    let pageOffset = TRACKS_PAGE_SIZE;
    ;
    pageOffset += TRACKS_PAGE_SIZE
  ) {
    const query = buildTrackPageQuery(
      TRACKS_PAGE_SIZE,
      pageOffset,
    );
    const page = await apiRequest(
      `/playlists/${encodedId}?${query}`,
    );
    const pageTracks = Array.isArray(page?.tracks)
      ? page.tracks
      : [];

    tracks.push(...pageTracks);

    if (pageTracks.length < TRACKS_PAGE_SIZE) {
      return {
        ...firstPage,
        tracks,
      };
    }
  }
}


export function searchPlaylists(
  query,
) {
  const params =
    new URLSearchParams({
      q:
        String(
          query ?? "",
        ).trim(),
    });

  return apiRequest(
    `/playlists/search?${params.toString()}`,
  );
}


export function generateSmartPlaylist(
  query,
) {
  return apiRequest(
    "/playlists/generated",
    {
      method:
        "POST",

      body:
        JSON.stringify({
          query:
            String(
              query ?? "",
            ).trim(),
        }),
    },
  );
}


export function createPlaylist({
  title,
  description = null,
  visibility = "private",
}) {
  return apiRequest(
    "/playlists",
    {
      method:
        "POST",

      body:
        JSON.stringify({
          title,
          description,
          visibility,
        }),
    },
  );
}


export function updatePlaylist(
  playlistId,
  changes,
) {
  return apiRequest(
    `/playlists/${encodeURIComponent(
      playlistId,
    )}`,
    {
      method:
        "PATCH",

      body:
        JSON.stringify(
          changes,
        ),
    },
  );
}


export function deletePlaylist(
  playlistId,
) {
  return apiRequest(
    `/playlists/${encodeURIComponent(
      playlistId,
    )}`,
    {
      method:
        "DELETE",
    },
  );
}


export function addTrackToPlaylist(
  playlistId,
  trackId,
) {
  return apiRequest(
    `/playlists/${encodeURIComponent(
      playlistId,
    )}/tracks`,
    {
      method:
        "POST",

      body:
        JSON.stringify({
          track_id:
            trackId,
        }),
    },
  );
}


export function removeTrackFromPlaylist(
  playlistId,
  playlistTrackId,
) {
  return apiRequest(
    `/playlists/${encodeURIComponent(
      playlistId,
    )}/tracks/${encodeURIComponent(
      playlistTrackId,
    )}`,
    {
      method:
        "DELETE",
    },
  );
}


export function reorderPlaylistTracks(
  playlistId,
  playlistTrackIds,
) {
  return apiRequest(
    `/playlists/${encodeURIComponent(
      playlistId,
    )}/tracks/reorder`,
    {
      method:
        "PUT",

      body:
        JSON.stringify({
          playlist_track_ids:
            playlistTrackIds,
        }),
    },
  );
}


export function savePlaylist(
  playlistId,
) {
  return apiRequest(
    `/playlists/${encodeURIComponent(
      playlistId,
    )}/save`,
    {
      method:
        "POST",
    },
  );
}


export function unsavePlaylist(
  playlistId,
) {
  return apiRequest(
    `/playlists/${encodeURIComponent(
      playlistId,
    )}/save`,
    {
      method:
        "DELETE",
    },
  );
}

export function getLikedTrackState(
  trackId,
) {
  return apiRequest(
    `/playlists/liked/tracks/${encodeURIComponent(
      trackId,
    )}`,
  );
}


export function likeTrack(
  trackId,
) {
  return apiRequest(
    `/playlists/liked/tracks/${encodeURIComponent(
      trackId,
    )}`,
    {
      method: "POST",
    },
  );
}


export function unlikeTrack(
  trackId,
) {
  return apiRequest(
    `/playlists/liked/tracks/${encodeURIComponent(
      trackId,
    )}`,
    {
      method: "DELETE",
    },
  );
}

