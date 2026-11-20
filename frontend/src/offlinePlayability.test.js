import {
  filterOfflinePlayableTracks,
  isOfflineUnavailableTrack,
} from "./offlinePlayability.js";

const tracks = [
  { id: "a", title: "Downloaded" },
  { id: "b", title: "Not downloaded" },
  { id: "c", title: "Downloaded too" },
];
const downloaded = new Set(["a", "c"]);

describe("offline playability", () => {
  it("keeps the full collection playable online", () => {
    expect(filterOfflinePlayableTracks(tracks, true, downloaded)).toEqual(tracks);
  });

  it("only queues downloaded tracks offline", () => {
    expect(filterOfflinePlayableTracks(tracks, false, downloaded)).toEqual([
      tracks[0],
      tracks[2],
    ]);
  });

  it("does not treat downloaded status as unavailable online", () => {
    expect(isOfflineUnavailableTrack(tracks[1], false, downloaded)).toBe(false);
  });

  it("marks only un-downloaded tracks unavailable offline", () => {
    expect(isOfflineUnavailableTrack(tracks[0], true, downloaded)).toBe(false);
    expect(isOfflineUnavailableTrack(tracks[1], true, downloaded)).toBe(true);
  });

  it("returns no tracks offline when nothing is downloaded", () => {
    expect(filterOfflinePlayableTracks(tracks, false, new Set())).toEqual([]);
  });
});
