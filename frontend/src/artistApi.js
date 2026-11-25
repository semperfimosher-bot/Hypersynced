import {
  apiRequest,
} from "./api/client.js";


const artistProfileCache = new Map();
const ARTIST_PROFILE_CACHE_LIMIT = 12;

function artistProfileCacheKey(name) {
  return String(name || "").trim().toLocaleLowerCase();
}

export function getCachedArtistProfile(artistName) {
  return artistProfileCache.get(artistProfileCacheKey(artistName)) ?? null;
}

function cacheArtistProfile(profile) {
  if (profile?.name) {
    const key = artistProfileCacheKey(profile.name);
    artistProfileCache.delete(key);
    artistProfileCache.set(key, profile);
    while (artistProfileCache.size > ARTIST_PROFILE_CACHE_LIMIT) {
      const oldestKey = artistProfileCache.keys().next().value;
      artistProfileCache.delete(oldestKey);
    }
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
