import {
  useEffect,
  useState,
} from "react";

import {
  API_BASE,
} from "../../api/client.js";

import {
  getProfileAvatarBlob,
  putProfileAvatarBlob,
} from "../../profileAvatarCache.js";


export function resolveProfileAssetUrl(
  src,
) {
  if (!src) {
    return null;
  }

  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("blob:")
  ) {
    return src;
  }

  if (
    API_BASE.startsWith("http")
  ) {
    const apiOrigin =
      new URL(API_BASE).origin;

    return `${apiOrigin}${src}`;
  }

  return src;
}


const avatarObjectUrls = new Map();

function cachedObjectUrl(key, blob) {
  if (avatarObjectUrls.has(key)) return avatarObjectUrls.get(key);
  const url = URL.createObjectURL(blob);
  avatarObjectUrls.set(key, url);
  if (avatarObjectUrls.size > 48) {
    const oldest = avatarObjectUrls.keys().next().value;
    const oldUrl = avatarObjectUrls.get(oldest);
    avatarObjectUrls.delete(oldest);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
  }
  return url;
}

function initialsFor(name) {
  const clean =
    String(name || "User").trim();

  if (!clean) {
    return "U";
  }

  return clean
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


export default function Avatar({
  src,
  name,
  cacheKey = "",
  size = "large",
  className = "",
  cacheProfileImage = size === "hero",
  loading = size === "hero" ? "eager" : "lazy",
  fetchPriority = size === "hero" ? "high" : "low",
}) {
  const resolved = resolveProfileAssetUrl(src);
  const finalSrc = resolved && cacheKey
    ? `${resolved}${resolved.includes("?") ? "&" : "?"}v=${encodeURIComponent(cacheKey)}`
    : resolved;
  const cacheIdentity = finalSrc || "";
  const [cachedImage, setCachedImage] = useState(() => ({
    key: cacheIdentity,
    src: cacheIdentity ? avatarObjectUrls.get(cacheIdentity) ?? null : null,
  }));

  useEffect(() => {
    if (!finalSrc || !cacheProfileImage) {
      setCachedImage({ key: "", src: null });
      return undefined;
    }
    let active = true;
    setCachedImage((current) => current.key === finalSrc
      ? current
      : { key: finalSrc, src: avatarObjectUrls.get(finalSrc) ?? null });

    const loadCachedThenRefresh = async () => {
      try {
        const blob = await getProfileAvatarBlob(finalSrc);
        if (active && blob) setCachedImage({ key: finalSrc, src: cachedObjectUrl(finalSrc, blob) });
      } catch { /* Native image loading/cache remains fallback. */ }
      try {
        const response = await fetch(finalSrc, { mode: "cors", credentials: "same-origin", cache: "force-cache" });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/") || blob.size > 2 * 1024 * 1024) return;
        await putProfileAvatarBlob(finalSrc, blob);
        if (active) setCachedImage({ key: finalSrc, src: cachedObjectUrl(finalSrc, blob) });
      } catch { /* Keep the native img cache path. */ }
    };
    void loadCachedThenRefresh();
    return () => { active = false; };
  }, [finalSrc, cacheProfileImage]);

  const imageSrc = cachedImage.key === cacheIdentity && cachedImage.src ? cachedImage.src : finalSrc;
  return (
    <div
      className={`hs-avatar hs-avatar--${size} ${className}`}
      aria-label={`${name || "User"} profile picture`}
    >
      <span className="hs-avatar__initials">{initialsFor(name)}</span>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={`${name || "User"} profile`}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      ) : null}
    </div>
  );
}
