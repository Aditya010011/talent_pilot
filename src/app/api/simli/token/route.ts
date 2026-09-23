import { NextResponse } from "next/server";
import { generateSimliSessionToken, type SimliSessionRequest } from "simli-client";
import { resolveSimliFaceId } from "@/lib/simli-face";
import { buildSimliSessionConfig } from "@/lib/simli-session";

/**
 * POST /api/simli/token
 * Generates a Simli session token server-side so the API key is never exposed to the browser.
 * Face ID: request body `faceId` → `SIMLI_FACE_ID` → `NEXT_PUBLIC_SIMLI_FACE_ID`.
 */
export async function POST(req: Request) {
  const apiKey = process.env.SIMLI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "SIMLI_API_KEY not configured" }, { status: 500 });
  }

  let requestedFaceId: unknown;
  try {
    const body = await req.json();
    requestedFaceId = (body as { faceId?: unknown }).faceId;
  } catch {
    /* empty body is fine */
  }

  const faceId =
    resolveSimliFaceId(requestedFaceId) ||
    process.env.SIMLI_FACE_ID ||
    process.env.NEXT_PUBLIC_SIMLI_FACE_ID ||
    undefined;
  if (!faceId) {
    return NextResponse.json(
      { error: "SIMLI_FACE_ID not configured" },
      { status: 500 },
    );
  }

  try {
    const config: SimliSessionRequest = buildSimliSessionConfig(faceId);

    const result = await generateSimliSessionToken({ apiKey, config });
    return NextResponse.json({ sessionToken: result.session_token });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[simli/token] Failed to generate session token");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
