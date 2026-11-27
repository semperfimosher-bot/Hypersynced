import { useEffect, useState } from "react";
import {
  getArtistPortrait,
  refreshArtistPortrait,
} from "../../artistPortraitCache.js";

export default function ArtistPortraitImage({
  artistName,
  src,
  alt = "",
  className,
  ...props
}) {
  const [cached, setCached] = useState(null);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setCached(null);

    void getArtistPortrait(artistName).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setCached(objectUrl);
    });

    void refreshArtistPortrait(artistName, src).then((blob) => {
      if (!active || !blob) return;
      const nextUrl = URL.createObjectURL(blob);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = nextUrl;
      setCached(nextUrl);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artistName, src]);

  return (
    <img
      src={cached || src || undefined}
      alt={alt}
      className={className}
      {...props}
    />
  );
}
