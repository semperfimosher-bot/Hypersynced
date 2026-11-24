import assert from "node:assert/strict";
import test from "node:test";

test("playlist artwork warming extracts covers and respects a request cap", async (t) => {
  const originalImage = globalThis.Image;
  const images = [];
  globalThis.Image = class FakeImage {
    set src(value) {
      this.url = value;
      images.push(this);
    }
  };
  t.after(() => {
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  });

  const { warmPlaylistArtwork } = await import("./artworkWarmCache.js");
  const warmed = warmPlaylistArtwork([
    {
      tracks: [
        { artwork_url: "https://cdn.example/track-1.jpg" },
        { artwork_url: "https://cdn.example/track-2.jpg" },
        { artwork_url: "https://cdn.example/track-3.jpg" },
      ],
    },
    {
      artwork_urls: [
        "https://cdn.example/track-2.jpg",
        "https://cdn.example/track-4.jpg",
      ],
    },
    {
      artwork_url: "https://cdn.example/track-5.jpg",
    },
  ], 3);

  assert.equal(warmed, 3);
  assert.deepEqual(
    images.map((image) => image.url),
    [
      "https://cdn.example/track-1.jpg",
      "https://cdn.example/track-2.jpg",
      "https://cdn.example/track-3.jpg",
    ],
  );
});

test("playlist artwork warming is a no-op outside browsers", async () => {
  const originalImage = globalThis.Image;
  delete globalThis.Image;
  const { warmPlaylistArtwork } = await import("./artworkWarmCache.js");
  assert.equal(warmPlaylistArtwork([{ artwork_url: "https://cdn.example/cover.jpg" }]), 0);
  if (originalImage !== undefined) globalThis.Image = originalImage;
});

test("failed artwork warm can be retried after the failure", async (t) => {
  const originalImage = globalThis.Image;
  const images = [];
  globalThis.Image = class FakeImage {
    set src(value) {
      this.url = value;
      images.push(this);
    }
  };
  t.after(() => {
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  });

  const { warmTrackArtwork } = await import("./artworkWarmCache.js");
  const track = { artwork_url: "https://cdn.example/retry-after-error.jpg" };
  assert.equal(warmTrackArtwork([track]), 1);
  images[0].onerror();
  assert.equal(warmTrackArtwork([track]), 1);
  assert.equal(images.length, 2);
});
