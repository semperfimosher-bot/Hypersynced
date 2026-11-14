const PLAYER_STATE_PREFIX =
  "hypersync_player_state_v2:";

function storageKey(userId) {
  const id = String(userId ?? "").trim();
  return id ? PLAYER_STATE_PREFIX + encodeURIComponent(id) : "";
}


function getStorage() {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}


export function readPersistedPlayerState(userId) {
  const key = storageKey(userId);
  const storage =
    getStorage();

  if (!storage || !key) {
    return null;
  }

  try {
    const raw =
      storage.getItem(
        key,
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      !parsed.trackId
    ) {
      return null;
    }

    return parsed;

  } catch {
    return null;
  }
}


export function writePersistedPlayerState(
  userId,
  state,
) {
  const key = storageKey(userId);
  const storage =
    getStorage();

  if (
    !storage ||
    !key ||
    !state?.trackId
  ) {
    return;
  }

  try {
    storage.setItem(
      key,
      JSON.stringify({
        ...state,

        version:
          1,

        savedAt:
          Date.now(),
      }),
    );

  } catch {
    /*
     * Persistence should never be able
     * to interrupt normal playback.
     */
  }
}


export function clearPersistedPlayerState(userId) {
  const key = storageKey(userId);
  const storage =
    getStorage();

  if (!storage || !key) {
    return;
  }

  try {
    storage.removeItem(
      key,
    );
  } catch {
    // Ignore storage failures.
  }
}
