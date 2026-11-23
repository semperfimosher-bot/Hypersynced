export const VISITOR_HEARTBEAT_MIN_INTERVAL_MS = 300_000;

export function shouldSendVisitorHeartbeat(
  lastAttemptAt,
  now = Date.now(),
  minInterval = VISITOR_HEARTBEAT_MIN_INTERVAL_MS,
) {
  return !lastAttemptAt || now - lastAttemptAt >= minInterval;
}
