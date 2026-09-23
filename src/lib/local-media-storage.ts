import "server-only";

import fs from "fs/promises";
import path from "path";

/**
 * Local on-disk storage for interview recordings/screenshots.
 *
 * Replaces Supabase Storage for these buckets: the browser uploads land
 * directly on this VM's filesystem (under LOCAL_MEDIA_DIR, mounted as a
 * Docker volume so it survives container restarts/rebuilds), and we hand
 * back a same-origin URL served by /api/media/local/[...path]. The DB only
 * ever stores that relative path/URL — never a Supabase bucket reference.
 */

export type MediaBucket = "recordings" | "videos" | "screenshots";

const ALLOWED_BUCKETS: MediaBucket[] = ["recordings", "videos", "screenshots"];

export function isMediaBucket(value: string): value is MediaBucket {
  return (ALLOWED_BUCKETS as string[]).includes(value);
}

/** Root directory where recordings are persisted on disk. */
export function getMediaBaseDir(): string {
  return (process.env.LOCAL_MEDIA_DIR ?? "/app/media").trim() || "/app/media";
}

/** Reject path traversal / absolute paths before touching the filesystem. */
export function sanitizeRelativePath(bucket: string, relPath: string): string {
  if (!isMediaBucket(bucket)) {
    throw new Error(`Invalid media bucket: ${bucket}`);
  }
  const normalized = path.posix.normalize(relPath).replace(/^(\.\.(\/|$))+/, "");
  if (normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid media path: ${relPath}`);
  }
  return normalized;
}

/** Absolute filesystem path for a given bucket + relative path. */
export function resolveDiskPath(bucket: string, relPath: string): string {
  const safeRel = sanitizeRelativePath(bucket, relPath);
  return path.join(getMediaBaseDir(), bucket, safeRel);
}

/** Same-origin URL the browser/DB should use to reference this file. */
export function mediaUrlForPath(bucket: MediaBucket, relPath: string): string {
  const safeRel = sanitizeRelativePath(bucket, relPath);
  return `/api/media/local/${bucket}/${safeRel.split(path.sep).join("/")}`;
}

/** True when a stored value is already one of our local media URLs. */
export function isLocalMediaUrl(value: string): boolean {
  return typeof value === "string" && value.includes("/api/media/local/");
}

/** Write a file to disk, creating parent directories as needed. */
export async function saveMediaFile(
  bucket: MediaBucket,
  relPath: string,
  data: Buffer,
): Promise<{ diskPath: string; url: string; path: string }> {
  const safeRel = sanitizeRelativePath(bucket, relPath);
  const diskPath = resolveDiskPath(bucket, safeRel);
  await fs.mkdir(path.dirname(diskPath), { recursive: true });
  await fs.writeFile(diskPath, data);
  return {
    diskPath,
    url: mediaUrlForPath(bucket, safeRel),
    path: `${bucket}/${safeRel}`,
  };
}
