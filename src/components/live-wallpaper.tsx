"use client";

import { wallpaperPlaybackRate, wallpaperVideos } from "@/lib/wallpapers";
import { useEffect, useMemo, useState } from "react";

export default function LiveWallpaper() {
  const sources = useMemo(
    () =>
      wallpaperVideos
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && /\.mp4($|\?)/i.test(entry)),
    [],
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (sources.length === 0) {
      setDisabled(true);
      return;
    }

    setStartIndex(Math.floor(Math.random() * sources.length));
  }, [sources]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPrefersReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  if (disabled || prefersReducedMotion || sources.length === 0) return null;

  const source = sources[(startIndex + attempts) % sources.length];

  return (
    <div className="live-wallpaper" aria-hidden="true">
      <video
        key={source}
        className="live-wallpaper-video"
        src={source}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = wallpaperPlaybackRate;
        }}
        onError={() => {
          if (attempts >= sources.length - 1) {
            setDisabled(true);
            return;
          }
          setAttempts((prev) => prev + 1);
        }}
      />
    </div>
  );
}
