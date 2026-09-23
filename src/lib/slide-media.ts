import { z } from "zod";

/** Percent-based overlay rect on the 16:9 slide canvas (0–100). */
export const slideMediaSchema = z.object({
  type: z.enum(["video", "image"]),
  url: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const scriptSlideSchema = z.object({
  slide: z.number(),
  title: z.string(),
  script: z.string(),
  imageUrl: z.string().optional(),
  media: slideMediaSchema.optional(),
  skipScript: z.boolean().optional(),
});

export type SlideMedia = z.infer<typeof slideMediaSchema>;
export type ScriptSlide = z.infer<typeof scriptSlideSchema>;
export type SlideMediaRect = Pick<SlideMedia, "x" | "y" | "w" | "h">;

/** Fill the 16:9 slide canvas — same frame as PPT `imageUrl` slides. */
export const DEFAULT_MEDIA_RECT: SlideMediaRect = { x: 0, y: 0, w: 100, h: 100 };
/** Previous inset default; treat as fill so existing video-only slides aren't pillarboxed. */
export const LEGACY_DEFAULT_MEDIA_RECT: SlideMediaRect = { x: 10, y: 10, w: 80, h: 80 };
export const MIN_MEDIA_SIZE = 8;

export function rectsEqual(a: SlideMediaRect, b: SlideMediaRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Map the old 10/10/80/80 inset to full-bleed; keep any custom drag/resize. */
export function resolveMediaRect(rect: SlideMediaRect): SlideMediaRect {
  if (rectsEqual(rect, LEGACY_DEFAULT_MEDIA_RECT)) {
    return { ...DEFAULT_MEDIA_RECT };
  }
  return clampMediaRect(rect);
}

export function createMediaOverlay(type: SlideMedia["type"], url: string): SlideMedia {
  return { type, url, ...DEFAULT_MEDIA_RECT };
}

export function clampMediaRect(rect: SlideMediaRect): SlideMediaRect {
  let w = Math.max(MIN_MEDIA_SIZE, Math.min(100, rect.w));
  let h = Math.max(MIN_MEDIA_SIZE, Math.min(100, rect.h));
  const x = Math.max(0, Math.min(100 - w, rect.x));
  const y = Math.max(0, Math.min(100 - h, rect.y));
  w = Math.min(w, 100 - x);
  h = Math.min(h, 100 - y);
  return { x, y, w, h };
}

export function reindexSlides<T extends { slide: number }>(slides: T[]): T[] {
  return slides.map((s, idx) => ({ ...s, slide: idx + 1 }));
}

/** Insert `incoming` at `index` (0 = before first, length = after last) and reindex. */
export function insertSlidesAt<T extends { slide: number }>(
  slides: T[],
  index: number,
  incoming: T[],
): T[] {
  if (incoming.length === 0) return reindexSlides(slides);
  const clamped = Math.max(0, Math.min(index, slides.length));
  const next = [...slides];
  next.splice(clamped, 0, ...incoming);
  return reindexSlides(next);
}

export function reorderSlides<T extends { slide: number }>(
  slides: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= slides.length ||
    toIndex >= slides.length
  ) {
    return reindexSlides(slides);
  }
  const next = [...slides];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return reindexSlides(next);
}

export function isVideoMediaSlide(slide: {
  media?: SlideMedia | null;
  skipScript?: boolean;
} | null | undefined): boolean {
  return slide?.media?.type === "video" && !!slide.media.url;
}

export function shouldSkipScriptGeneration(slide: {
  media?: SlideMedia | null;
  skipScript?: boolean;
} | null | undefined): boolean {
  return !!slide?.skipScript || isVideoMediaSlide(slide);
}
