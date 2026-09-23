"use client";

/**
 * useHeygenAvatar — LiveAvatar LITE Mode hook
 *
 * In LITE Mode, LiveAvatar renders avatar video driven by AUDIO INPUT.
 * We feed our Google TTS PCM chunks directly via session.repeatAudio(base64).
 *
 * Audio format required: PCM 16-bit signed, 24kHz, mono → Base64 encoded.
 * Our relay sends Float32 PCM at 24kHz, so we convert Float32 → Int16 here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveAvatarSession,
  AgentEventsEnum,
  SessionEvent,
  type SessionState,
} from "@heygen/liveavatar-web-sdk";
import { createLogger } from "@/lib/logger";

const log = createLogger("heygen-avatar");

export type AvatarStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "speaking"
  | "listening"
  | "error"
  | "disconnected";

export interface UseHeygenAvatarOptions {
  enabled: boolean;
  onStatusChange?: (status: AvatarStatus) => void;
}

export interface UseHeygenAvatarReturn {
  status: AvatarStatus;
  /** Attach to a <video> element — SDK will bind the WebRTC stream to it */
  videoRef: React.RefObject<HTMLVideoElement>;
  /**
   * Feed a Float32 PCM chunk (from Google TTS via onTtsChunk) into the avatar.
   * Converts Float32 → Int16 → Base64 and calls session.repeatAudio().
   * Call this on every onTtsChunk event for real-time lip-sync.
   */
  sendAudio: (float32Buffer: ArrayBuffer) => void;
  /** Show listening pose while user is speaking */
  setListening: () => void;
  /** Stop listening pose */
  stopListening: () => void;
  /** Interrupt avatar mid-speech */
  interrupt: () => void;
  disconnect: () => void;
  error: string | null;
}

export function useHeygenAvatar({
  enabled,
  onStatusChange,
}: UseHeygenAvatarOptions): UseHeygenAvatarReturn {
  const [status, setStatus] = useState<AvatarStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef<AvatarStatus>("idle");

  const updateStatus = useCallback(
    (next: AvatarStatus) => {
      if (!mountedRef.current) return;
      setStatus(next);
      statusRef.current = next;
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  // ── Initialize session ────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let keepaliveId: NodeJS.Timeout | null = null;

    async function init() {
      updateStatus("connecting");
      log.info("Fetching LiveAvatar session token...");

      try {
        const res = await fetch("/api/heygen/token", { method: "POST" });
        if (!res.ok) {
          const body = await res.json() as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const { sessionToken } = await res.json() as { sessionToken: string };

        if (cancelled) return;
        log.info("Token received, starting LITE Mode session...");

        const session = new LiveAvatarSession(sessionToken, {
          voiceChat: false,
        });

        sessionRef.current = session;

        // Wire events before start()
        session.on(SessionEvent.SESSION_STREAM_READY, () => {
          if (cancelled) return;
          log.info("LiveAvatar stream ready ✅ — attaching to video element");
          if (videoRef.current) {
            session.attach(videoRef.current);
          }
          updateStatus("ready");
        });

        session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
          log.info(`Session state → ${state}`);
        });

        session.on(SessionEvent.SESSION_DISCONNECTED, () => {
          if (!mountedRef.current) return;
          log.info("LiveAvatar session disconnected");
          updateStatus("disconnected");
        });

        session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
          updateStatus("speaking");
        });

        session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
          updateStatus("ready");
        });

        await session.start();
        if (cancelled) { await session.stop(); return; }

        keepaliveId = setInterval(() => {
          if (sessionRef.current && statusRef.current !== "disconnected" && statusRef.current !== "error" && statusRef.current !== "idle") {
            try {
              // Create an empty silent Int16 array buffer and send via repeatAudio
              const emptyBase64 = Buffer.from(new Int16Array(960).buffer).toString('base64');
              sessionRef.current.repeatAudio(emptyBase64);
            } catch (e) { /* ignore */ }
          }
        }, 5000);

      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.error("Failed to start LiveAvatar session:", msg);
        setError(msg);
        updateStatus("error");
      }
    }

    void init();
    return () => { 
      cancelled = true; 
      if (keepaliveId) clearInterval(keepaliveId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, updateStatus]);

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.stop().catch(() => {});
      sessionRef.current = null;
    };
  }, []);

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Feed Float32 PCM audio from Google TTS into the avatar for lip-sync.
   *
   * LITE Mode requires: PCM 16-bit signed 24kHz, Base64-encoded.
   * We receive Float32 at 24kHz → convert → Base64 → repeatAudio().
   */
  const sendAudio = useCallback((float32Buffer: ArrayBuffer) => {
    const session = sessionRef.current;
    if (!session) return;

    // Convert Float32 → Int16 PCM (LiveAvatar expects 16-bit signed)
    const float32 = new Float32Array(float32Buffer);
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    }

    // Base64 encode the raw bytes
    const bytes = new Uint8Array(int16.buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    try {
      session.repeatAudio(base64);
    } catch (err) {
      log.warn("repeatAudio() error:", err);
    }
  }, []);

  const setListening = useCallback(() => {
    try { sessionRef.current?.startListening(); updateStatus("listening"); }
    catch { /* not connected yet */ }
  }, [updateStatus]);

  const stopListening = useCallback(() => {
    try { sessionRef.current?.stopListening(); updateStatus("ready"); }
    catch { /* ignore */ }
  }, [updateStatus]);

  const interrupt = useCallback(() => {
    try { sessionRef.current?.interrupt(); updateStatus("ready"); }
    catch { /* ignore */ }
  }, [updateStatus]);

  const disconnect = useCallback(() => {
    sessionRef.current?.stop().catch(() => {});
    sessionRef.current = null;
    updateStatus("disconnected");
  }, [updateStatus]);

  return { status, videoRef, sendAudio, setListening, stopListening, interrupt, disconnect, error };
}
