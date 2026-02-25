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

type TrackSnapshot = {
  name: string;
  artists: string[];
  album?: string | null;
  imageUrl?: string | null;
  songUrl?: string | null;
};

const LAST_TRACK_STORAGE_KEY = "xiao.sh:spotify:last-track:v1";
const SPOTIFY_POLL_TIMEOUT_MS = 10_000;
const FALLBACK_OFFLINE_DATA: NowPlayingResponse = { configured: false, isPlaying: false };

function normalizeTrack(track: NowPlayingResponse["track"]): TrackSnapshot | null {
  if (!track?.name || typeof track.name !== "string") return null;

  return {
    name: track.name,
    artists: Array.isArray(track.artists) ? track.artists.filter(Boolean) : [],
    album: track.album ?? null,
    imageUrl: track.imageUrl ?? null,
    songUrl: track.songUrl ?? null,
  };
}

export default function SpotifyNowPlaying(props: { className?: string }) {
  const [data, setData] = useState<NowPlayingResponse | null>(null);
  const [lastTrack, setLastTrack] = useState<TrackSnapshot | null>(null);
  const [scrollRotation, setScrollRotation] = useState(0);

  const configured = data?.configured === true;
  const isPlaying = configured && data?.isPlaying === true;
  const currentTrack = normalizeTrack(data?.track);
  const displayTrack = currentTrack ?? (!isPlaying ? lastTrack : null);
  const trackName = displayTrack?.name ?? null;
  const artists = displayTrack?.artists ?? [];
  const songUrl = displayTrack?.songUrl ?? null;
  const imageUrl = currentTrack?.imageUrl ?? lastTrack?.imageUrl ?? null;

  const subtitle = useMemo(() => {
    if (!data) return "Loading";
    if (!configured) {
      if (lastTrack?.name) return "Offline - showing last played";
      return "Not connected";
    }
    if (!isPlaying && trackName) return artists.length > 0 ? artists.join(", ") : "Last played";
    if (!isPlaying || !trackName) return "Offline";
    return artists.length > 0 ? artists.join(", ") : "Playing";
  }, [artists, configured, data, isPlaying, lastTrack?.name, trackName]);

  const listeningStatus = useMemo(() => {
    if (!data) return "Loading";
    if (!configured) return "Offline";
    if (isPlaying) return "Listening";
    return "Offline";
  }, [configured, data, isPlaying]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAST_TRACK_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<TrackSnapshot>;
      if (typeof parsed.name !== "string" || parsed.name.trim().length === 0) return;
      setLastTrack({
        name: parsed.name,
        artists: Array.isArray(parsed.artists)
          ? parsed.artists.filter((entry): entry is string => typeof entry === "string")
          : [],
        album: typeof parsed.album === "string" ? parsed.album : null,
        imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : null,
        songUrl: typeof parsed.songUrl === "string" ? parsed.songUrl : null,
      });
    } catch {
      // Ignore corrupt local cache.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;
    let requestInFlight = false;

    async function poll() {
      if (requestInFlight) return;
      requestInFlight = true;
      let nextDelayMs = document.visibilityState === "visible" ? 8_000 : 30_000;
      const controller = new AbortController();
      const abortTimeoutId = window.setTimeout(() => controller.abort(), SPOTIFY_POLL_TIMEOUT_MS);

      try {
        const response = await fetch(`/api/spotify/now-playing?ts=${Date.now()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Spotify status ${response.status}`);
        }
        const next = (await response.json()) as NowPlayingResponse;
        if (cancelled) return;
        setData(next);
        const nextTrack = normalizeTrack(next.track);
        if (nextTrack) {
          setLastTrack(nextTrack);
          try {
            window.localStorage.setItem(LAST_TRACK_STORAGE_KEY, JSON.stringify(nextTrack));
          } catch {
            // Ignore storage write failures.
          }
        }

        if (document.visibilityState !== "visible") {
          nextDelayMs = 30_000;
        } else if (next?.configured !== true) {
          nextDelayMs = 45_000;
        } else {
          nextDelayMs = next?.isPlaying ? 6_000 : 20_000;
        }
      } catch {
        if (cancelled) return;
        setData((current) => current ?? FALLBACK_OFFLINE_DATA);
        nextDelayMs = document.visibilityState === "visible" ? 20_000 : 45_000;
      } finally {
        window.clearTimeout(abortTimeoutId);
        requestInFlight = false;
        if (!cancelled) {
          timeoutId = window.setTimeout(poll, nextDelayMs);
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        void poll();
      }
    }

    poll();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    function updateRotation() {
      setScrollRotation(window.scrollY * 0.18);
    }

    updateRotation();
    window.addEventListener("scroll", updateRotation, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateRotation);
    };
  }, []);

  return (
    <div className={props.className}>
      <div className="relative aspect-square w-full border border-[var(--line)] bg-[var(--panel-2)] p-4">
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              {listeningStatus}
            </p>
            <span
              className={[
                "inline-flex h-2 w-2 rounded-full border border-[var(--panel)]",
                isPlaying ? "bg-[var(--accent)]" : "bg-[var(--muted)]/40",
              ].join(" ")}
              aria-hidden="true"
            />
          </div>

          <div className="flex flex-1 items-center justify-center py-2">
            <div className="relative h-28 w-28">
              <div
                className={[
                  "absolute inset-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--panel)]",
                  isPlaying ? "animate-spin" : "",
                ].join(" ")}
                style={
                  isPlaying
                    ? { animationDuration: "7s" }
                    : {
                        transform: `rotate(${scrollRotation}deg)`,
                      }
                }
                aria-hidden="true"
              >
                {imageUrl ? (
                  <Image src={imageUrl} alt="" fill sizes="112px" className="object-cover" />
                ) : (
                  <div className="h-full w-full bg-[var(--panel)]" />
                )}
              </div>
              <div
                className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--panel-2)] ring-1 ring-white/15"
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="min-w-0 border-t border-[var(--line)] pt-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              {isPlaying ? "Now Playing" : trackName ? "Last Played" : "Status"}
            </p>
            {trackName ? (
              songUrl ? (
                <a
                  href={songUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-sm text-[var(--text)] hover:text-[var(--accent)]"
                  title={`${trackName}${artists.length ? ` — ${artists.join(", ")}` : ""}`}
                >
                  {trackName}
                </a>
              ) : (
                <p className="mt-1 truncate text-sm text-[var(--text)]">{trackName}</p>
              )
            ) : (
              <p className="mt-1 truncate text-sm text-[var(--muted)]">{subtitle}</p>
            )}
            {artists.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]" title={artists.join(", ")}>
                {artists.join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
