export function shouldCorrectRestoredPlaybackClock(targetSeconds, liveSeconds, durationSeconds = 0) {
  const target = Math.max(0, Number(targetSeconds) || 0);
  const live = Math.max(0, Number(liveSeconds) || 0);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  if (target <= 0) return false;

  const nearTrackEnd = duration > 0 && target >= duration - 5.5;
  if (nearTrackEnd && live <= duration + 0.5) return false;

  return live < target - 1.25 || live > target + 5.5;
}

export function shouldReleaseRestoredPosition(targetSeconds, liveSeconds, paused, durationSeconds = 0) {
  const target = Math.max(0, Number(targetSeconds) || 0);
  const live = Math.max(0, Number(liveSeconds) || 0);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  if (paused || target <= 0 || live < target + 0.35) return false;

  const nearTrackEnd = duration > 0 && target >= duration - 5.5;
  return nearTrackEnd ? live <= duration + 0.5 : live <= target + 5.5;
}
