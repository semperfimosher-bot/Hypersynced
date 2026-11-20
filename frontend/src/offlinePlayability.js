export function filterOfflinePlayableTracks(
  tracks,
  online,
  downloadedTrackIds,
) {
  if (online) {
    return Array.isArray(tracks) ? tracks : [];
  }

  const downloadedIds =
    downloadedTrackIds instanceof Set
      ? downloadedTrackIds
      : new Set(
          Array.isArray(downloadedTrackIds)
            ? downloadedTrackIds.map(String)
            : [],
        );

  return (Array.isArray(tracks) ? tracks : []).filter(
    (track) => downloadedIds.has(String(track?.id ?? "")),
  );
}

export function isOfflineUnavailableTrack(
  track,
  offline,
  downloadedTrackIds,
) {
  if (!offline || !track?.id) {
    return false;
  }

  const downloadedIds =
    downloadedTrackIds instanceof Set
      ? downloadedTrackIds
      : new Set(
          Array.isArray(downloadedTrackIds)
            ? downloadedTrackIds.map(String)
            : [],
        );

  return !downloadedIds.has(String(track.id));
}
