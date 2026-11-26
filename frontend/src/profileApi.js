import {
  apiRequest,
} from "./api/client.js";


export async function getMyProfile() {
  return apiRequest(
    "/users/me",
    { cache: "no-store" },
  );
}


export function getMyRecentlyPlayed({ limit = 12 } = {}) {
  return apiRequest(
    `/users/me/recently-played?limit=${encodeURIComponent(limit)}`,
    { cache: "no-store" },
  );
}




export function getMyTotalPlayed({ limit = 100, offset = 0 } = {}) {
  return apiRequest(
    `/users/me/total-played?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
    { cache: "no-store" },
  );
}

export function getSuggestedMusic({ currentTrackId = null, excludeTrackIds = [], contextTrackIds = [], limit = 12, homeExplore = false, neverPlayedOnly = false } = {}) {
  return apiRequest("/recommendations/autoplay", {
    method: "POST",
    body: JSON.stringify({ current_track_id: currentTrackId, exclude_track_ids: excludeTrackIds, context_track_ids: contextTrackIds, limit, home_explore: homeExplore, never_played_only: neverPlayedOnly }),
  });
}


export async function updateMyProfile({
  displayName,
  bio,
}) {
  return apiRequest(
    "/users/me/profile",
    {
      method: "PATCH",

      body: JSON.stringify({
        display_name: displayName,
        bio,
      }),
    },
  );
}


export async function updatePrivacy(
  musicActivityPublic,
) {
  return apiRequest(
    "/users/me/privacy",
    {
      method: "PATCH",

      body: JSON.stringify({
        music_activity_public:
          musicActivityPublic,
      }),
    },
  );
}


export async function getPublicProfile(
  username,
) {
  return apiRequest(
    `/users/${encodeURIComponent(
      username,
    )}`,
  );
}


export async function followUser(
  username,
) {
  return apiRequest(
    `/users/${encodeURIComponent(
      username,
    )}/follow`,
    {
      method: "POST",
    },
  );
}


export async function unfollowUser(
  username,
) {
  return apiRequest(
    `/users/${encodeURIComponent(
      username,
    )}/follow`,
    {
      method: "DELETE",
    },
  );
}


export async function uploadProfileAvatar(
  file,
) {
  const formData =
    new FormData();

  formData.append(
    "file",
    file,
  );

  return apiRequest(
    "/users/me/avatar",
    {
      method: "POST",
      body: formData,
    },
  );
}


export async function removeProfileAvatar() {
  return apiRequest(
    "/users/me/avatar",
    {
      method: "DELETE",
    },
  );
}


export async function getFollowRequests() {
  return apiRequest(
    "/users/me/follow-requests",
  );
}


export async function acceptFollowRequest(
  username,
) {
  return apiRequest(
    `/users/me/follow-requests/${encodeURIComponent(
      username,
    )}/accept`,
    {
      method: "POST",
    },
  );
}


export async function declineFollowRequest(
  username,
) {
  return apiRequest(
    `/users/me/follow-requests/${encodeURIComponent(
      username,
    )}`,
    {
      method: "DELETE",
    },
  );
}


export async function getFollowers(
  username,
) {
  return apiRequest(
    `/users/${encodeURIComponent(
      username,
    )}/followers`,
  );
}


export async function getFollowing(
  username,
) {
  return apiRequest(
    `/users/${encodeURIComponent(
      username,
    )}/following`,
  );
}


export async function searchUsers(
  query,
) {
  return apiRequest(
    `/users/search?q=${encodeURIComponent(
      query,
    )}`,
  );
}


export function getFollowedArtists() {
  return apiRequest("/artists/following", { cache: "no-store" });
}
