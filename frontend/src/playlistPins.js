/*
 * Playlist pins currently have no corresponding field or endpoint in the
 * existing Neon schema. Keep this small presentation preference in memory
 * only rather than silently treating browser storage as account persistence.
 */

const pinnedByOwner = new Map();

function normalizeOwner(ownerKey) {
  return String(ownerKey ?? "anonymous").trim() || "anonymous";
}

function normalizeIds(playlistIds) {
  return Array.from(new Set(
    (Array.isArray(playlistIds) ? playlistIds : [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  ));
}

export function readPinnedPlaylistIds(ownerKey) {
  return [...(pinnedByOwner.get(normalizeOwner(ownerKey)) ?? [])];
}

export function writePinnedPlaylistIds(ownerKey, playlistIds) {
  const normalized = normalizeIds(playlistIds);
  pinnedByOwner.set(normalizeOwner(ownerKey), normalized);
  return normalized;
}

export function togglePinnedPlaylistId(playlistIds, playlistId) {
  const id = String(playlistId ?? "").trim();
  if (!id) return Array.isArray(playlistIds) ? playlistIds : [];
  const current = new Set(normalizeIds(playlistIds));
  if (current.has(id)) current.delete(id);
  else current.add(id);
  return Array.from(current);
}

export function sortPinnedPlaylists(playlists, pinnedPlaylistIds) {
  const pinned = new Set(normalizeIds(pinnedPlaylistIds));
  const input = Array.isArray(playlists) ? playlists : [];
  return [
    ...input.filter((playlist) => pinned.has(String(playlist?.id ?? ""))),
    ...input.filter((playlist) => !pinned.has(String(playlist?.id ?? ""))),
  ];
}
