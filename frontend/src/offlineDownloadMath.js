export function getMissingDownloadBytes(
  fileSize,
  record = null,
) {
  const normalizedSize =
    Number(
      fileSize,
    );

  if (
    !Number.isSafeInteger(
      normalizedSize,
    ) ||
    normalizedSize <= 0
  ) {
    return 0;
  }

  const cachedBytes =
    Number.isFinite(
      record?.cachedBytes,
    )
      ? Math.max(
          0,
          Math.min(
            normalizedSize,
            record.cachedBytes,
          ),
        )
      : 0;

  return Math.max(
    0,
    normalizedSize -
      cachedBytes,
  );
}

export function getOfflineDownloadWorkerCount(
  pendingTrackCount,
  requestedConcurrency = 6,
) {
  const pending = Math.max(
    0,
    Math.trunc(Number(pendingTrackCount) || 0),
  );
  const requested = Math.max(
    1,
    Math.trunc(Number(requestedConcurrency) || 1),
  );

  return Math.min(
    pending,
    requested,
    6,
  );
}
