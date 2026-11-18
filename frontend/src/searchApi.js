import {
  apiRequest,
} from "./api/client.js";

import {
  getAccessToken,
  readCachedUserProfile,
} from "./api/storage.js";


const SEARCH_CACHE_TTL_MS =
  6 * 60 * 60 * 1000;

const SEARCH_REVALIDATE_AFTER_MS =
  15 * 1000;

const SEARCH_CACHE_MAX_ENTRIES =
  100;

const SEARCH_STORAGE_PREFIX =
  "hypersynced.search-cache.v1:";

const SEARCH_STORAGE_INDEX_KEY =
  SEARCH_STORAGE_PREFIX + "index";

const SEARCH_STORAGE_MAX_ENTRIES =
  30;

const SEARCH_CACHE_MAX_BYTES =
  100_000;

const searchCache =
  new Map();

const inFlightSearches =
  new Map();


function getSearchCacheScopeKey() {
  const token = getAccessToken();
  const profile = readCachedUserProfile();

  if (profile?.id !== null && profile?.id !== undefined && String(profile.id).trim()) {
    return "user:" + String(profile.id);
  }

  if (typeof profile?.username === "string" && profile.username.trim()) {
    return "username:" + profile.username.trim().toLocaleLowerCase();
  }

  return token ? "token:" + token : "anonymous";
}

function getPersistentSearchCacheKey(params) {
  const profile = readCachedUserProfile();
  let owner = null;

  if (profile?.id !== null && profile?.id !== undefined && String(profile.id).trim()) {
    owner = "user:" + String(profile.id);
  } else if (typeof profile?.username === "string" && profile.username.trim()) {
    owner = "username:" + profile.username.trim().toLocaleLowerCase();
  } else if (!getAccessToken()) {
    owner = "anonymous";
  }

  // Never persist results under a raw access token or an ambiguous signed-in owner.
  return owner
    ? SEARCH_STORAGE_PREFIX + encodeURIComponent(owner + "|" + params.toString())
    : null;
}

function readPersistentSearch(cacheKey, now = Date.now()) {
  if (!cacheKey) return null;
  try {
    const raw = globalThis.localStorage?.getItem(cacheKey);
    if (!raw || raw.length > SEARCH_CACHE_MAX_BYTES) return null;
    const cached = JSON.parse(raw);
    if (!cached || !cached.value || !Number.isFinite(cached.savedAt)) return null;
    if (now - cached.savedAt > SEARCH_CACHE_TTL_MS) {
      globalThis.localStorage?.removeItem(cacheKey);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function stripTransientAudioUrls(value) {
  if (Array.isArray(value)) return value.map(stripTransientAudioUrls);
  if (!value || typeof value !== "object") return value;
  const transientKeys = new Set([
    "audio_url", "audiourl", "media_url", "mediaurl",
    "signed_url", "signedurl", "stream_url", "streamurl",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !transientKeys.has(key.toLowerCase()))
      .map(([key, nested]) => [key, stripTransientAudioUrls(nested)]),
  );
}

function writePersistentSearch(cacheKey, cached) {
  if (!cacheKey) return;
  try {
    const storage = globalThis.localStorage;
    const persistentSnapshot = {
      ...cached,
      value: stripTransientAudioUrls(cached.value),
    };
    const serialized = JSON.stringify(persistentSnapshot);
    if (!storage || serialized.length > SEARCH_CACHE_MAX_BYTES) return;

    storage.setItem(cacheKey, serialized);
    let keys = [];
    try {
      const parsed = JSON.parse(storage.getItem(SEARCH_STORAGE_INDEX_KEY) || "[]");
      if (Array.isArray(parsed)) keys = parsed.filter((key) => typeof key === "string");
    } catch {
      keys = [];
    }

    keys = keys.filter((key) => key !== cacheKey);
    keys.push(cacheKey);
    while (keys.length > SEARCH_STORAGE_MAX_ENTRIES) {
      const expiredKey = keys.shift();
      if (expiredKey) storage.removeItem(expiredKey);
    }
    storage.setItem(SEARCH_STORAGE_INDEX_KEY, JSON.stringify(keys));
  } catch {
    // Storage is an optimization only; network search must remain unaffected.
  }
}


function getCachedSearch(
  cacheKey,
  now = Date.now(),
) {
  const cached = searchCache.get(cacheKey);
  if (!cached) return null;

  if (now - cached.savedAt > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(cacheKey);
    return null;
  }

  /*
   * Map insertion order doubles as a small LRU list. Touching a hit moves it
   * to the end so frequently used queries survive a burst of unique searches.
   */
  searchCache.delete(
    cacheKey,
  );

  searchCache.set(
    cacheKey,
    cached,
  );

  return cached;
}


function cacheSearchResult(
  cacheKey,
  value,
  now = Date.now(),
  persistentKey = null,
) {
  searchCache.delete(
    cacheKey,
  );

  const cached = { savedAt: now, value };
  searchCache.set(cacheKey, cached);
  writePersistentSearch(persistentKey, cached);

  for (
    const [
      key,
      cached,
    ]
    of searchCache
  ) {
    if (
      now - cached.savedAt >
      SEARCH_CACHE_TTL_MS
    ) {
      searchCache.delete(
        key,
      );
    }
  }

  while (
    searchCache.size >
    SEARCH_CACHE_MAX_ENTRIES
  ) {
    const oldestKey =
      searchCache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    searchCache.delete(
      oldestKey,
    );
  }
}


function createSearchAbortError() {
  const error =
    new Error(
      "Search request was aborted.",
    );

  error.name =
    "AbortError";

  return error;
}


function waitForSharedSearch(
  entry,
  signal,
) {
  if (signal?.aborted) {
    return Promise.reject(
      createSearchAbortError(),
    );
  }

  entry.waiterCount += 1;

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      let settled = false;

      const release = () => {
        if (settled) {
          return false;
        }

        settled = true;

        signal?.removeEventListener(
          "abort",
          handleAbort,
        );

        entry.waiterCount =
          Math.max(
            entry.waiterCount - 1,
            0,
          );

        if (
          entry.waiterCount === 0 &&
          !entry.settled
        ) {
          if (
            inFlightSearches.get(
              entry.cacheKey,
            ) === entry
          ) {
            inFlightSearches.delete(
              entry.cacheKey,
            );
          }

          entry.controller.abort();
        }

        return true;
      };

      const handleAbort = () => {
        if (release()) {
          reject(
            createSearchAbortError(),
          );
        }
      };

      signal?.addEventListener(
        "abort",
        handleAbort,
        {
          once: true,
        },
      );

      if (signal?.aborted) {
        handleAbort();
        return;
      }

      entry.promise.then(
        (value) => {
          if (release()) {
            resolve(value);
          }
        },
        (error) => {
          if (release()) {
            reject(error);
          }
        },
      );
    },
  );
}


export const SEARCH_SORT_OPTIONS = [
  {
    value: "smart",
    label: "Smart Sort",
  },
  {
    value: "recent",
    label: "Recents",
  },
  {
    value: "albums",
    label: "Albums",
  },
  {
    value: "alphabetical",
    label: "Alphabetical Order",
  },
];


export function searchHypersync(
  query,
  sortMode,
  options = {},
) {
  if (
    options.signal?.aborted
  ) {
    return Promise.reject(
      createSearchAbortError(),
    );
  }

  const params =
    new URLSearchParams({
      q: query,
      sort: sortMode,
    });

  const scopeKey =
    getSearchCacheScopeKey();

  const cacheKey =
    scopeKey +
    "|" +
    params.toString();

  const persistentKey = getPersistentSearchCacheKey(params);
  const url =
    `/search?${params.toString()}`;

  if (
    !options.bypassCache
  ) {
    let cached = getCachedSearch(cacheKey);
    if (!cached) {
      cached = readPersistentSearch(persistentKey);
      if (cached) {
        searchCache.set(cacheKey, cached);
      }
    }

    if (cached) {
      // Recent results are already accurate enough to reuse. Older snapshots
      // render immediately and refresh in the background without blocking UI.
      if (Date.now() - cached.savedAt >= SEARCH_REVALIDATE_AFTER_MS) {
        void apiRequest(url, { signal: options.signal })
          .then((fresh) => {
            if (options.signal?.aborted) return;
            cacheSearchResult(cacheKey, fresh, Date.now(), persistentKey);
            options.onRefresh?.(fresh);
          })
          .catch(() => {});
      }
      return Promise.resolve(cached.value);
    }
  }

  /*
   * Quiet refresh deliberately skips both the completed-result cache read and
   * in-flight sharing: it requests a fresh result and may refresh the cache
   * when its owner is still active.
   */
  if (
    options.bypassCache
  ) {
    return apiRequest(
      url,
      {
        signal:
          options.signal,
      },
    ).then(
      (value) => {
        if (
          !options.signal?.aborted
        ) {
          cacheSearchResult(
            cacheKey,
            value,
            Date.now(),
            persistentKey,
          );
        }

        return value;
      },
    );
  }

  let entry =
    inFlightSearches.get(
      cacheKey,
    );

  if (!entry) {
    const controller =
      new AbortController();

    entry = {
      cacheKey,
      controller,
      waiterCount: 0,
      settled: false,
      promise: null,
    };

    entry.promise =
      apiRequest(
        url,
        {
          signal:
            controller.signal,
        },
      )
        .then(
          (value) => {
            if (
              !controller.signal.aborted
            ) {
              cacheSearchResult(
                cacheKey,
                value,
                Date.now(),
                persistentKey,
              );
            }

            return value;
          },
        )
        .finally(
          () => {
            entry.settled = true;

            if (
              inFlightSearches.get(
                cacheKey,
              ) === entry
            ) {
              inFlightSearches.delete(
                cacheKey,
              );
            }
          },
        );

    inFlightSearches.set(
      cacheKey,
      entry,
    );
  }

  return waitForSharedSearch(
    entry,
    options.signal,
  );
}


export function getSearchPreferences() {
  return apiRequest(
    "/search/preferences",
  );
}


export function saveSearchPreferences(
  sortMode,
) {
  return apiRequest(
    "/search/preferences",
    {
      method: "PATCH",

      body: JSON.stringify({
        sort_mode: sortMode,
      }),
    },
  );
}
