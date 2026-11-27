import { useEffect, useState } from "react";
import { getSearchArtwork, refreshSearchArtwork } from "../../searchArtworkCache.js";

export default function SearchArtworkImage({
  src,
  alt = "",
  className,
  loading = "lazy",
  decoding = "async",
  fetchPriority = "auto",
  ...props
}) {
  const [cachedSrc, setCachedSrc] = useState("");
  useEffect(() => {
    if (!src) {
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
    void getSearchArtwork(src).then((cached) => {
      if (!active) return;
      if (cached?.blob) show(cached.blob);
      if (!cached || cached.stale) void refreshSearchArtwork(src).then(show);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  return (
    <img
      src={cachedSrc || src}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      {...props}
    />
  );
}
