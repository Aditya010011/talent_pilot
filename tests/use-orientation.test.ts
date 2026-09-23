import assert from "node:assert/strict";
import test from "node:test";
import { isMobileWidth, isPortrait } from "@/hooks/use-orientation";

test("isPortrait returns true when height exceeds width", () => {
  assert.equal(isPortrait(480, 854), true);
});

test("isPortrait returns false when width exceeds or equals height", () => {
  assert.equal(isPortrait(1024, 768), false);
  assert.equal(isPortrait(500, 500), false);
});

test("isMobileWidth returns true below the 768px breakpoint", () => {
  assert.equal(isMobileWidth(480), true);
});

test("isMobileWidth returns false at or above the 768px breakpoint", () => {
  assert.equal(isMobileWidth(768), false);
  assert.equal(isMobileWidth(1024), false);
});

test("isMobileWidth respects a custom breakpoint", () => {
  assert.equal(isMobileWidth(800, 1024), true);
  assert.equal(isMobileWidth(1200, 1024), false);
});
