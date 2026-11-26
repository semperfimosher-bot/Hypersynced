import {
  apiRequest,
} from "./api/client.js";

const artistProfileCache = new Map();
const ARTIST_PROFILE_CACHE_LIMIT = 12;
const PERSISTED_FOLLOWED_ARTISTS_LIMIT = 12;
const PERSISTED_ARTIST_CACHE_PREFIX = "hypersynced.followed-artist-cache.v1:";
function artistProfileCacheKey(name, owner = "guest") {
  return String(owner || "guest") + "|" + String(name || "").trim().toLocaleLowerCase();
}
function persistedKey(owner) {
  return PERSISTED_ARTIST_CACHE_PREFIX + encodeURIComponent(String(owner || "guest"));
}
function stripTransientAudioUrls(value) {
  if (Array.isArray(value)) return value.map(stripTransientAudioUrls);
  if (!value || typeof value !== "object") return value;
  const transient = new Set(["audio_url", "audiourl", "media_url", "mediaurl", "signed_url", "signedurl", "stream_url", "streamurl"]);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !transient.has(key.toLowerCase())).map(([key, nested]) => [key, stripTransientAudioUrls(nested)]));
}
function readPersistedArtist(owner, name) {
  if (!owner || owner === "guest") return null;
  try {
    const entries = JSON.parse(localStorage.getItem(persistedKey(owner)) || "[]");
    const match = Array.isArray(entries) ? entries.find(entry => String(entry?.name || "").toLocaleLowerCase() === String(name || "").trim().toLocaleLowerCase()) : null;
    if (!match || Date.now() - Number(match.cachedAt || 0) > 30 * 24 * 60 * 60 * 1000) return null;
    return match.profile || null;
  } catch { return null; }
}
export function getCachedArtistProfile(artistName, owner = "guest") {
  const key = artistProfileCacheKey(artistName, owner);
  return artistProfileCache.get(key) ?? readPersistedArtist(owner, artistName) ?? null;
}
function cacheArtistProfile(profile, owner = "guest") {
  if (profile?.name) {
    const key = artistProfileCacheKey(profile.name, owner);
    artistProfileCache.delete(key);
    artistProfileCache.set(key, profile);
    while (artistProfileCache.size > ARTIST_PROFILE_CACHE_LIMIT) artistProfileCache.delete(artistProfileCache.keys().next().value);
    if (owner && owner !== "guest") {
      try {
        const storageKey = persistedKey(owner);
        const previous = JSON.parse(localStorage.getItem(storageKey) || "[]");
        const entries = Array.isArray(previous) ? previous.filter(entry => String(entry?.name || "").toLocaleLowerCase() !== String(profile.name).toLocaleLowerCase()) : [];
        if (profile.is_following) {
          entries.unshift({ name: profile.name, cachedAt: Date.now(), profile: stripTransientAudioUrls(profile) });
        }
        localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, PERSISTED_FOLLOWED_ARTISTS_LIMIT)));
      } catch { /* Cache storage is optional; server profile remains authoritative. */ }
    }
  }
  return profile;
}
export async function getArtistProfile(artistName, owner = "guest") {
  return cacheArtistProfile(await apiRequest("/artists/" + encodeURIComponent(artistName)), owner);
}
export async function getArtistArtworkStatus(artistName) {
  return apiRequest("/artists/" + encodeURIComponent(artistName) + "/artwork");
}
export async function followArtist(artistName, owner = "guest") {
  return cacheArtistProfile(await apiRequest("/artists/" + encodeURIComponent(artistName) + "/follow", { method: "POST" }), owner);
}
export async function unfollowArtist(artistName, owner = "guest") {
  return cacheArtistProfile(await apiRequest("/artists/" + encodeURIComponent(artistName) + "/follow", { method: "DELETE" }), owner);
}
