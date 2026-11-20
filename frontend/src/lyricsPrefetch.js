import { apiRequest } from "./api/client.js";

const requests = new Map();

export function fetchTrackLyrics(trackId) {
  const id = String(trackId ?? "").trim();
  if (!id) return Promise.resolve(null);
  if (requests.has(id)) return requests.get(id);
  const request = apiRequest(
    `/catalog/tracks/${encodeURIComponent(id)}/lyrics`,
    { method: "GET" },
  ).catch((error) => {
    requests.delete(id);
    throw error;
  });
  requests.set(id, request);
  return request;
}
