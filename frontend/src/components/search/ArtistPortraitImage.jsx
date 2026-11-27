import { useEffect, useState } from "react";
import Icon from "../ui/Icon.jsx";
import { getArtistPortrait, refreshArtistPortrait } from "../../artistPortraitCache.js";
import { getArtistArtworkStatus, getArtistProfile } from "../../artistApi.js";

const artistPortraitUrlCache = new Map();
const artistPortraitLookupInflight = new Map();
function portraitUrlFromProfile(profile) {
  return profile?.artist_artwork_url ?? profile?.artist_image_url ?? profile?.artist_profile_image_url ?? profile?.artist_photo_url ?? profile?.artwork_url ?? profile?.image_url ?? profile?.portrait_url ?? "";
}
async function resolveMissingPortrait(name) {
  const key = String(name ?? "").trim().toLocaleLowerCase();
  if (!key) return "";
  if (artistPortraitUrlCache.has(key) && artistPortraitUrlCache.get(key)) return artistPortraitUrlCache.get(key);
  if (artistPortraitLookupInflight.has(key)) return artistPortraitLookupInflight.get(key);
  const task = (async () => {
    try {
      const profile = await getArtistProfile(name);
      const url = portraitUrlFromProfile(profile);
      if (url) artistPortraitUrlCache.set(key, url);
      return url;
    } catch { return ""; }
  })().finally(() => artistPortraitLookupInflight.delete(key));
  artistPortraitLookupInflight.set(key, task);
  return task;
}

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
    if (!src) {
      void resolveMissingPortrait(artistName).then((url) => {
        if (!active || !url) return;
        setLiveSrc(url);
        void refreshArtistPortrait(artistName, url).then(setBlob).catch(() => {});
      });
    }
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
          setFailed(false);
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
      onError={() => setFailed(true)}
      {...props}
    />
  );
}
