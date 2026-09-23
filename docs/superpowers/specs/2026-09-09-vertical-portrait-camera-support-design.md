# Vertical/Portrait Camera Support — Design Spec

## Context

Camera tiles across the live interview, onboarding camera-check, and results
playback screens are hard-coded to landscape `aspect-video`/`16:9` with
`object-fit: cover`. Portrait (mobile) camera feeds get cropped, and capture
constraints request fixed `640x480` regardless of device orientation. This
spec introduces orientation-aware capture and a WhatsApp-style
big/mini-PiP-swap layout for mobile, extended to an optional desktop
"theater mode."

## Scope

All three video surfaces are in scope:
1. Live interview (`voice-interface.tsx`) — Simli, Vidu, static avatar, and
   voice-only (Zoom-style) modes.
2. Onboarding camera check (`interviewee-onboarding.tsx` → `CameraCheck`).
3. Results/playback page (`interview-results.tsx`).

## Section 1: Orientation & Capture

- New hook `src/hooks/use-orientation.ts`, mirroring `useIsMobile`: reports
  `portrait: boolean` from `window.innerWidth < window.innerHeight`, updates
  on `resize`/`orientationchange`. Consumers needing a locked value (capture
  constraints) read it once at mount/session-start rather than subscribing.
- New helper `src/lib/video-constraints.ts`:
  ```ts
  function getVideoConstraints(portrait: boolean): MediaTrackConstraints {
    return portrait
      ? { width: { ideal: 480 }, height: { ideal: 854 }, aspectRatio: { ideal: 9/16 } }
      : { width: { ideal: 640 }, height: { ideal: 480 }, aspectRatio: { ideal: 4/3 } };
  }
  ```
- Replaces hardcoded `640x480` constraints in `use-interview-recording.ts`,
  `voice-interface.tsx`'s `getUserMedia` call, and `CameraCheck`. Each call
  site snapshots `portrait` once at its own mount/start — no shared global
  lock state.
- **Mid-session rotation:** detected but not reflowed. Show a one-time,
  non-blocking toast ("Rotating your device may affect recording quality —
  keep it steady") per session; capture/layout remain locked to the
  orientation detected at start.

## Section 2: Swap Primitive (Live Interview)

- Extend the existing `DraggablePip` component (`voice-interface.tsx`) with
  an `onTap` callback, disambiguated from drag via a small pointer-movement
  threshold (<5px between pointerdown/pointerup = tap).
- New local state: `const [swapped, setSwapped] = useState(false)`.
  - `false` (default): AI avatar/tile is **big**; candidate camera is the
    **mini** `DraggablePip`.
  - `true`: candidate camera is **big**; AI avatar tile becomes **mini**.
  - Tapping the mini PiP toggles `swapped`.
- **No remounting.** Simli/Vidu avatar panels are persistent WebRTC-bound
  DOM nodes that must never be unmounted mid-session. Swapping is pure
  CSS resize/reposition: both containers always render at the same DOM
  depth; a wrapper computes `bigStyle`/`miniStyle` position/size objects
  based on `swapped` and assigns them via `style` — reusing the existing
  teleport-style pattern already used for the Simli panel (`avatarStyle`,
  ~line 2580 in `voice-interface.tsx`).
- Applies to Simli, Vidu, and static avatar modes. Voice-only mode
  (`avatarMode === "none"`, `useZoomLayout`) has no avatar to show big —
  candidate camera is full-stage, no PiP/swap control rendered.
- **Mobile vs desktop:** on mobile (`useIsMobile`), this is the only live
  layout, replacing today's fixed `aspect-video` Zoom tiles. On desktop,
  the same component is what "theater mode" (Section 5) toggles into;
  default desktop behavior (today's side-by-side tiles) is unchanged.

## Section 3: Onboarding Camera Check

- `CameraCheck` snapshots `useOrientation()` once at mount and requests
  `getVideoConstraints(portrait)`.
- Preview `<video>` container drops the fixed `aspect-video` box in favor
  of sizing from the live track's actual `getSettings()` aspect ratio (or
  CSS `aspect-ratio: auto` with `object-fit: contain` instead of `cover`),
  so a portrait camera shows full-frame, uncropped.
- No PiP/swap — single feed only.

## Section 4: Playback (Results Page)

- **Default case** (no separate AI video track): on `loadedmetadata`, read
  the recorded video's native `videoWidth`/`videoHeight` and size the
  player container to that ratio (portrait → tall/narrow, landscape →
  wide), replacing fixed `aspect-video` + `object-cover`.
- **Pregenerated/non-interactive interviews** (AI question video + candidate
  response video both exist as separate files): reuse the Section 2 swap
  interaction — AI question video big by default, candidate response as
  tappable mini PiP. Since both are pre-recorded (no WebRTC persistence
  constraint), the swap here is simpler: conditional CSS classes swapping
  which `<video>` is big vs. mini, no teleport-style DOM trick required.

## Section 5: Desktop Theater Mode Toggle

- New icon button in the existing control bar (alongside mic/camera
  toggles), visible only when `!isMobile`, labeled "Theater mode."
- `useState` toggle, local to `VoiceInterface`, resets to off on every new
  session (no persistence).
- Off (default): today's unchanged Zoom-style side-by-side tiles.
- On: switches to the same big/mini swap component from Section 2, sized
  for desktop viewport dimensions instead of a phone screen.

## Testing

- Unit tests for `getVideoConstraints` (portrait vs landscape branches).
- Unit tests for `use-orientation` hook behavior (mount value, resize
  update, no thrash).
- Component-level tests for the tap-vs-drag disambiguation logic in
  `DraggablePip`.
- Manual/E2E verification: mobile portrait live session (swap gesture,
  recording constraints), desktop theater-mode toggle, onboarding camera
  check on a portrait viewport, playback of a portrait-recorded video and
  of a pregenerated-interview swap.

## Out of Scope

- Persisting theater-mode preference across sessions.
- Live mid-session orientation reflow (locked at start per product
  decision).
- Any change to non-pregenerated interview playback beyond aspect-ratio
  cropping fix (no second video track exists to swap with).
