import { createLogger } from "@/lib/logger";
import { saveMediaFile, type MediaBucket } from "@/lib/local-media-storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const log = createLogger("api/session/upload");

/**
 * Turn a candidate name/email into a filesystem-safe folder label:
 * lowercased, non-alphanumeric runs collapsed to a single "-", and
 * trimmed/truncated so it stays a reasonable folder name length.
 */
function slugifyLabel(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 60);
}

/**
 * Resolve the JobPost (interview) and candidate identifiers for a given
 * session so recordings can be organized on disk as
 * Recordings/<interviewId>/<candidateName-or-email>_<candidateId>/<sessionId>/<filename>
 * instead of a flat <sessionId>/<filename> layout.
 */
async function resolveHierarchyIds(
  sessionId: string,
): Promise<{ interviewId: string; candidateId: string }> {
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("id, interviewId, participantName, participantEmail")
    .eq("id", sessionId)
    .maybeSingle();

  const interviewId = session?.interviewId ?? "unknown-interview";

  const { data: candidate } = await supabaseAdmin
    .from("candidates")
    .select("id, name, email")
    .eq("sessionId", sessionId)
    .maybeSingle();

  // Prefer the candidate's name/email; fall back to the session's
  // participant info (covers walk-ins that filled a name/email but have
  // no candidate row yet).
  const label =
    candidate?.name ||
    candidate?.email ||
    session?.participantName ||
    session?.participantEmail ||
    null;
  const slug = label ? slugifyLabel(label) : "";

  // Walk-in sessions (no linked candidate row) fall back to the sessionId
  // as their "candidate" id so files still land under the interview.
  const rawCandidateId = candidate?.id ?? `walkin-${sessionId}`;
  const candidateId = slug ? `${slug}_${rawCandidateId}` : rawCandidateId;

  return { interviewId, candidateId };
}

/**
 * Upload a file (audio/video recording or screenshot) to local disk on this
 * VM (see LOCAL_MEDIA_DIR / src/lib/local-media-storage.ts) instead of
 * Supabase Storage. The DB only ever stores the returned same-origin URL.
 *
 * Files are stored under a hierarchical path:
 *   <bucket>/<interviewId>/<candidateName-or-email>_<candidateId>/<sessionId>/<filename>
 *
 * Expects multipart FormData with:
 *   - file: Blob/File
 *   - sessionId: string
 *   - type: "recording" | "video" | "screenshot"
 *   - filename: string (optional, used as the storage path suffix)
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;
    const sessionId = formData.get("sessionId") as string | null;
    const type = formData.get("type") as string | null;
    const filename = formData.get("filename") as string | null;

    if (!file || !sessionId || !type) {
      return NextResponse.json(
        { error: "Missing required fields: file, sessionId, type" },
        { status: 400 },
      );
    }

    if (type !== "recording" && type !== "screenshot" && type !== "video") {
      return NextResponse.json(
        { error: 'type must be "recording", "screenshot", or "video"' },
        { status: 400 },
      );
    }

    const bucket: MediaBucket =
      type === "recording"
        ? "recordings"
        : type === "video"
          ? "videos"
          : "screenshots";
    const defaultExt =
      type === "recording"
        ? (file.type?.includes("mp4") || file.type?.includes("m4a") ? "m4a" : "webm")
        : type === "video"
          ? "webm"
          : "jpg";
    const relPath = filename || `${Date.now()}.${defaultExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { interviewId, candidateId } = await resolveHierarchyIds(sessionId);

    const { url, path: storagePath } = await saveMediaFile(
      bucket,
      `${interviewId}/${candidateId}/${sessionId}/${relPath}`,
      buffer,
    );

    log.info("Saved media file to local disk", {
      bucket,
      sessionId,
      interviewId,
      candidateId,
      bytes: buffer.length,
    });

    return NextResponse.json({ url, path: storagePath, bucket });
  } catch (err) {
    log.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
