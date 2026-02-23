"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type NowPlayingResponse = {
  configured?: boolean;
  isPlaying?: boolean;
  track?: {
    name?: string | null;
    artists?: string[];
    album?: string | null;
    imageUrl?: string | null;
    songUrl?: string | null;
  };
};

export default function SpotifyNowPlaying(props: { className?: string }) {
  const [data, setData] = useState<NowPlayingResponse | null>(null);

  const configured = data?.configured === true;
  const isPlaying = configured && data?.isPlaying === true;
  const trackName = data?.track?.name ?? null;
  const artists = data?.track?.artists ?? [];
  const songUrl = data?.track?.songUrl ?? null;
  const imageUrl = data?.track?.imageUrl ?? null;

  const subtitle = useMemo(() => {
    if (!data) return "Loading";
    if (!configured) return "Not connected";
    if (!isPlaying || !trackName) return "Not playing";
    return artists.length > 0 ? artists.join(", ") : "Playing";
  }, [artists, configured, data, isPlaying, trackName]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    async function poll() {
      try {
        const response = await fetch("/api/spotify/now-playing", { cache: "no-store" });
        const next = (await response.json()) as NowPlayingResponse;
        if (cancelled) return;
        setData(next);

        if (next?.configured !== true) return;
        timeoutId = window.setTimeout(poll, next?.isPlaying ? 15_000 : 60_000);
      } catch {
        if (cancelled) return;
        timeoutId = window.setTimeout(poll, 60_000);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className={props.className}>
      <div className="flex items-center gap-3 border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2">
        <div className="relative h-11 w-11 shrink-0">
          <div
            className={[
              "absolute inset-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--panel)]",
              isPlaying ? "animate-spin" : "",
            ].join(" ")}
            style={isPlaying ? { animationDuration: "7s" } : undefined}
            aria-hidden="true"
          >
            {imageUrl ? (
              <Image src={imageUrl} alt="" fill sizes="48px" className="object-cover" />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_30%_30%,rgba(110,231,255,0.22),transparent_55%),radial-gradient(circle_at_70%_70%,rgba(255,255,255,0.06),transparent_60%)]" />
            )}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.12),transparent_55%)]" />
          </div>
          <div
            className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--panel-2)] ring-1 ring-white/15"
            aria-hidden="true"
          />
          <div
            className={[
              "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[var(--panel)]",
              isPlaying ? "bg-[var(--accent)]" : "bg-[var(--muted)]/40",
            ].join(" ")}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {isPlaying ? "Listening" : "Spotify"}
          </p>
          {songUrl && trackName ? (
            <a
              href={songUrl}
              target="_blank"
              rel="noreferrer"
              className="block max-w-[18rem] truncate text-xs text-[var(--text)] hover:text-[var(--accent)]"
              title={`${trackName}${artists.length ? ` — ${artists.join(", ")}` : ""}`}
            >
              {trackName}
            </a>
          ) : (
            <p className="max-w-[18rem] truncate text-xs text-[var(--muted)]">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

