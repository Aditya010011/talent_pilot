import assert from "node:assert/strict";
import test from "node:test";
import { getVideoConstraints } from "@/lib/video-constraints";

test("portrait constraints request a tall aspect ratio", () => {
  const c = getVideoConstraints(true) as { width: { ideal: number }; height: { ideal: number }; aspectRatio: { ideal: number } };
  assert.equal(c.width.ideal, 480);
  assert.equal(c.height.ideal, 854);
  assert.ok(Math.abs(c.aspectRatio.ideal - 9 / 16) < 0.001);
});

test("landscape constraints request the existing 4:3 default", () => {
  const c = getVideoConstraints(false) as { width: { ideal: number }; height: { ideal: number }; aspectRatio: { ideal: number } };
  assert.equal(c.width.ideal, 640);
  assert.equal(c.height.ideal, 480);
  assert.ok(Math.abs(c.aspectRatio.ideal - 4 / 3) < 0.001);
});
