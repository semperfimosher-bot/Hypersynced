const PREFIX = "hypersynced.messages-list-snapshot.v1:";
const TTL_MS = 2 * 60 * 60 * 1000;

function sessionStore() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function keyFor(owner) {
  const id = String(owner ?? "").trim();
  return id ? PREFIX + encodeURIComponent(id) : "";
}

function sanitizeSnapshot(result) {
  const conversations = Array.isArray(result?.conversations)
    ? result.conversations.slice(0, 100).map((item) => ({
      username: String(item?.username ?? ""),
      display_name: String(item?.display_name ?? ""),
      avatar_url: item?.avatar_url ?? null,
      latest_body: String(item?.latest_body ?? "").slice(0, 2000),
      latest_at: item?.latest_at ?? null,
      unread_count: Math.max(0, Number(item?.unread_count) || 0),
    })).filter((item) => item.username)
    : [];
  return {
    conversations,
    unread_count: Math.max(0, Number(result?.unread_count) || 0),
  };
}

export function readMessagesListSnapshot(owner, now = Date.now()) {
  const key = keyFor(owner);
  if (!key) return null;
  try {
    const raw = sessionStore()?.getItem(key);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    const savedAt = Number(snapshot?.savedAt);
    if (!Number.isFinite(savedAt) || now - savedAt > TTL_MS || savedAt > now + 60_000) {
      sessionStore()?.removeItem(key);
      return null;
    }
    return sanitizeSnapshot(snapshot.data);
  } catch {
    return null;
  }
}

export function writeMessagesListSnapshot(owner, data, now = Date.now()) {
  const key = keyFor(owner);
  if (!key || !data || typeof data !== "object") return false;
  try {
    const store = sessionStore();
    if (!store) return false;
    store.setItem(key, JSON.stringify({ savedAt: now, data: sanitizeSnapshot(data) }));
    return true;
  } catch {
    return false;
  }
}

export function clearMessagesListSnapshot(owner) {
  const key = keyFor(owner);
  if (!key) return;
  try { sessionStore()?.removeItem(key); } catch {}
}
