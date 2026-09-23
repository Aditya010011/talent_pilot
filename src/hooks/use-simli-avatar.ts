"use client";

/**
 * useSimliAvatar — Simli real-time lip-sync avatar
 *
 * Audio and video both come from Simli's LiveKit stream. Google TTS PCM is
 * fed into Simli; the browser does NOT play that TTS separately.
 *
 * Simli's LiveKit transport disconnects the room WITHOUT emitting `stop` or
 * `error`, which used to leave a black panel stuck on "Ready". We watch the
 * video track and recreate SimliClient (it is not reusable across reconnects).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { SimliClient, LogLevel } from "simli-client";
import { convertFloat32_24k_to_int16_16k } from "@/lib/simli-pcm";
import {
  canApplySilentReady,
  isSimliVideoHealthy,
  nextSimliReconnectDelayMs,
  shouldReconnectAfterUnhealthyPolls,
  SIMLI_MAX_RECONNECT_ATTEMPTS,
} from "@/lib/simli-session";
import { createLogger } from "@/lib/logger";

const log = createLogger("simli-avatar");

/** ~100 ms at 16 kHz if listenToMediastreamTrack is used. */
const SIMLI_AUDIO_BUFFER_SIZE = 1600;
const MEDIA_POLL_MS = 1000;
const ELEMENT_WAIT_MS = 4000;

export type AvatarStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "speaking"
  | "listening"
  | "error"
  | "disconnected";

export interface UseSimliAvatarOptions {
  enabled: boolean;
  /** Override env face id when an interview stores a Simli face. */
  faceId?: string | null;
  onStatusChange?: (status: AvatarStatus) => void;
}

export interface UseSimliAvatarReturn {
  status: AvatarStatus;
  /** True when LiveKit still has a playable video track. */
  mediaLive: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  audioRef: React.RefObject<HTMLAudioElement>;
  sendAudio: (float32Buffer: ArrayBuffer) => void;
  setListening: () => void;
  stopListening: () => void;
  interrupt: () => void;
  disconnect: () => void;
  error: string | null;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useSimliAvatar({
  enabled,
  faceId,
  onStatusChange,
}: UseSimliAvatarOptions): UseSimliAvatarReturn {
  const [status, setStatus] = useState<AvatarStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mediaLive, setMediaLive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SimliClient | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef<AvatarStatus>("idle");
  const playImmediateRef = useRef(true);
  const userDisconnectedRef = useRef(false);
  const connectingRef = useRef(false);
  const reconnectScheduledRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const sawHealthyRef = useRef(false);
  const sessionEpochRef = useRef(0);
  const faceIdRef = useRef(faceId);
  faceIdRef.current = faceId;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const updateStatus = useCallback((next: AvatarStatus) => {
    if (!mountedRef.current) return;
    statusRef.current = next;
    setStatus(next);
    onStatusChangeRef.current?.(next);
  }, []);

  const playSimliMedia = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.muted = true;
      video.volume = 0;
      void video.play().catch(() => {});
    }
    if (audio) {
      audio.muted = false;
      audio.volume = 1;
      void audio.play().catch(() => {});
    }
  }, []);

  const stopClient = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    if (!client) return;
    try {
      await client.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const connectSessionRef = useRef<(epoch: number) => Promise<void>>(async () => {});
  const scheduleReconnectRef = useRef<(reason: string) => void>(() => {});

  scheduleReconnectRef.current = (reason: string) => {
    if (!mountedRef.current || userDisconnectedRef.current) return;
    if (connectingRef.current || reconnectScheduledRef.current) return;
    if (reconnectAttemptRef.current >= SIMLI_MAX_RECONNECT_ATTEMPTS) {
      log.error("Simli reconnect exhausted:", reason);
      setError("Avatar connection lost");
      updateStatus("error");
      return;
    }
    reconnectAttemptRef.current += 1;
    reconnectScheduledRef.current = true;
    const delay = nextSimliReconnectDelayMs(reconnectAttemptRef.current);
    log.warn(
      `Simli reconnect ${reconnectAttemptRef.current}/${SIMLI_MAX_RECONNECT_ATTEMPTS} in ${delay}ms (${reason})`,
    );
    updateStatus("connecting");
    setMediaLive(false);
    const epoch = ++sessionEpochRef.current;
    window.setTimeout(() => {
      reconnectScheduledRef.current = false;
      if (epoch !== sessionEpochRef.current || !mountedRef.current) return;
      void connectSessionRef.current(epoch);
    }, delay);
  };

  connectSessionRef.current = async (epoch: number) => {
    if (!mountedRef.current || userDisconnectedRef.current) return;
    if (connectingRef.current) return;
    connectingRef.current = true;
    updateStatus("connecting");
    setError(null);
    setMediaLive(false);

    const deadline = Date.now() + ELEMENT_WAIT_MS;
    while (Date.now() < deadline && (!videoRef.current || !audioRef.current)) {
      await wait(50);
    }

    if (epoch !== sessionEpochRef.current || !mountedRef.current) {
      connectingRef.current = false;
      return;
    }

    try {
      if (!videoRef.current || !audioRef.current) {
        throw new Error("Video/audio elements not mounted yet");
      }

      log.info("Fetching Simli session token...");
      const requestedFaceId = faceIdRef.current;
      const res = await fetch("/api/simli/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestedFaceId ? { faceId: requestedFaceId } : {}),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { sessionToken } = (await res.json()) as { sessionToken: string };

      if (epoch !== sessionEpochRef.current || !mountedRef.current) {
        connectingRef.current = false;
        return;
      }

      await stopClient();

      if (!videoRef.current || !audioRef.current) {
        throw new Error("Video/audio elements not mounted yet");
      }

      log.info("Token received, initializing SimliClient...");
      const client = new SimliClient(
        sessionToken,
        videoRef.current,
        audioRef.current,
        null,
        LogLevel.INFO,
        "livekit",
        "websockets",
        "wss://api.simli.ai",
        SIMLI_AUDIO_BUFFER_SIZE,
      );

      clientRef.current = client;
      playImmediateRef.current = true;

      client.on("start", () => {
        if (epoch !== sessionEpochRef.current || !mountedRef.current) return;
        playSimliMedia();
        reconnectAttemptRef.current = 0;
        sawHealthyRef.current = true;
        setMediaLive(true);
        log.info("Simli avatar ready — audio+video from Simli LiveKit stream");
        updateStatus("ready");
      });

      client.on("speaking", () => {
        if (epoch !== sessionEpochRef.current) return;
        updateStatus("speaking");
        playSimliMedia();
      });
      client.on("silent", () => {
        if (epoch !== sessionEpochRef.current) return;
        playImmediateRef.current = true;
        if (
          statusRef.current !== "listening" &&
          canApplySilentReady(statusRef.current)
        ) {
          updateStatus("ready");
        }
      });

      client.on("stop", () => {
        if (epoch !== sessionEpochRef.current || !mountedRef.current) return;
        log.info("Simli session stopped");
        setMediaLive(false);
        if (userDisconnectedRef.current) {
          updateStatus("disconnected");
          return;
        }
        scheduleReconnectRef.current("simli stop");
      });

      client.on("error", (msg: string) => {
        if (epoch !== sessionEpochRef.current || !mountedRef.current) return;
        log.error("Simli error:", msg);
        setError(msg);
        setMediaLive(false);
        updateStatus("error");
      });

      client.on("startup_error", (msg: string) => {
        if (epoch !== sessionEpochRef.current || !mountedRef.current) return;
        log.error("Simli startup error:", msg);
        setError(msg);
        setMediaLive(false);
        updateStatus("error");
      });

      await client.start();
      if (epoch !== sessionEpochRef.current) {
        await client.stop().catch(() => {});
        connectingRef.current = false;
        return;
      }
      connectingRef.current = false;
    } catch (err) {
      connectingRef.current = false;
      if (epoch !== sessionEpochRef.current || !mountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      log.error("Failed to start Simli session:", msg);
      setError(msg);
      setMediaLive(false);
      updateStatus("error");
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      userDisconnectedRef.current = true;
      sessionEpochRef.current += 1;
      reconnectScheduledRef.current = false;
      void stopClient();
      setMediaLive(false);
      updateStatus("idle");
      return;
    }

    userDisconnectedRef.current = false;
    reconnectAttemptRef.current = 0;
    reconnectScheduledRef.current = false;
    sawHealthyRef.current = false;
    const epoch = ++sessionEpochRef.current;
    void connectSessionRef.current(epoch);

    let unhealthyPolls = 0;
    const pollId = window.setInterval(() => {
      if (!mountedRef.current || userDisconnectedRef.current) return;
      if (connectingRef.current || reconnectScheduledRef.current) return;
      const current = statusRef.current;
      if (current === "idle" || current === "disconnected" || current === "connecting") {
        return;
      }

      const healthy = isSimliVideoHealthy(videoRef.current);
      setMediaLive(healthy);
      if (healthy) {
        unhealthyPolls = 0;
        sawHealthyRef.current = true;
        reconnectAttemptRef.current = 0;
        return;
      }

      if (current === "error" && reconnectAttemptRef.current >= SIMLI_MAX_RECONNECT_ATTEMPTS) {
        return;
      }

      unhealthyPolls += 1;
      const lostTrack =
        sawHealthyRef.current && shouldReconnectAfterUnhealthyPolls(unhealthyPolls);
      const failedStart = current === "error";
      if (lostTrack || failedStart) {
        unhealthyPolls = 0;
        void stopClient();
        scheduleReconnectRef.current(failedStart ? "simli error" : "video track lost");
      }
    }, MEDIA_POLL_MS);

    const keepaliveId = window.setInterval(() => {
      if (!clientRef.current || connectingRef.current || userDisconnectedRef.current) return;
      const current = statusRef.current;
      if (current === "idle" || current === "disconnected" || current === "error") return;
      try {
        clientRef.current.sendAudioData(new Uint8Array(960));
      } catch (err) {
        log.warn("Simli keepalive failed:", err);
        scheduleReconnectRef.current("keepalive send failed");
      }
    }, 5000);

    return () => {
      window.clearInterval(pollId);
      window.clearInterval(keepaliveId);
      sessionEpochRef.current += 1;
      connectingRef.current = false;
      reconnectScheduledRef.current = false;
      void stopClient();
    };
  }, [enabled, faceId, stopClient, updateStatus]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      userDisconnectedRef.current = true;
    };
  }, []);

  const sendAudio = useCallback((float32Buffer: ArrayBuffer) => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const pcm16_16k = convertFloat32_24k_to_int16_16k(float32Buffer);
      if (pcm16_16k.byteLength === 0) return;
      if (playImmediateRef.current) {
        client.sendAudioDataImmediate(pcm16_16k);
        playImmediateRef.current = false;
      } else {
        client.sendAudioData(pcm16_16k);
      }
    } catch (err) {
      log.warn("sendAudioData error:", err);
      scheduleReconnectRef.current("sendAudio failed");
    }
  }, []);

  const setListening = useCallback(() => {
    const current = statusRef.current;
    if (current === "error" || current === "disconnected" || current === "idle" || current === "connecting") {
      return;
    }
    updateStatus("listening");
  }, [updateStatus]);

  const stopListening = useCallback(() => {
    if (statusRef.current !== "listening") return;
    updateStatus("ready");
  }, [updateStatus]);

  const interrupt = useCallback(() => {
    try {
      clientRef.current?.ClearBuffer();
      playImmediateRef.current = true;
      if (canApplySilentReady(statusRef.current)) updateStatus("ready");
    } catch {
      /* ignore */
    }
  }, [updateStatus]);

  const disconnect = useCallback(() => {
    userDisconnectedRef.current = true;
    sessionEpochRef.current += 1;
    connectingRef.current = false;
    reconnectScheduledRef.current = false;
    void stopClient();
    playImmediateRef.current = true;
    setMediaLive(false);
    updateStatus("disconnected");
  }, [stopClient, updateStatus]);

  return {
    status,
    mediaLive,
    videoRef,
    audioRef,
    sendAudio,
    setListening,
    stopListening,
    interrupt,
    disconnect,
    error,
  };
}
