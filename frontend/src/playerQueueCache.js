const QUEUE_CACHE_PREFIX = "hypersynced-player-queue-v1:";
const QUEUE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const QUEUE_CACHE_LIMIT = 150;

function queueCacheKey(ownerId) {
  const owner = String(ownerId ?? "").trim();
  return owner ? `${QUEUE_CACHE_PREFIX}${encodeURIComponent(owner)}` : null;
}

function sanitizeQueue(queue) {
  if (!Array.isArray(queue)) return [];

  return queue
    .filter((entry) => entry?.id !== null && entry?.id !== undefined && String(entry.id).trim())
    .slice(0, QUEUE_CACHE_LIMIT)
    .map((entry) => {
      const meta = entry.meta ?? {};
      return {
        id: String(entry.id),
        meta: {
          artworkUrl: meta.artworkUrl ?? meta.artwork_url ?? null,
          mimeType: meta.mimeType ?? meta.mime_type ?? null,
          fileSize: meta.fileSize ?? meta.file_size ?? null,
          mediaVersion: meta.mediaVersion ?? meta.media_version ?? null,
          artworkVersion: meta.artworkVersion ?? meta.artwork_version ?? null,
          durationSeconds: meta.durationSeconds ?? meta.duration_seconds ?? null,
          catalogTrackId: meta.catalogTrackId ?? meta.catalog_track_id ?? null,
          title: meta.title ?? "",
          artist: meta.artist ?? "",
          album: meta.album ?? "",
          genre: meta.genre ?? "",
          releaseYear: meta.releaseYear ?? meta.release_year ?? null,
        },
      };
    });
}

export function readPlayerQueueSnapshot(ownerId, now = Date.now()) {
  const key = queueCacheKey(ownerId);
  if (!key || !globalThis.localStorage) return null;

  try {
    const raw = globalThis.localStorage.getItem(key);
    if (!raw) return null;

    const snapshot = JSON.parse(raw);
    const savedAt = Number(snapshot?.savedAt);
    if (!Number.isFinite(savedAt) || now - savedAt > QUEUE_CACHE_TTL_MS || savedAt > now + 60_000) {
      globalThis.localStorage.removeItem(key);
      return null;
    }

    const queue = sanitizeQueue(snapshot.queue);
    if (!queue.length) return null;

    const requestedIndex = Number(snapshot.queueIndex);
    const queueIndex = Number.isInteger(requestedIndex)
      ? Math.min(Math.max(requestedIndex, 0), queue.length - 1)
      : 0;

    return { queue, queueIndex };
  } catch {
    return null;
  }
}

export function writePlayerQueueSnapshot(ownerId, queue, queueIndex, now = Date.now()) {
  const key = queueCacheKey(ownerId);
  if (!key || !globalThis.localStorage) return false;

  try {
    const source = Array.isArray(queue) ? queue : [];
    if (!source.length) {
      globalThis.localStorage.removeItem(key);
      return true;
    }

    const requestedIndex = Number.isInteger(queueIndex)
      ? Math.min(Math.max(queueIndex, 0), source.length - 1)
      : 0;
    // Keep the active row and the next tracks when the in-memory queue grows
    // beyond the snapshot cap, rather than accidentally saving only old songs.
    const startIndex = Math.max(
      0,
      Math.min(
        source.length - QUEUE_CACHE_LIMIT,
        requestedIndex - Math.floor(QUEUE_CACHE_LIMIT / 4),
      ),
    );
    const safeQueue = sanitizeQueue(
      source.slice(startIndex, startIndex + QUEUE_CACHE_LIMIT),
    );
    if (!safeQueue.length) {
      globalThis.localStorage.removeItem(key);
      return true;
    }

    const safeIndex = Math.min(
      Math.max(requestedIndex - startIndex, 0),
      safeQueue.length - 1,
    );

    globalThis.localStorage.setItem(key, JSON.stringify({
      savedAt: now,
      queue: safeQueue,
      queueIndex: safeIndex,
    }));
    return true;
  } catch {
    // Queue persistence is an optimization; playback must never depend on it.
    return false;
  }
}
