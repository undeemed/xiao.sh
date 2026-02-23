import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";

type SpotifyTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

type SpotifyNowPlayingResponse = {
  is_playing?: boolean;
  currently_playing_type?: string;
  progress_ms?: number;
  item?: {
    name?: string;
    duration_ms?: number;
    preview_url?: string | null;
    external_urls?: { spotify?: string };
    artists?: Array<{ name?: string }>;
    album?: {
      name?: string;
      images?: Array<{ url?: string; width?: number; height?: number }>;
    };
  };
};

function env(key: string) {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function getAccessToken() {
  const clientId = env("SPOTIFY_CLIENT_ID");
  const clientSecret = env("SPOTIFY_CLIENT_SECRET");
  const refreshToken = env("SPOTIFY_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) return null;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const data = (await response.json()) as SpotifyTokenResponse;
  return typeof data.access_token === "string" && data.access_token.length > 0 ? data.access_token : null;
}

function json(data: unknown) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
    },
  });
}

export async function GET() {
  try {
    const token = await getAccessToken();
    if (!token) {
      return json({ configured: false, isPlaying: false });
    }

    const response = await fetch(SPOTIFY_NOW_PLAYING_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (response.status === 204) {
      return json({ configured: true, isPlaying: false });
    }

    if (!response.ok) {
      return json({ configured: true, isPlaying: false });
    }

    const data = (await response.json()) as SpotifyNowPlayingResponse;
    const item = data.item;

    if (!item || data.currently_playing_type !== "track") {
      return json({ configured: true, isPlaying: false });
    }

    const artists = (item.artists ?? [])
      .map((artist) => (typeof artist.name === "string" ? artist.name : ""))
      .filter(Boolean);

    const imageUrl =
      item.album?.images?.find((image) => typeof image.url === "string" && image.url.length > 0)?.url ?? null;

    return json({
      configured: true,
      isPlaying: Boolean(data.is_playing),
      progressMs: typeof data.progress_ms === "number" ? data.progress_ms : null,
      durationMs: typeof item.duration_ms === "number" ? item.duration_ms : null,
      track: {
        name: typeof item.name === "string" ? item.name : null,
        artists,
        album: typeof item.album?.name === "string" ? item.album?.name : null,
        imageUrl,
        songUrl: item.external_urls?.spotify ?? null,
        previewUrl: typeof item.preview_url === "string" ? item.preview_url : null,
      },
    });
  } catch {
    return json({ configured: true, isPlaying: false });
  }
}

