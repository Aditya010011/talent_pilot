import { useEffect, useState } from "react";

/** Same breakpoint used by `useIsMobile` — kept in sync so "portrait" only
 * ever applies on mobile-sized viewports, never on desktop. */
const MOBILE_BREAKPOINT = 768;

/** Pure predicate — extracted so it's testable without a DOM environment. */
export function isPortrait(width: number, height: number): boolean {
  return height > width;
}

/** Pure predicate for the mobile-viewport check — testable without a DOM. */
export function isMobileWidth(width: number, breakpoint = MOBILE_BREAKPOINT): boolean {
  return width < breakpoint;
}

/**
 * Reports whether the viewport is currently in portrait orientation.
 * Portrait capture/layout is a mobile-only concept — desktop views always
 * default to landscape, even if a desktop window happens to be taller than
 * it is wide, so `portrait` is gated on the viewport also being mobile-sized.
 * Updates on resize/orientationchange. Consumers that need a value locked
 * for the duration of a capture session (e.g. getUserMedia constraints)
 * should snapshot `portrait` once at mount/session-start rather than
 * reacting to later changes.
 */
export function useOrientation() {
  const computePortrait = () =>
    typeof window === "undefined"
      ? false
      : isMobileWidth(window.innerWidth) &&
        isPortrait(window.innerWidth, window.innerHeight);

  const [portrait, setPortrait] = useState(computePortrait);

  useEffect(() => {
    const handler = () => setPortrait(computePortrait());
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
