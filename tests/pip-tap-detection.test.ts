import assert from "node:assert/strict";
import test from "node:test";
import { isTap } from "@/components/session/pip-tap-detection";

test("small pointer movement counts as a tap", () => {
  assert.equal(isTap({ startX: 100, startY: 100, endX: 102, endY: 103 }), true);
});

test("large pointer movement counts as a drag, not a tap", () => {
  assert.equal(isTap({ startX: 100, startY: 100, endX: 130, endY: 100 }), false);
});
