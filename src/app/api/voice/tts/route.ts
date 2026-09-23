import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { synthesizeGoogleTtsFloat32 } from "@/lib/google-tts";

const log = createLogger("api/voice/tts");

/**
 * POST /api/voice/tts
 *
 * Google Cloud TTS for the onboarding speaker/mic test.
 * Body: { text: string, language?: string }
 * Response: raw float32 PCM @ 24 kHz mono (application/octet-stream)
 */
export async function POST(req: Request) {
  let body: { text?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid or empty JSON body" }, { status: 400 });
  }

  const text = body.text;
  const language = typeof body.language === "string" ? body.language : undefined;

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  try {
    const pcm = await synthesizeGoogleTtsFloat32(text, language);
    if (pcm.length === 0) {
      return NextResponse.json({ error: "Empty TTS output" }, { status: 502 });
    }

    return new Response(new Uint8Array(pcm), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    log.error("Google TTS failed:", err);
    return NextResponse.json(
      { error: "Google TTS synthesis failed" },
      { status: 502 }
    );
  }
}
