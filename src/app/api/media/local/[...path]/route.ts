import { createLogger } from "@/lib/logger";
import {
  isMediaBucket,
  resolveDiskPath,
} from "@/lib/local-media-storage";
import fs from "fs/promises";
import { NextResponse } from "next/server";

const log = createLogger("api/media/local");

const CONTENT_TYPES: Record<string, string> = {
  webm: "video/webm",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/**
 * Serves interview recordings/screenshots that were saved to local disk on
 * this VM (see src/lib/local-media-storage.ts) instead of Supabase Storage.
 *
 * URL shape: /api/media/local/<bucket>/<interviewId>/<candidateId>/<sessionId>/<filename>
 * (older recordings saved before the hierarchical restructure use the
 * legacy /api/media/local/<bucket>/<sessionId>/<filename> shape — both are
 * served identically since this route just resolves whatever relative path
 * follows the bucket segment).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const [bucket, ...rest] = segments ?? [];

  if (!bucket || !isMediaBucket(bucket) || rest.length === 0) {
    return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
  }

  const relPath = rest.join("/");
  let diskPath: string;
  try {
    diskPath = resolveDiskPath(bucket, relPath);
  } catch {
    return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
  }

  let stat;
  try {
    stat = await fs.stat(diskPath);
  } catch (err) {
    log.warn("Local media file not found", { bucket, relPath, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = relPath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  // Support Range requests so <video>/<audio> seeking works for large files.
  const range = req.headers.get("range");
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    const fh = await fs.open(diskPath, "r");
    try {
      const buffer = Buffer.alloc(chunkSize);
      await fh.read(buffer, 0, chunkSize, start);
      return new NextResponse(new Uint8Array(buffer), {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    } finally {
      await fh.close();
    }
  }

  const data = await fs.readFile(diskPath);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    },
  });
}
