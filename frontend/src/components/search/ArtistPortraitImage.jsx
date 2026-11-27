import { useEffect, useState } from "react";
import Icon from "../ui/Icon.jsx";
import {
  getArtistPortrait,
  refreshArtistPortrait,
} from "../../artistPortraitCache.js";

export default function ArtistPortraitImage({
  artistName,
  src,
  alt = "",
  className,
  fallback,
  ...props
}) {
  const [cached, setCached] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setCached(null);
    setFailed(false);

    void getArtistPortrait(artistName).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setCached(objectUrl);
    });

    // Calling with no source asks the API to queue/retrieve a proper artist
    // portrait and polls until the accepted portrait has been uploaded to B2.
    void refreshArtistPortrait(artistName, src).then((blob) => {
      if (!active || !blob) return;
      const nextUrl = URL.createObjectURL(blob);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = nextUrl;
      setCached(nextUrl);
      setFailed(false);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artistName, src]);

  const imageSrc = cached || src || "";
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
