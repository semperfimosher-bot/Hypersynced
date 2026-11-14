/*
 * Ephemeral playback snapshot only. Neon is the authoritative playback
 * store; this Map exists solely for same-runtime coordination and is never
 * written to browser storage.
 */

const states = new Map();

function normalizeOwner(userId) {
  return String(userId ?? "").trim();
}

export function readPersistedPlayerState(userId) {
  const owner = normalizeOwner(userId);
  if (!owner) return null;
  const state = states.get(owner);
  return state ? { ...state, meta: state.meta ? { ...state.meta } : null } : null;
}

export function writePersistedPlayerState(userId, state) {
  const owner = normalizeOwner(userId);
  if (!owner || !state?.trackId) return;
  states.set(owner, {
    ...state,
    meta: state.meta ? { ...state.meta } : null,
    version: 1,
    savedAt: Date.now(),
  });
}

export function clearPersistedPlayerState(userId) {
  const owner = normalizeOwner(userId);
  if (owner) states.delete(owner);
}
