/**
 * POST /api/heygen/token
 *
 * Creates a short-lived LiveAvatar LITE Mode session token server-side
 * so the API key is never exposed to the browser.
 *
 * LiveAvatar LITE Mode = Bring your own STT/LLM/TTS (which we already have
 * via the Google Voice Relay). LiveAvatar only handles the real-time avatar
 * video rendering.
 *
 * Returns: { sessionToken: string, sessionId: string }
 */

import { NextResponse } from "next/server";

const LIVEAVATAR_API_KEY = process.env.HEYGEN ?? "";
const LIVEAVATAR_AVATAR_ID = process.env.HEYGEN_AVATAR_ID ?? "";
const LIVEAVATAR_API_URL = "https://api.liveavatar.com";

export async function POST() {
  if (!LIVEAVATAR_API_KEY) {
    return NextResponse.json(
      { error: "LiveAvatar API key not configured (HEYGEN env var missing)" },
      { status: 500 }
    );
  }

  if (!LIVEAVATAR_AVATAR_ID) {
    return NextResponse.json(
      { error: "No avatar configured. Set HEYGEN_AVATAR_ID in .env.local" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${LIVEAVATAR_API_URL}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": LIVEAVATAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "LITE",
        avatar_id: LIVEAVATAR_AVATAR_ID,
        is_sandbox: process.env.NODE_ENV !== "production",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[heygen/token] LiveAvatar API error:", res.status, body);
      return NextResponse.json(
        { error: `LiveAvatar API error: ${res.status} — ${body}` },
        { status: res.status }
      );
    }

    const data = await res.json() as {
      code: number;
      data?: { session_token: string; session_id: string };
      message?: string;
    };

    if (!data.data?.session_token) {
      console.error("[heygen/token] No token in response:", data);
      return NextResponse.json(
        { error: data.message ?? "No token returned from LiveAvatar" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sessionToken: data.data.session_token,
      sessionId: data.data.session_id,
    });
  } catch (err) {
    console.error("[heygen/token] Failed:", err);
    return NextResponse.json(
      { error: "Failed to create LiveAvatar session token" },
      { status: 500 }
    );
  }
}

