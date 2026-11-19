const PREFIX = "hypersynced.profile-snapshot.v1:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function keyFor(owner) {
  const id = String(owner ?? "").trim();
  return id ? PREFIX + encodeURIComponent(id) : "";
}

function sanitizeProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  const recent = Array.isArray(profile.recently_played)
    ? profile.recently_played.slice(0, 12).map((track) => {
      if (!track || track.id == null) return null;
      const copy = { ...track };
      delete copy.audio_url;
      delete copy.src;
      delete copy.media_url;
      return copy;
    }).filter(Boolean)
    : [];
  return {
    display_name: profile.display_name ?? null,
    bio: profile.bio ?? "",
    avatar_url: profile.avatar_url ?? null,
    member_since: profile.member_since ?? null,
    music_activity_public: Boolean(profile.music_activity_public),
    followers_count: Number(profile.followers_count) || 0,
    following_count: Number(profile.following_count) || 0,
    tracks_played: Number(profile.tracks_played) || 0,
    hours_listened: Number(profile.hours_listened) || 0,
    pending_requests_count: Number(profile.pending_requests_count) || 0,
    recently_played: recent,
    top_artists: Array.isArray(profile.top_artists)
      ? profile.top_artists.slice(0, 12).map((artist) => ({
        artist: String(artist?.artist ?? ""),
        plays: Number(artist?.plays) || 0,
      }))
      : [],
  };
}

export function readProfileSnapshot(owner, now = Date.now()) {
  const key = keyFor(owner);
  if (!key) return null;
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    const savedAt = Number(snapshot?.savedAt);
    if (!Number.isFinite(savedAt) || now - savedAt > TTL_MS || savedAt > now + 60_000) {
      storage()?.removeItem(key);
      return null;
    }
    return sanitizeProfile(snapshot.profile);
  } catch {
    return null;
  }
}

export function writeProfileSnapshot(owner, profile, now = Date.now()) {
  const key = keyFor(owner);
  if (!key || !profile || typeof profile !== "object") return false;
  const sanitized = sanitizeProfile(profile);
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(key, JSON.stringify({ savedAt: now, profile: sanitized }));
    return true;
  } catch {
    return false;
  }
}

export function clearProfileSnapshot(owner) {
  const key = keyFor(owner);
  if (!key) return;
  try { storage()?.removeItem(key); } catch {}
}
