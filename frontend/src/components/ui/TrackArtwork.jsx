import { useEffect, useState } from "react";
import {
  resolveArtworkUrl,
} from "../../artworkUrl.js";

import {
  resetArtworkRetry,
  retryTransientArtwork,
} from "../../artworkRetry.js";

function CoverPlaceholder({
  variant = 1,
  label = "Awaiting catalog",
}) {
  return (
    <div
      className={
        `cover-placeholder ` +
        `cover-placeholder--${variant}`
      }
      role="img"
      aria-label={label}
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <defs>
          <radialGradient
            id={`cover-glow-${variant}`}
          >
            <stop
              offset="0"
              stopColor="#45e7ff"
              stopOpacity=".85"
            />
            <stop
              offset=".35"
              stopColor="#087bf1"
              stopOpacity=".34"
            />

            <stop
              offset="1"
              stopColor="#02050a"
              stopOpacity="0"
            />
          </radialGradient>
        </defs>

        <circle
          cx="50"
          cy="50"
          r="42"
          fill={`url(#cover-glow-${variant})`}
        />

        <path
          d={
            "M8 64c18-22 34-28 47-17 " +
            "11 10 20 8 37-12"
          }
          fill="none"
          stroke="rgba(123,229,255,.75)"
          strokeWidth="2"
        />

        <circle
          cx="50"
          cy="50"
          r="16"
          fill="none"
          stroke="rgba(255,255,255,.35)"
        />

        <circle
          cx="50"
          cy="50"
          r="4"
          fill="#07121b"
          stroke="#20d6ff"
        />
      </svg>
    </div>
  );
}

function TrackArtwork({
  src,
  alt,
  variant = 1,
  priority = false,
}) {
  const artworkUrl = resolveArtworkUrl(src);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cachedSrc, setCachedSrc] = useState("");
  useEffect(() => {
    if (!artworkUrl) {
      setCachedSrc("");
      return undefined;
    }
    let active = true;
    let objectUrl = "";
    const show = (blob) => {
      if (!active || !blob) return;
      const next = URL.createObjectURL(blob);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = next;
      setCachedSrc(next);
    };
    void import("../../searchArtworkCache.js").then(({ getSearchArtwork, refreshSearchArtwork }) => {
      if (!active) return;
      return getSearchArtwork(artworkUrl).then((cached) => {
        if (!active) return;
        if (cached?.blob) show(cached.blob);
        if (!cached || cached.stale) void refreshSearchArtwork(artworkUrl).then(show);
      });
    }).catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artworkUrl]);

  useEffect(() => {
    if (!artworkUrl || typeof navigator === "undefined" || !navigator.serviceWorker) return undefined;
    const onMessage = (event) => {
      if (event.data?.type !== "HYPERSYNC_ARTWORK_REFRESHED" || !event.data.url) return;
      try {
        if (new URL(event.data.url, window.location.href).href === new URL(artworkUrl, window.location.href).href) {
          setRefreshKey((current) => current + 1);
        }
      } catch {}
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [artworkUrl]);

  if (!artworkUrl) {
    return (
      <CoverPlaceholder
        variant={variant}
        label={alt || "No track artwork"}
      />
    );
  }

  return (
    <div className="track-artwork-shell">
      <img
        key={refreshKey}
        className="track-artwork"
        src={cachedSrc || artworkUrl}
        alt={alt || "Track artwork"}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={(event) => {
          resetArtworkRetry(event.currentTarget);
          if (!cachedSrc) void refreshSearchArtwork(artworkUrl);
        }}
        onError={(event) => {
          if (!cachedSrc) void refreshSearchArtwork(artworkUrl);
          if (
            retryTransientArtwork(
              event,
              artworkUrl,
            )
          ) {
            return;
          }

          event.currentTarget.style.display = "none";

          const fallback =
            event.currentTarget.nextElementSibling;

          if (fallback) {
            fallback.style.display = "grid";
          }
        }}
      />

      <CoverPlaceholder
        variant={variant}
        label={alt || "No track artwork"}
      />
    </div>
  );
}

export {
  CoverPlaceholder,
  TrackArtwork,
};

export default TrackArtwork
