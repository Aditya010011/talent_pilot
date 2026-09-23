import {
  computeMessageBasedDuration,
  computeSegmentDuration,
  effectiveNowForSession,
  type ActivitySegment,
} from "@/app/api/voice/save/logic";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const log = createLogger("api/session/complete");

/**
 * Parse sessionId from JSON, text/plain JSON (sendBeacon), form bodies,
 * or tRPC-shaped `{ json: { id } }` payloads.
 */
async function extractSessionId(req: Request): Promise<string | null> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      const id =
        form.get("sessionId")?.toString() ||
        form.get("id")?.toString() ||
        null;
      return id?.trim() || null;
    }

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const id =
        form.get("sessionId")?.toString() ||
        form.get("id")?.toString() ||
        null;
      return id?.trim() || null;
    }

    // application/json, text/plain, or missing Content-Type (beacon)
    const raw = await req.text();
    if (!raw?.trim()) return null;

    try {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (typeof body.sessionId === "string" && body.sessionId.trim()) {
        return body.sessionId.trim();
      }
      if (typeof body.id === "string" && body.id.trim()) {
        return body.id.trim();
      }
      // tRPC mutation shape: { json: { id } }
      const nested = body.json as Record<string, unknown> | undefined;
      if (nested && typeof nested.id === "string" && nested.id.trim()) {
        return nested.id.trim();
      }
      if (nested && typeof nested.sessionId === "string" && nested.sessionId.trim()) {
        return nested.sessionId.trim();
      }
    } catch {
      // Plain UUID string body
      const trimmed = raw.trim();
      if (/^[0-9a-f-]{36}$/i.test(trimmed)) return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const sessionId = await extractSessionId(req);
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, status, startedAt, lastActivityAt, interviewId, activitySegments")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Idempotent: already terminal
    if (session.status === "COMPLETED" || session.status === "ABANDONED") {
      return NextResponse.json({
        ok: true,
        alreadyCompleted: true,
        status: session.status,
      });
    }

    const now = new Date();
    const cappedNowMs = effectiveNowForSession(
      session.lastActivityAt as string | null,
      now.getTime(),
    );
    const cappedNowIso = new Date(cappedNowMs).toISOString();
    const segments = (session.activitySegments ?? []) as ActivitySegment[];
    const closed = segments.map((s) =>
      s.leftAt === null ? { ...s, leftAt: cappedNowIso } : s,
    );

    let duration: number;
    if (closed.length > 0) {
      duration = computeSegmentDuration(closed, cappedNowMs);
    } else {
      const { data: msgRows } = await supabaseAdmin
        .from("messages")
        .select("timestamp")
        .eq("sessionId", sessionId)
        .order("timestamp", { ascending: true });
      const msgTimesMs = (msgRows ?? []).map((r) =>
        new Date(r.timestamp as string).getTime(),
      );
      duration = computeMessageBasedDuration(
        new Date(session.startedAt as string).getTime(),
        msgTimesMs,
        cappedNowMs,
      );
    }

    // Unconditional status flip — no transcript / recording / message gate
    const { error } = await supabaseAdmin
      .from("sessions")
      .update({
        status: "COMPLETED" as const,
        completedAt: now.toISOString(),
        activitySegments: closed,
        totalDurationSeconds: duration,
      })
      .eq("id", sessionId)
      .neq("status", "COMPLETED");

    if (error) {
      log.error(`Failed to complete session ${sessionId}:`, error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    log.info(`Session ${sessionId} completed (${duration}s)`);

    return NextResponse.json({ ok: true, status: "COMPLETED" });
  } catch (err) {
    log.error("session complete error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
