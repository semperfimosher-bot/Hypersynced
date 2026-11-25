import {
  apiRequest,
} from "./api/client.js";


const artistProfileCache = new Map();

function artistProfileCacheKey(name) {
  return String(name || "").trim().toLocaleLowerCase();
}

export function getCachedArtistProfile(artistName) {
  return artistProfileCache.get(artistProfileCacheKey(artistName)) ?? null;
}

function cacheArtistProfile(profile) {
  if (profile?.name) {
    artistProfileCache.set(artistProfileCacheKey(profile.name), profile);
  }
  return profile;
}

export async function getArtistProfile(
  artistName,
) {
  const profile = await apiRequest(
    "/artists/" +
      encodeURIComponent(
        artistName,
      ),
  );
  return cacheArtistProfile(profile);
}


export async function followArtist(
  artistName,
) {
  return cacheArtistProfile(await apiRequest(
    "/artists/" +
      encodeURIComponent(
        artistName,
      ) +
      "/follow",
    {
      method:
        "POST",
    },
  ));
}


export async function unfollowArtist(
  artistName,
) {
  return cacheArtistProfile(await apiRequest(
    "/artists/" +
      encodeURIComponent(
        artistName,
      ) +
      "/follow",
    {
      method:
        "DELETE",
    },
  ));
}
