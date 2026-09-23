import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampMediaRect,
  createMediaOverlay,
  DEFAULT_MEDIA_RECT,
  insertSlidesAt,
  isVideoMediaSlide,
  LEGACY_DEFAULT_MEDIA_RECT,
  reorderSlides,
  resolveMediaRect,
  shouldSkipScriptGeneration,
} from "../src/lib/slide-media";

describe("slide media helpers", () => {
  it("inserts a multi-slide pptx between existing slides", () => {
    const existing = [
      { slide: 1, title: "A" },
      { slide: 2, title: "B" },
      { slide: 3, title: "C" },
    ];
    const incoming = Array.from({ length: 10 }, (_, i) => ({
      slide: i + 1,
      title: `N${i + 1}`,
    }));
    const next = insertSlidesAt(existing, 2, incoming);
    assert.equal(next.length, 13);
    assert.deepEqual(
      next.map((s) => s.title),
      ["A", "B", ...incoming.map((s) => s.title), "C"],
    );
    assert.deepEqual(
      next.map((s) => s.slide),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    );
  });

  it("inserts before the first and after the last", () => {
    const existing = [{ slide: 1, title: "Only" }];
    const before = insertSlidesAt(existing, 0, [{ slide: 99, title: "First" }]);
    assert.deepEqual(
      before.map((s) => s.title),
      ["First", "Only"],
    );
    const after = insertSlidesAt(existing, 1, [{ slide: 99, title: "Last" }]);
    assert.deepEqual(
      after.map((s) => s.title),
      ["Only", "Last"],
    );
  });

  it("reorders slides and reindexes", () => {
    const slides = [
      { slide: 1, title: "A" },
      { slide: 2, title: "B" },
      { slide: 3, title: "C" },
    ];
    const next = reorderSlides(slides, 0, 2);
    assert.deepEqual(
      next.map((s) => s.title),
      ["B", "C", "A"],
    );
    assert.deepEqual(
      next.map((s) => s.slide),
      [1, 2, 3],
    );
  });

  it("clamps overlay rects inside the canvas", () => {
    const clamped = clampMediaRect({ x: -10, y: 90, w: 50, h: 50 });
    assert.equal(clamped.x, 0);
    assert.ok(clamped.y + clamped.h <= 100);
    assert.ok(clamped.w >= 8);
  });

  it("creates overlays that fill the 16:9 slide canvas", () => {
    const media = createMediaOverlay("video", "https://example.com/a.mp4");
    assert.deepEqual(
      { x: media.x, y: media.y, w: media.w, h: media.h },
      DEFAULT_MEDIA_RECT,
    );
    assert.deepEqual(DEFAULT_MEDIA_RECT, { x: 0, y: 0, w: 100, h: 100 });
  });

  it("treats the legacy 10/10/80/80 inset as fill-the-slide", () => {
    assert.deepEqual(resolveMediaRect(LEGACY_DEFAULT_MEDIA_RECT), DEFAULT_MEDIA_RECT);
    const custom = { x: 20, y: 15, w: 50, h: 40 };
    assert.deepEqual(resolveMediaRect(custom), custom);
  });

  it("treats video overlays as skip-script slides", () => {
    const video = {
      skipScript: true,
      media: createMediaOverlay("video", "https://example.com/a.mp4"),
    };
    assert.equal(isVideoMediaSlide(video), true);
    assert.equal(shouldSkipScriptGeneration(video), true);
    assert.equal(shouldSkipScriptGeneration({ media: createMediaOverlay("image", "https://x/a.png") }), false);
  });
});
