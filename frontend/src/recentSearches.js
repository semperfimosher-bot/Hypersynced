const RECENT_SEARCHES_LIMIT = 8;
const RECENT_SEARCHES_KEY = "hypersynced.recent-searches.v1";

function getStorageKey(ownerKey = "guest") {
  return `${RECENT_SEARCHES_KEY}:${encodeURIComponent(String(ownerKey || "guest"))}`;
}

export function readRecentSearches(ownerKey = "guest") {
  try {
    const stored = globalThis.localStorage?.getItem(getStorageKey(ownerKey));
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === "string" && value.trim()).slice(0, RECENT_SEARCHES_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(query, ownerKey = "guest") {
  const normalized = String(query ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return readRecentSearches(ownerKey);
  const previous = readRecentSearches(ownerKey);
  const next = [
    normalized,
    ...previous.filter((value) => value.toLocaleLowerCase() !== normalized.toLocaleLowerCase()),
  ].slice(0, RECENT_SEARCHES_LIMIT);
  try {
    globalThis.localStorage?.setItem(getStorageKey(ownerKey), JSON.stringify(next));
  } catch {
    // Recent searches are an optional local convenience.
  }
  return next;
}

export function removeRecentSearch(query, ownerKey = "guest") {
  const normalized = String(query ?? "").trim();
  const next = readRecentSearches(ownerKey).filter(
    (value) => value.toLocaleLowerCase() !== normalized.toLocaleLowerCase(),
  );
  try {
    globalThis.localStorage?.setItem(getStorageKey(ownerKey), JSON.stringify(next));
  } catch {
    // Recent searches are an optional local convenience.
  }
  return next;
}

export function clearRecentSearches(ownerKey = "guest") {
  try {
    globalThis.localStorage?.removeItem(getStorageKey(ownerKey));
  } catch {
    // Ignore storage failures.
  }
}
