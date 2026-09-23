/**
 * Client helpers to mark a session COMPLETED unconditionally.
 * Recording / transcript / speech must never gate these calls.
 *
 * Prefer `/api/session/complete` over tRPC for unload beacons:
 * sendBeacon is restricted to CORS-safelisted Content-Types (text/plain works).
 */

export function completeSessionBeacon(sessionId: string): void {
  if (!sessionId || typeof window === "undefined") return;
  const payload = JSON.stringify({ sessionId });
  try {
    navigator.sendBeacon(
      "/api/session/complete",
      new Blob([payload], { type: "text/plain;charset=UTF-8" }),
    );
  } catch {
    /* ignore */
  }
  try {
    void fetch("/api/session/complete", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: payload,
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

/** Awaitable completion for End button / auto-end. Idempotent server-side. */
export async function completeSessionNow(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const res = await fetch("/api/session/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      keepalive: true,
    });
    return res.ok;
  } catch (err) {
    console.error("[session-complete] failed:", err);
    // Last-ditch beacon so unload / next tick may still land
    completeSessionBeacon(sessionId);
    return false;
  }
}
