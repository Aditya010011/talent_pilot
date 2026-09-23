# Vertical/Portrait Camera Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add orientation-aware camera capture and a WhatsApp-style big/mini-PiP swap layout across the live interview, onboarding camera check, and results playback screens.

**Architecture:** New `useOrientation` hook + `getVideoConstraints` helper feed capture constraints at three `getUserMedia` call sites. Extend the existing `DraggablePip` component with tap detection and a `swapped` state in `VoiceInterface` to flip big/mini without unmounting WebRTC-bound avatar panels. Reuse the same swap primitive for desktop theater mode and pregenerated-interview playback.

**Tech Stack:** React, Next.js, TypeScript, Tailwind, `node:test`/`assert` for unit tests (existing convention in `tests/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-09-vertical-portrait-camera-support-design.md`

## Global Constraints

- Capture orientation is detected **once** per screen/session (camera-check mount, live-session start) — never reflowed mid-session on rotation (spec Section 1).
- Mid-session rotation shows a one-time toast only; no layout/recording changes.
- Avatar panels (Simli/Vidu) must never be unmounted/remounted by the swap — style-only repositioning (spec Section 2).
- Desktop theater-mode toggle state is session-only, not persisted (spec Section 5).
- No change to non-pregenerated playback beyond aspect-ratio fix — no second video track exists to swap with there (spec Out of Scope).

---

### Task 1: `useOrientation` hook

**Files:**
- Create: `src/hooks/use-orientation.ts`
- Test: `tests/use-orientation.test.ts`

**Interfaces:**
- Produces: `useOrientation(): { portrait: boolean }` — mirrors `useIsMobile` shape (`src/hooks/use-is-mobile.ts`).

- [ ] **Step 1: Write the failing test** — test the pure predicate the hook uses, extracted as an exported helper so it's testable without a DOM/jsdom environment:

```ts
// tests/use-orientation.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { isPortrait } from "@/hooks/use-orientation";

test("isPortrait returns true when height exceeds width", () => {
  assert.equal(isPortrait(480, 854), true);
});

test("isPortrait returns false when width exceeds or equals height", () => {
  assert.equal(isPortrait(1024, 768), false);
  assert.equal(isPortrait(500, 500), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/use-orientation.test.ts` (matches existing `node:test` convention seen in `tests/voice-save-route.test.ts`)
Expected: FAIL — `isPortrait` / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/use-orientation.ts
import { useEffect, useState } from "react";

export function isPortrait(width: number, height: number): boolean {
  return height > width;
}

export function useOrientation() {
  const [portrait, setPortrait] = useState(() =>
    typeof window === "undefined"
      ? false
      : isPortrait(window.innerWidth, window.innerHeight),
  );

  useEffect(() => {
    const handler = () => setPortrait(isPortrait(window.innerWidth, window.innerHeight));
    handler();
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }, []);

  return { portrait };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/use-orientation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-orientation.ts tests/use-orientation.test.ts
git commit -m "feat: add useOrientation hook for portrait/landscape detection"
```

---

### Task 2: `getVideoConstraints` helper

**Files:**
- Create: `src/lib/video-constraints.ts`
- Test: `tests/video-constraints.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `getVideoConstraints(portrait: boolean): MediaTrackConstraints` — consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```ts
// tests/video-constraints.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/video-constraints.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/video-constraints.ts
export function getVideoConstraints(portrait: boolean): MediaTrackConstraints {
  return portrait
    ? { width: { ideal: 480 }, height: { ideal: 854 }, aspectRatio: { ideal: 9 / 16 } }
    : { width: { ideal: 640 }, height: { ideal: 480 }, aspectRatio: { ideal: 4 / 3 } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/video-constraints.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-constraints.ts tests/video-constraints.test.ts
git commit -m "feat: add getVideoConstraints helper for orientation-aware capture"
```

---

### Task 3: Wire orientation-aware constraints into the 4 `getUserMedia` call sites

**Files:**
- Modify: `src/hooks/use-interview-recording.ts:268-271` (inside `acquireStreams`)
- Modify: `src/components/session/voice-interface.tsx:829-832` and `:877-880` (preview-camera acquire + re-acquire effects)
- Modify: `src/components/session/interviewee-onboarding.tsx:284-286` (`CameraCheck.startCamera`)

**Interfaces:**
- Consumes: `useOrientation` (Task 1), `getVideoConstraints` (Task 2).

- [ ] **Step 1: `use-interview-recording.ts`** — import `getVideoConstraints`, snapshot orientation once via `typeof window !== "undefined" && window.innerHeight > window.innerWidth` at the top of `acquireStreams` (this hook has no access to a live React hook call inside a `useCallback` body across renders safely, so read `window.innerWidth/innerHeight` directly rather than calling `useOrientation()` — the hook is for components; this is a plain callback):

```ts
const portrait = typeof window !== "undefined" && window.innerHeight > window.innerWidth;
const cam = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: "user", ...getVideoConstraints(portrait) },
  audio: false,
});
```
Add `import { getVideoConstraints } from "@/lib/video-constraints";` near the top imports.

- [ ] **Step 2: `voice-interface.tsx`** — at the top of the component, add `const { portrait } = useOrientation();` (import from `@/hooks/use-orientation`). Replace both `{ facingMode: "user", width: 640, height: 480 }` literals with `{ facingMode: "user", ...getVideoConstraints(portrait) }`.

- [ ] **Step 3: `interviewee-onboarding.tsx`** — inside `CameraCheck`, add `const { portrait } = useOrientation();` and replace the `startCamera` constraints:

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: "user", ...getVideoConstraints(portrait) },
});
```

- [ ] **Step 4: Mid-session rotation toast** (spec Section 1) — in `voice-interface.tsx`, add an effect that fires once if orientation changes after the session's initial `portrait` value was captured:

```ts
const initialPortraitRef = useRef(portrait);
const rotationWarnedRef = useRef(false);
useEffect(() => {
  if (!rotationWarnedRef.current && portrait !== initialPortraitRef.current) {
    rotationWarnedRef.current = true;
    toast("Rotating your device may affect recording quality — keep it steady");
  }
}, [portrait]);
```
Use the existing toast utility already imported elsewhere in this file (check for `sonner`/`toast` import; reuse it rather than adding a new one).

- [ ] **Step 5: Manual verification** — run `npm run build` (or `npx tsc --noEmit`) to confirm no type errors from the spread/import changes.

Run: `npx tsc --noEmit`
Expected: no new errors referencing these three files.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-interview-recording.ts src/components/session/voice-interface.tsx src/components/session/interviewee-onboarding.tsx
git commit -m "feat: request orientation-aware camera constraints at all capture sites"
```

---

### Task 4: Onboarding `CameraCheck` — fix portrait cropping in preview

**Files:**
- Modify: `src/components/session/interviewee-onboarding.tsx:384-407` (preview `<video>`/photo container)

**Interfaces:**
- Consumes: `portrait` from Task 3's `useOrientation()` call already added to `CameraCheck`.

- [ ] **Step 1: Replace fixed `h-36 w-44` + `object-cover` box** with an aspect-aware container. Since this is a fixed-size preview thumbnail (not full-stage), keep it visually compact but switch the crop behavior for portrait so the frame isn't cut at the sides:

```tsx
<div
  className={cn(
    "relative overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/50",
    portrait ? "h-44 w-32" : "h-36 w-44",
  )}
>
  {photo ? (
    <img src={photo} alt="Captured photo" className="h-full w-full object-contain" />
  ) : streaming ? (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="h-full w-full scale-x-[-1] object-contain"
    />
  ) : (
    /* unchanged placeholder */
  )}
</div>
```
Import `cn` is already used elsewhere in this file (check existing import; add `import { cn } from "@/lib/utils";` if not already present — grep first).

- [ ] **Step 2: Manual verification** — `npx tsc --noEmit`; visually confirm in dev server (`npm run dev`) with browser devtools device toolbar set to a portrait phone size that the camera preview shows full frame, not side-cropped.

- [ ] **Step 3: Commit**

```bash
git add src/components/session/interviewee-onboarding.tsx
git commit -m "fix: stop cropping portrait camera preview in onboarding CameraCheck"
```

---

### Task 5: Extend `DraggablePip` with tap detection

**Files:**
- Modify: `src/components/session/voice-interface.tsx:384-469` (`DraggablePip` component)

**Interfaces:**
- Produces: `DraggablePip` now accepts an optional `onTap?: () => void` prop, consumed by Task 6.

- [ ] **Step 1: Write the failing test** — extract the tap-vs-drag threshold check as a pure exported helper for testability:

```ts
// tests/pip-tap-detection.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { isTap } from "@/components/session/pip-tap-detection";

test("small pointer movement counts as a tap", () => {
  assert.equal(isTap({ startX: 100, startY: 100, endX: 102, endY: 103 }), true);
});

test("large pointer movement counts as a drag, not a tap", () => {
  assert.equal(isTap({ startX: 100, startY: 100, endX: 130, endY: 100 }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/pip-tap-detection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/session/pip-tap-detection.ts
const TAP_THRESHOLD_PX = 5;

export function isTap(args: { startX: number; startY: number; endX: number; endY: number }): boolean {
  const dx = args.endX - args.startX;
  const dy = args.endY - args.startY;
  return Math.sqrt(dx * dx + dy * dy) < TAP_THRESHOLD_PX;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/pip-tap-detection.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into `DraggablePip`** — add `onTap?: () => void` to its props, capture pointerdown coordinates (already tracked in `dragState.current.startX/startY`), and on `pointerup` call `isTap({...})`; if true, call `onTap?.()` instead of (or in addition to) finalizing a drag position. Import `isTap` from the new file.

- [ ] **Step 6: Commit**

```bash
git add src/components/session/pip-tap-detection.ts tests/pip-tap-detection.test.ts src/components/session/voice-interface.tsx
git commit -m "feat: add tap detection to DraggablePip for swap gesture"
```

---

### Task 6: Big/mini swap state for live interview (mobile + Simli/Vidu/static)

**Files:**
- Modify: `src/components/session/voice-interface.tsx` (component body near other `useState` declarations ~line 490-500; `renderSimliZoomTiles`/`renderVoiceZoomTiles`/static avatar layout ~lines 2339-2610)

**Interfaces:**
- Consumes: `DraggablePip` with `onTap` (Task 5), `useIsMobile` (existing).
- Produces: `swapped: boolean` state and a `bigStyle`/`miniStyle` computation reused by Task 8 (theater mode).

- [ ] **Step 1: Add state** near existing `avatarMode`/`useZoomLayout` declarations:

```ts
const [swapped, setSwapped] = useState(false);
```

- [ ] **Step 2: Compute style objects** (reusing the existing `avatarStyle` teleport pattern at ~line 2580) — add a small helper inline where `avatarStyle` is computed:

```ts
const bigStageStyle: React.CSSProperties = swapped
  ? { position: "absolute", right: 16, bottom: 100, width: 144, height: 112, zIndex: 20 }
  : { position: "relative", width: "100%", height: "100%", zIndex: 1 };
const miniPipStyle: React.CSSProperties = swapped
  ? { position: "relative", width: "100%", height: "100%", zIndex: 1 }
  : { position: "absolute", right: 16, bottom: 100, width: 144, height: 112, zIndex: 20 };
```
Apply `bigStageStyle` to the avatar container (the `<div style={avatarStyle} ...>` block ~line 2580, merged with existing `avatarStyle`) and `miniPipStyle` to the candidate camera `DraggablePip` wrapper, only when `isMobile && avatarMode !== "none"`. Pass `onTap={() => setSwapped((v) => !v)}` to the candidate camera's `DraggablePip`.

- [ ] **Step 3: Manual verification** — `npm run dev`, open with device toolbar in portrait mode on a Simli/static-avatar interview, confirm tapping the mini tile swaps big/mini without the avatar video freezing/reconnecting (check browser console for no WebRTC re-negotiation logs).

- [ ] **Step 4: Commit**

```bash
git add src/components/session/voice-interface.tsx
git commit -m "feat: add tap-to-swap big/mini PiP layout for live interview on mobile"
```

---

### Task 7: Desktop theater mode toggle

**Files:**
- Modify: `src/components/session/voice-interface.tsx` (control bar JSX where mic/camera toggle buttons render; reuses `swapped`/style logic from Task 6)

**Interfaces:**
- Consumes: `swapped` state and `bigStageStyle`/`miniPipStyle` from Task 6.
- Produces: `theaterMode: boolean` state, gating when the Task 6 styles apply on desktop.

- [ ] **Step 1: Add state**

```ts
const [theaterMode, setTheaterMode] = useState(false);
```

- [ ] **Step 2: Add toggle button** in the existing control bar (find the mic/camera icon buttons row), rendered only when `!isMobile`:

```tsx
{!isMobile && (
  <Button
    size="sm"
    variant={theaterMode ? "default" : "outline"}
    onClick={() => setTheaterMode((v) => !v)}
    title="Theater mode"
  >
    <Maximize2 className="h-4 w-4" />
  </Button>
)}
```
Add `Maximize2` to the existing `lucide-react` import list at the top of the file.

- [ ] **Step 3: Gate the big/mini styles from Task 6** — change the condition from `isMobile && avatarMode !== "none"` to `(isMobile || theaterMode) && avatarMode !== "none"`.

- [ ] **Step 4: Manual verification** — on a desktop-width viewport, toggle theater mode on/off and confirm it switches between the existing side-by-side Zoom tiles and the big/mini swap layout; confirm starting a new interview resets `theaterMode` to `false` (no persistence, per spec).

- [ ] **Step 5: Commit**

```bash
git add src/components/session/voice-interface.tsx
git commit -m "feat: add desktop theater mode toggle reusing big/mini PiP layout"
```

---

### Task 8: Results/playback aspect-ratio fix + pregenerated-interview swap

**Files:**
- Modify: `src/components/interview/interview-results.tsx` (video player container(s))

**Interfaces:**
- Consumes: none new; uses native `<video>` `loadedmetadata` event and `videoWidth`/`videoHeight`.

- [ ] **Step 1: Locate the fixed `aspect-video` player container(s)** in `interview-results.tsx` via `grep -n "aspect-video\|aspect-\[16" src/components/interview/interview-results.tsx`.

- [ ] **Step 2: Add aspect-ratio-from-metadata state** for the default (single-video) case:

```ts
const [videoAspect, setVideoAspect] = useState<number | null>(null);
// on the <video> element:
onLoadedMetadata={(e) => {
  const v = e.currentTarget;
  if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
}}
```
Replace the fixed `aspect-video` class on the container with an inline `style={{ aspectRatio: videoAspect ?? 16 / 9 }}` and switch `object-cover` to `object-contain` on the `<video>` element so portrait recordings are no longer cropped.

- [ ] **Step 3: Pregenerated-interview swap** — where the component already distinguishes a pregenerated AI question video from the candidate response video (grep for the field name, likely something like `questionVideoUrl`/`aiVideoUrl`), wrap both `<video>` elements the same way as Task 6 but simplified (no WebRTC constraint): a `swapped` `useState(false)` local to that section, conditional Tailwind classes (`"absolute bottom-2 right-2 h-28 w-20 z-20"` for mini vs `"relative w-full h-full"` for big) on whichever element is not the visually big one, toggled via an `onClick` on the mini element (no drag needed here since it's playback, not live camera — a simple tap-to-swap `<button>`-wrapped video is sufficient).

- [ ] **Step 4: Manual verification** — play back a portrait-recorded session (confirm no cropping) and a pregenerated-interview session (confirm tap-to-swap between AI question video and candidate response video).

- [ ] **Step 5: Commit**

```bash
git add src/components/interview/interview-results.tsx
git commit -m "fix: stop cropping portrait playback video and add swap for pregenerated interviews"
```
