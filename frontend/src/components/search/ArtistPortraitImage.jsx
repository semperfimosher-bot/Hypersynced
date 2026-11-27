import { useEffect, useState } from "react";
import Icon from "../ui/Icon.jsx";
import { getArtistPortrait, refreshArtistPortrait } from "../../artistPortraitCache.js";
import { getArtistArtworkStatus } from "../../artistApi.js";

export default function ArtistPortraitImage({
  artistName,
  src,
  alt = "",
  className,
  fallback,
  ...props
}) {
  const [cached, setCached] = useState("");
  const [liveSrc, setLiveSrc] = useState(src || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    let timer;
    setCached("");
    setLiveSrc(src || "");
    setFailed(false);

    const setBlob = (blob) => {
      if (!active || !blob) return;
      const nextUrl = URL.createObjectURL(blob);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = nextUrl;
      setCached(nextUrl);
      setFailed(false);
    };

    void getArtistPortrait(artistName).then(setBlob).catch(() => {});
    // Cache/upload is a background task. Never make image rendering wait for
    // the blob fetch (which can be CORS-blocked); display the provider URL as
    // soon as the artwork endpoint exposes it, then switch to the cached blob.
    void refreshArtistPortrait(artistName, src).then(setBlob).catch(() => {});

    let attempts = 0;
    const poll = async () => {
      if (!active || attempts >= 20) return;
      attempts += 1;
      try {
        const status = await getArtistArtworkStatus(artistName);
        if (!active) return;
        if (status?.artwork_url) {
          setLiveSrc(status.artwork_url);
          void refreshArtistPortrait(artistName, status.artwork_url).then(setBlob).catch(() => {});
        }
        if (["ready", "missing", "failed"].includes(status?.status)) return;
      } catch {
        // transient endpoint errors do not hide the existing image/fallback.
      }
      if (active) {
        timer = window.setTimeout(poll, attempts < 5 ? 800 : 1800);
      }
    };
    timer = window.setTimeout(poll, 350);

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artistName, src]);

  const imageSrc = cached || liveSrc || src || "";
  if (!imageSrc || failed) {
    return fallback ?? <Icon name="music" size={22} />;
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(false)}
      {...props}
    />
  );
}
