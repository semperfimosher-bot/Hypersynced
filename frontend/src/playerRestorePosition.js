export function shouldCorrectRestoredPlaybackClock(targetSeconds, liveSeconds, durationSeconds = 0) {
  const target = Math.max(0, Number(targetSeconds) || 0);
  const live = Math.max(0, Number(liveSeconds) || 0);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  if (target <= 0) return live > 5.5;

  const nearTrackEnd = duration > 0 && target >= duration - 5.5;
  if (nearTrackEnd) {
    return live < target - 1.25 || live > target + 1.5 || live > duration + 0.5;
  }

  return live < target - 1.25 || live > target + 5.5;
}

export function shouldReleaseRestoredPosition(targetSeconds, liveSeconds, paused, durationSeconds = 0) {
  const target = Math.max(0, Number(targetSeconds) || 0);
  const live = Math.max(0, Number(liveSeconds) || 0);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  if (paused || live < target + 0.35) return false;

  const nearTrackEnd = duration > 0 && target >= duration - 5.5;
  return nearTrackEnd ? live <= duration + 0.5 : live <= target + 5.5;
}


export function isRestoredClockProgressing(previousSeconds, currentSeconds, targetSeconds, durationSeconds = 0) {
  const previous = Math.max(0, Number(previousSeconds) || 0);
  const current = Math.max(0, Number(currentSeconds) || 0);
  const target = Math.max(0, Number(targetSeconds) || 0);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  const delta = current - previous;
  if (delta < 0.05 || delta > 1.5) return false;

  const nearTrackEnd = duration > 0 && target >= duration - 5.5;
  return nearTrackEnd
    ? current <= duration + 0.5
    : current >= target - 0.5 && current <= target + 10.0;
}
