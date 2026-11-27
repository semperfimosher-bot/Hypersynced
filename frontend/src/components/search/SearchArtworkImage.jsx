import { useEffect, useState } from "react";
import Icon from "../ui/Icon.jsx";
import { getSearchArtwork, refreshSearchArtwork } from "../../searchArtworkCache.js";

export default function SearchArtworkImage({
  src,
  alt = "",
  className,
  loading = "lazy",
  decoding = "async",
  fetchPriority = "auto",
  fallback = <Icon name="disc" size={20} />,\n  onError,
  ...props
}) {
  const [cachedSrc, setCachedSrc] = useState("");
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setCachedSrc("");
    setFailed(false);
    setRetrying(false);
    if (!src) return undefined;
    let active = true;
    let objectUrl = "";
    const show = (blob) => {
      if (!active || !blob) return;
      const next = URL.createObjectURL(blob);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = next;
      setCachedSrc(next);
      setFailed(false);
    };
    void getSearchArtwork(src).then((cached) => {
      if (!active) return;
      if (cached?.blob) show(cached.blob);
      if (!cached || cached.stale) void refreshSearchArtwork(src).then(show);
    }).catch(() => {
      // Direct image rendering remains the fallback if browser cache APIs fail.
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const handleImageError = async (event) => {
    onError?.(event);
    if (retrying || !src) {
      setFailed(true);
      return;
    }
    setRetrying(true);
    try {
      const blob = await refreshSearchArtwork(src);
      if (blob) {
        const next = URL.createObjectURL(blob);
        setCachedSrc(next);
        setFailed(false);
        return;
      }
    } catch {
      // A cross-origin cache fetch may be blocked; show the card's fallback.
    }
    setFailed(true);
  };

  if (!src || failed) {
    return <span className={className} aria-hidden="true">{fallback}</span>;
  }

  return (
    <img
      src={cachedSrc || src}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onError={handleImageError}
      {...props}
    />
  );
}
