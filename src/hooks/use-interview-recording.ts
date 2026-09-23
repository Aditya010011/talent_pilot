"use client";

import { createLogger } from "@/lib/logger";
import {
    getStoredCameraStream,
    getStoredScreenStream,
    setStoredCameraStream,
    setStoredScreenStream,
    wasScreenSkipped,
} from "@/lib/media-stream-store";
import { getVideoConstraints } from "@/lib/video-constraints";
import { useCallback, useEffect, useRef, useState } from "react";

const log = createLogger("recording");

type RecordRTCInstance = {
  startRecording: () => void;
  stopRecording: (callback: () => void) => void;
  getBlob: () => Blob;
};

type RecordRTCConstructor = new (
  stream: MediaStream,
  options: Record<string, unknown>,
) => RecordRTCInstance;

let recordRTCConstructorPromise: Promise<RecordRTCConstructor> | null = null;

async function loadRecordRTC(): Promise<RecordRTCConstructor> {
  if (typeof window === "undefined") {
    throw new Error("RecordRTC can only be loaded in the browser");
  }
  if (!recordRTCConstructorPromise) {
    recordRTCConstructorPromise = import("recordrtc").then((mod) => {
      const maybeCtor = (mod.default ?? mod) as unknown;
      if (typeof maybeCtor !== "function") {
        throw new Error("RecordRTC module did not export a constructor");
      }
      return maybeCtor as RecordRTCConstructor;
    });
  }
  return recordRTCConstructorPromise;
}

export interface ScreenshotEntry {
  url: string;
  path: string;
  timestamp: string;
  type: "camera" | "screen";
}

interface UseInterviewRecordingOptions {
  sessionId: string;
  enabled: boolean;
  screenshotIntervalMs?: number;
  shouldTakeScreenshots?: boolean;
  /**
   * @deprecated Recordings now upload directly to local disk on this VM via
   * /api/session/upload (see src/lib/local-media-storage.ts). This option is
   * ignored but kept so existing callers that still pass it don't break.
   */
  getUploadUrl?: (bucket: "recordings" | "videos" | "screenshots", path: string) => Promise<{ signedUrl: string; token: string; path: string }>;
}

/**
 * Resolve the actual playable duration of a WebM audio blob.
 * WebM files from MediaRecorder often have Infinity/missing duration;
 * the seek-to-end trick forces the browser to compute it.
 */
function resolveBlobDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; cleanup(); resolve(undefined); }
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    }

    function finish(dur: number) {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(Math.round(dur));
    }

    audio.addEventListener("durationchange", () => {
      if (audio.duration && isFinite(audio.duration)) {
        finish(audio.duration);
      }
    });

    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration && isFinite(audio.duration)) {
        finish(audio.duration);
      } else {
        audio.currentTime = 1e10;
      }
    });

    audio.preload = "auto";
    audio.src = url;
  });
}

/**
 * Manages audio recording (combined mic + TTS), camera/screen streams,
 * and periodic screenshot capture during a voice interview.
 *
 * Recording strategy:
 *   - Uses RecordRTC for high-reliability audio/video capture.
 *   - Mixes microphone and AI voice into a single audio destination.
 *   - Unified Mode: Injects the mixed audio track into the camera stream
 *     to produce a single, perfectly synced video file.
 *   - Direct Upload: Bypasses API size limits by uploading directly to storage via signed URLs.
 */
export function useInterviewRecording({
  sessionId,
  enabled,
  screenshotIntervalMs = 60_000,
  shouldTakeScreenshots = false,
}: UseInterviewRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Refs for recording infrastructure
  const recorderRef = useRef<RecordRTCInstance | null>(null);
  const mixCtxRef = useRef<AudioContext | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const aiMediaSourceRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null);
  /** Element currently feeding AI audio into the mixer (captureStream or MES). */
  const aiMediaElRef = useRef<HTMLMediaElement | null>(null);
  /** currentSrc we last successfully attached — re-attach when the clip URL changes. */
  const aiMediaSrcRef = useRef<string | null>(null);
  /** Last element passed to attachAiMediaElement — retried once the mixer is ready. */
  const pendingAiMediaElRef = useRef<HTMLMediaElement | null>(null);
  /** Weak map so we never call createMediaElementSource twice on the same element. */
  const mediaElementSourceMapRef = useRef<WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>>(
    new WeakMap(),
  );
  const aiAttachRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiAttachRetryCountRef = useRef(0);
  const ownedMicStreamRef = useRef<MediaStream | null>(null);
  const screenshotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenshotsRef = useRef<ScreenshotEntry[]>([]);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);
  const isRecordingRef = useRef(false);
  const ttsPlayTimeRef = useRef(0);
  const ttsSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  /** Cloned camera stream used only by RecordRTC — safe to stop independently of the live preview. */
  const recordingCloneRef = useRef<MediaStream | null>(null);

  // Refs for video recording (camera stream)
  const videoRecorderRef = useRef<RecordRTCInstance | null>(null);
  const videoStartTimeRef = useRef<number>(0);

  // Refs for per-question clip recording
  const clipRecorderRef = useRef<RecordRTCInstance | null>(null);
  const clipQuestionIdRef = useRef<string | null>(null);
  const clipStartTimeRef = useRef<number>(0);
  /** Cloned tracks backing the active clip recorder — stopped independently on clip finish. */
  const clipStreamRef = useRef<MediaStream | null>(null);
  const videoClipsAccRef = useRef<{ questionId: string; clipUrl: string; durationSec: number }[]>([]);

  // Keep refs in sync with state
  useEffect(() => { cameraStreamRef.current = cameraStream; }, [cameraStream]);
  useEffect(() => { screenStreamRef.current = screenStream; }, [screenStream]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  /**
   * Upload a recording/clip/screenshot to local disk on this VM via
   * /api/session/upload (see src/lib/local-media-storage.ts), with retries
   * for transient failures. Returns the same-origin URL the DB should store.
   */
  const uploadFileDirect = useCallback(async (blob: Blob, bucket: "recordings" | "videos" | "screenshots", filename: string) => {
    const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
    log.info("Upload starting", {
      sessionId,
      bucket,
      filename,
      bytes: blob.size,
      sizeMb,
      contentType: blob.type || "application/octet-stream",
    });

    const type = bucket === "recordings" ? "recording" : bucket === "videos" ? "video" : "screenshot";
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const form = new FormData();
        form.append("file", blob, filename);
        form.append("sessionId", sessionId);
        form.append("type", type);
        form.append("filename", filename);

        const res = await fetch("/api/session/upload", { method: "POST", body: form });

        if (!res.ok) {
          const err = await res.text().catch(() => "");
          // 413 = body too large for gateway — retrying will not help.
          if (res.status === 413) {
            throw new Error(`Direct upload failed: 413 Payload Too Large (${sizeMb} MB)`);
          }
          throw new Error(`Direct upload failed: ${res.status} ${res.statusText} ${err.slice(0, 200)}`);
        }
        const { url } = (await res.json()) as { url: string };
        log.info("Upload succeeded", {
          sessionId,
          bucket,
          filename,
          bytes: blob.size,
          contentType: blob.type || "application/octet-stream",
          url,
          attempt,
        });
        return url;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const fatal = /413|Payload Too Large/i.test(lastError.message);
        log.error("Upload attempt failed", {
          sessionId,
          bucket,
          filename,
          bytes: blob.size,
          attempt,
          maxAttempts,
          error: lastError.message,
        });
        if (fatal || attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    throw lastError ?? new Error("Direct upload failed");
  }, [sessionId]);

  /** Acquire camera and screen streams, reusing stored streams from onboarding. */
  const acquireStreams = useCallback(async () => {
    // Prefer an already-live preview/onboarding stream — never open a second
    // getUserMedia that can revoke the first track (black candidate tile).
    const existing =
      (cameraStreamRef.current?.active && cameraStreamRef.current) ||
      getStoredCameraStream();
    if (existing) {
      existing.getVideoTracks().forEach((t) => {
        t.enabled = true;
      });
      setCameraStream(existing);
      cameraStreamRef.current = existing;
      // Keep store populated so remounts / PiP can reuse the same track.
      setStoredCameraStream(existing);
    } else {
      // Always request — even if onboarding skipped (permission may still be granted).
      try {
        // Portrait capture is mobile-only — desktop always defaults to landscape.
        const portrait =
          typeof window !== "undefined" &&
          window.innerWidth < 768 &&
          window.innerHeight > window.innerWidth;
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", ...getVideoConstraints(portrait) },
          audio: false,
        });
        cam.getVideoTracks().forEach((t) => {
          t.enabled = true;
        });
        setCameraStream(cam);
        cameraStreamRef.current = cam;
        setStoredCameraStream(cam);
      } catch (err) {
        log.warn("Camera not available:", err);
      }
    }

    const storedScreen = getStoredScreenStream();
    if (storedScreen) {
      setScreenStream(storedScreen);
      screenStreamRef.current = storedScreen;
      setStoredScreenStream(null);
      storedScreen.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenStream(null);
        screenStreamRef.current = null;
      });
    } else if (!wasScreenSkipped()) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(screen);
        screenStreamRef.current = screen;
        screen.getVideoTracks()[0]?.addEventListener("ended", () => {
          setScreenStream(null);
          screenStreamRef.current = null;
        });
      } catch (err) {
        log.warn("Screen share not available:", err);
      }
    }
  }, []);

  /** Pipe a mic MediaStream into the recording mixer. */
  const attachMicStream = useCallback((micStream: MediaStream) => {
    const ctx = mixCtxRef.current;
    if (!ctx || !mixDestRef.current) {
      log.warn("attachMicStream skipped — mixer not ready", { sessionId });
      return;
    }
    try { micSourceRef.current?.disconnect(); } catch { /* noop */ }
    const source = ctx.createMediaStreamSource(micStream);
    source.connect(mixDestRef.current);
    micSourceRef.current = source;
    log.info("Mic attached to recording mixer", {
      sessionId,
      audioTracks: micStream.getAudioTracks().length,
      trackStates: micStream.getAudioTracks().map((t) => t.readyState),
    });
  }, [sessionId]);

  /**
   * Mix AI interviewer audio (pregenerated video / live avatar) into the
   * session recording.
   *
   * Prefer captureStream: keeps native element playback for the candidate
   * (no mute / no double-amplification). Cross-origin CDN MP4s without CORS
   * throw SecurityError from captureStream — never let that escape; soft-fail
   * and keep cam+mic recording + live playback working.
   *
   * Fall back to MediaElementSource only when captureStream is unavailable,
   * teeing to both the mix destination and ctx.destination so live hearing
   * still works. Never call createMediaElementSource twice on one element.
   *
   * This function must never throw.
   */
  const attachAiMediaElement = useCallback((el: HTMLMediaElement | null) => {
    try {
      if (aiAttachRetryTimerRef.current) {
        clearTimeout(aiAttachRetryTimerRef.current);
        aiAttachRetryTimerRef.current = null;
      }

      pendingAiMediaElRef.current = el;
      if (!el) {
        try { aiMediaSourceRef.current?.disconnect(); } catch { /* noop */ }
        aiMediaSourceRef.current = null;
        aiMediaElRef.current = null;
        aiMediaSrcRef.current = null;
        aiAttachRetryCountRef.current = 0;
        return;
      }

      const ctx = mixCtxRef.current;
      const dest = mixDestRef.current;
      if (!ctx || !dest) {
        log.info("attachAiMediaElement deferred — mixer not ready", { sessionId });
        return;
      }

      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }

      const elSrc = el.currentSrc || el.src || "";
      if (aiMediaSrcRef.current !== elSrc) {
        aiAttachRetryCountRef.current = 0;
      }
      // Already mixing this exact element+src — keep the live graph.
      // Also treat "CORS soft-skip" (el marked, no source) as settled so we
      // do not keep throwing on every play()/retry tick.
      if (
        aiMediaElRef.current === el &&
        aiMediaSrcRef.current === elSrc &&
        elSrc.length > 0 &&
        (aiMediaSourceRef.current || aiAttachRetryCountRef.current < 0)
      ) {
        return;
      }

      const mediaEl = el as HTMLMediaElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const hasCaptureApi =
        typeof mediaEl.captureStream === "function" ||
        typeof mediaEl.mozCaptureStream === "function";

      let capture: MediaStream | null = null;
      if (hasCaptureApi) {
        try {
          capture =
            typeof mediaEl.captureStream === "function"
              ? mediaEl.captureStream()
              : mediaEl.mozCaptureStream!();
        } catch (captureErr) {
          const msg =
            captureErr instanceof Error ? captureErr.message : String(captureErr);
          const isSecurity =
            (captureErr instanceof DOMException && captureErr.name === "SecurityError") ||
            /cross-origin|SecurityError/i.test(msg);
          // Mark settled for this src so retries / play hooks do not re-throw.
          aiMediaElRef.current = el;
          aiMediaSrcRef.current = elSrc;
          aiAttachRetryCountRef.current = -1;
          try { aiMediaSourceRef.current?.disconnect(); } catch { /* noop */ }
          aiMediaSourceRef.current = null;
          log.warn(
            isSecurity
              ? "AI media captureStream blocked (cross-origin) — recording without AI audio"
              : "AI media captureStream failed — recording without AI audio",
            {
              sessionId,
              error: msg,
              src: elSrc.slice(0, 160),
              readyState: el.readyState,
            },
          );
          return;
        }
      }

      if (capture && capture.getAudioTracks().length > 0) {
        try { aiMediaSourceRef.current?.disconnect(); } catch { /* noop */ }
        const source = ctx.createMediaStreamSource(capture);
        // Record only — element speakers stay native (no double AI audio).
        source.connect(dest);
        aiMediaSourceRef.current = source;
        aiMediaElRef.current = el;
        aiMediaSrcRef.current = elSrc;
        aiAttachRetryCountRef.current = 0;
        log.info("AI media captureStream attached", {
          sessionId,
          audioTracks: capture.getAudioTracks().length,
          muted: el.muted,
          readyState: el.readyState,
        });
        return;
      }

      if (hasCaptureApi) {
        // captureStream exists but audio tracks are not ready yet (src still
        // loading). Retry — do NOT fall through to createMediaElementSource on
        // cross-origin CDN clips (Vidu/Runware); that hijacks+silences playback.
        if (aiAttachRetryCountRef.current >= 40) {
          log.warn("AI media captureStream gave up waiting for audio tracks", {
            sessionId,
            readyState: el.readyState,
            muted: el.muted,
            src: elSrc.slice(0, 120),
          });
          // Settle so callers stop hammering attach.
          aiMediaElRef.current = el;
          aiMediaSrcRef.current = elSrc;
          aiAttachRetryCountRef.current = -1;
          return;
        }
        aiAttachRetryCountRef.current += 1;
        log.info("AI media captureStream pending audio tracks — retrying", {
          sessionId,
          attempt: aiAttachRetryCountRef.current,
          readyState: el.readyState,
          networkState: el.networkState,
          muted: el.muted,
        });
        aiAttachRetryTimerRef.current = setTimeout(() => {
          aiAttachRetryTimerRef.current = null;
          if (pendingAiMediaElRef.current === el) {
            // Force re-attempt even if we briefly attached something else.
            if (aiMediaElRef.current === el) {
              aiMediaElRef.current = null;
              aiMediaSrcRef.current = null;
            }
            attachAiMediaElement(el);
          }
        }, 250);
        return;
      }

      // No captureStream (rare / older browsers): MediaElementSource tee.
      try {
        try { aiMediaSourceRef.current?.disconnect(); } catch { /* noop */ }
        let source = mediaElementSourceMapRef.current.get(el);
        if (!source) {
          source = ctx.createMediaElementSource(el);
          mediaElementSourceMapRef.current.set(el, source);
        } else {
          try { source.disconnect(); } catch { /* noop */ }
        }
        source.connect(dest);
        // Keep audible playback for the candidate (MES replaces element output).
        source.connect(ctx.destination);
        aiMediaSourceRef.current = source;
        aiMediaElRef.current = el;
        aiMediaSrcRef.current = elSrc;
        aiAttachRetryCountRef.current = 0;
        log.info("AI media element source attached", { sessionId });
      } catch (err) {
        aiMediaElRef.current = el;
        aiMediaSrcRef.current = elSrc;
        aiAttachRetryCountRef.current = -1;
        log.warn("attachAiMediaElement MES failed — recording without AI audio", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } catch (err) {
      // Absolute last resort — never crash React / recording start.
      log.warn("attachAiMediaElement unexpected error (swallowed)", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [sessionId]);

  /** Feed a TTS PCM chunk into the recording mixer. */
  const addTtsChunk = useCallback((pcmData: ArrayBuffer) => {
    const ctx = mixCtxRef.current;
    const dest = mixDestRef.current;
    if (!ctx || !dest || pcmData.byteLength === 0) return;

    const float32 = new Float32Array(pcmData);
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);

    const startAt = Math.max(ctx.currentTime, ttsPlayTimeRef.current);
    source.start(startAt);
    ttsPlayTimeRef.current = startAt + audioBuffer.duration;
    ttsSourcesRef.current.push(source);
    source.onended = () => {
      ttsSourcesRef.current = ttsSourcesRef.current.filter((s) => s !== source);
    };
  }, []);

  /** Cancel all scheduled TTS sources. */
  const cancelTts = useCallback(() => {
    for (const source of ttsSourcesRef.current) {
      try { source.stop(); } catch { /* noop */ }
    }
    ttsSourcesRef.current = [];
    ttsPlayTimeRef.current = 0;
  }, []);

  /** Capture a screenshot and upload it. */
  const captureAndUpload = useCallback(
    async (video: HTMLVideoElement, type: "camera" | "screen") => {
      if (video.readyState < 2 || video.videoWidth === 0) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      if (type === "camera") {
        ctx2d.translate(canvas.width, 0);
        ctx2d.scale(-1, 1);
      }
      ctx2d.drawImage(video, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7),
      );
      if (!blob) return;

      const timestamp = new Date().toISOString();
      const filename = `${timestamp.replace(/[:.]/g, "-")}-${type}.jpg`;

      try {
        const path = await uploadFileDirect(blob, "screenshots", filename);
        screenshotsRef.current.push({
          url: "", // Resolved on server/results page
          path,
          timestamp,
          type,
        });
        log.info(`Screenshot uploaded: ${type}`);
      } catch (err) {
        log.error("Screenshot upload failed:", err);
      }
    },
    [uploadFileDirect],
  );

  /** Take screenshots from both camera and screen streams. */
  const takeScreenshots = useCallback(() => {
    if (cameraVideoRef.current && cameraStreamRef.current) {
      captureAndUpload(cameraVideoRef.current, "camera");
    }
    if (screenVideoRef.current && screenStreamRef.current) {
      captureAndUpload(screenVideoRef.current, "screen");
    }
  }, [captureAndUpload]);

  /** Start recording. */
  const start = useCallback(
    async (micStream?: MediaStream) => {
      if (!enabled) {
        log.warn("Recording start skipped — hook disabled", { sessionId });
        return;
      }
      if (isRecordingRef.current || recorderRef.current || videoRecorderRef.current) {
        log.info("Recording start skipped — already active", {
          sessionId,
          isRecording: isRecordingRef.current,
          hasAudioRecorder: !!recorderRef.current,
          hasVideoRecorder: !!videoRecorderRef.current,
        });
        if (micStream) attachMicStream(micStream);
        return;
      }
      stoppedRef.current = false;
      ttsPlayTimeRef.current = 0;
      // Mark recording active immediately so end-interview always persists media
      // even if acquireStreams / video recorder setup is still in flight.
      isRecordingRef.current = true;
      setIsRecording(true);

      try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        log.error("AudioContext not supported", { sessionId });
        isRecordingRef.current = false;
        setIsRecording(false);
        return;
      }
      
      const ctx = new AudioCtx();
      mixCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      mixDestRef.current = dest;
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch { /* autoplay policy — resume on gesture */ }
      }

      let resolvedMic = micStream;
      if (!resolvedMic || resolvedMic.getAudioTracks().length === 0) {
        try {
          resolvedMic = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          ownedMicStreamRef.current = resolvedMic;
          log.info("Acquired mic for session recording", { sessionId });
        } catch (err) {
          log.warn("Mic not available for recording; continuing cam/silence", {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
          resolvedMic = undefined;
        }
      }

      if (resolvedMic) attachMicStream(resolvedMic);

      // Flush any AI <video> that tried to attach before the mixer existed
      // (common race: first clip plays while getUserMedia mic is still opening).
      // Must not abort recording start if captureStream throws (cross-origin).
      if (pendingAiMediaElRef.current) {
        try {
          attachAiMediaElement(pendingAiMediaElRef.current);
        } catch (err) {
          log.warn("Pending AI media attach failed during start — continuing without AI audio", {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const RecordRTC = await loadRecordRTC();

      // Audio fallback uses native MediaRecorder (Opus) — StereoAudioRecorder
      // produces near-uncompressed blobs (~200MB+ for 20min) that hit nginx 413.
      const recorder = new RecordRTC(dest.stream, {
        type: "audio",
        mimeType: "audio/webm" as "audio/webm",
        numberOfAudioChannels: 1,
        desiredSampRate: 24000,
      });
      recorder.startRecording();
      recorderRef.current = recorder;
      log.info("Audio recorder started", {
        sessionId,
        inputMicTracks: resolvedMic?.getAudioTracks().length ?? 0,
        mixedAudioTracks: dest.stream.getAudioTracks().length,
      });

      await acquireStreams();

      // Prep hidden video elements for capture
      [cameraVideoRef, screenVideoRef].forEach((ref) => {
        if (!ref.current) {
          const v = document.createElement("video");
          v.muted = true; v.playsInline = true; v.style.display = "none";
          document.body.appendChild(v);
          ref.current = v;
        }
      });

      setTimeout(() => {
        if (cameraVideoRef.current && cameraStreamRef.current) {
          cameraVideoRef.current.srcObject = cameraStreamRef.current;
          cameraVideoRef.current.play().catch(() => {});
        }
        if (screenVideoRef.current && screenStreamRef.current) {
          screenVideoRef.current.srcObject = screenStreamRef.current;
          screenVideoRef.current.play().catch(() => {});
        }
      }, 500);

      if (shouldTakeScreenshots) {
        screenshotTimerRef.current = setInterval(takeScreenshots, screenshotIntervalMs);
      }

      // Unified Video Recording after streams settle — start ASAP (was 1500ms).
      setTimeout(() => {
        if (stoppedRef.current) return;
        const cam = cameraStreamRef.current;
        const mix = mixDestRef.current?.stream;

        if (cam && cam.getVideoTracks().length > 0 && cam.active) {
          try {
            // Clone so RecordRTC can own tracks without killing the live preview.
            const combined = new MediaStream();
            cam.getVideoTracks().forEach((t) => {
              // clone() keeps live frames even if the preview element remounts.
              combined.addTrack(t.clone());
            });
            recordingCloneRef.current = combined;
            if (mix && mix.getAudioTracks().length > 0) {
              combined.addTrack(mix.getAudioTracks()[0]);
            }

            // ~500kbps keeps a 20–25min 640x480 session under ~75–90MB,
            // safely below the nginx body limit (was 100MB; now 500MB).
            const vrecorder = new RecordRTC(combined, {
              type: "video",
              mimeType: "video/webm;codecs=vp8" as "video/webm;codecs=vp8",
              videoBitsPerSecond: 400_000,
              audioBitsPerSecond: 64_000,
              // Force the native browser MediaRecorder implementation instead
              // of RecordRTC's canvas-based WhammyRecorder ("recorderType: P"),
              // whose internal polling interval throws
              // "Cannot read properties of undefined (reading 'state')" on
              // long-running recordings and silently produces a 0-byte blob.
              recorderType: (RecordRTC as unknown as Record<string, unknown>).MediaStreamRecorder,
            });
            vrecorder.startRecording();
            videoRecorderRef.current = vrecorder;
            videoStartTimeRef.current = Date.now();
            log.info("Unified video recorder started", {
              sessionId,
              videoTracks: combined.getVideoTracks().length,
              audioTracks: combined.getAudioTracks().length,
              cameraActive: cam.active,
              videoTrackStates: combined.getVideoTracks().map((t) => ({
                readyState: t.readyState,
                muted: t.muted,
                enabled: t.enabled,
              })),
            });
          } catch (err) {
            log.warn("Failed to start video recording:", err);
          }
        } else {
          log.warn("Video recorder not started — camera unavailable", {
            sessionId,
            hasCam: !!cam,
            videoTracks: cam?.getVideoTracks().length ?? 0,
            camActive: cam?.active ?? false,
          });
        }
      }, 300);

      log.info("Recording started", { sessionId });
      } catch (err) {
        log.error("Recording start failed", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        isRecordingRef.current = false;
        setIsRecording(false);
        recorderRef.current = null;
        videoRecorderRef.current = null;
        try { mixCtxRef.current?.close(); } catch { /* noop */ }
        mixCtxRef.current = null;
        mixDestRef.current = null;
      }
    },
    [enabled, acquireStreams, attachMicStream, attachAiMediaElement, takeScreenshots, screenshotIntervalMs, shouldTakeScreenshots, sessionId],
  );

  /**
   * Start a per-question clip recorder from the current combined stream.
   * Safe to call multiple times — stops the previous clip first.
   */
  const startClip = useCallback((questionId: string) => {
    if (!isRecordingRef.current) {
      log.warn("startClip skipped — session recording not active", { sessionId, questionId });
      return;
    }
    // Stop any active clip first (shouldn't happen in normal flow, but guard it)
    if (clipRecorderRef.current) {
      log.warn("startClip: stopping previous clip before starting new one", { sessionId, questionId });
      try { clipRecorderRef.current.stopRecording(() => {}); } catch { /* noop */ }
      clipRecorderRef.current = null;
    }
    if (clipStreamRef.current) {
      clipStreamRef.current.getTracks().forEach((t) => t.stop());
      clipStreamRef.current = null;
    }

    const combined = recordingCloneRef.current;
    if (!combined || !combined.active) {
      log.warn("startClip skipped — no active recording stream", { sessionId, questionId });
      return;
    }

    loadRecordRTC().then((RecordRTC) => {
      try {
        // Clone tracks so this clip's MediaRecorder never shares live track
        // instances with the unified session recorder (or a prior clip) —
        // feeding the same track to multiple simultaneous MediaRecorders
        // can corrupt one recorder's internal state (empty/failed blobs).
        const clipStream = new MediaStream();
        combined.getTracks().forEach((t) => clipStream.addTrack(t.clone()));
        clipStreamRef.current = clipStream;
        const rec = new RecordRTC(clipStream, {
          type: "video",
          mimeType: "video/webm;codecs=vp8" as "video/webm;codecs=vp8",
          videoBitsPerSecond: 400_000,
          audioBitsPerSecond: 64_000,
          // Same fix as the unified session recorder: avoid RecordRTC's
          // buggy canvas-based WhammyRecorder ("recorderType: P").
          recorderType: (RecordRTC as unknown as Record<string, unknown>)
            .MediaStreamRecorder,
        });
        rec.startRecording();
        clipRecorderRef.current = rec;
        clipQuestionIdRef.current = questionId;
        clipStartTimeRef.current = Date.now();
        log.info("Clip recorder started", { sessionId, questionId });
      } catch (err) {
        log.warn("startClip RecordRTC init failed", { sessionId, questionId, error: err instanceof Error ? err.message : String(err) });
      }
    }).catch((err) => {
      log.warn("startClip: RecordRTC load failed", { sessionId, error: err instanceof Error ? err.message : String(err) });
    });
  }, [sessionId]);

  /**
   * Stop the current clip recorder, upload it, and accumulate the result.
   * Resolves to clip metadata or null if the clip was too short / empty.
   */
  const stopAndUploadClip = useCallback(async (): Promise<{ questionId: string; clipUrl: string; durationSec: number } | null> => {
    const rec = clipRecorderRef.current;
    const questionId = clipQuestionIdRef.current;
    if (!rec || !questionId) return null;

    clipRecorderRef.current = null;
    clipQuestionIdRef.current = null;
    const durationSec = Math.round((Date.now() - clipStartTimeRef.current) / 1000);

    await new Promise<void>((res) => rec.stopRecording(() => res()));
    const blob = rec.getBlob();

    // Release this clip's cloned tracks now that recording has stopped.
    if (clipStreamRef.current) {
      clipStreamRef.current.getTracks().forEach((t) => t.stop());
      clipStreamRef.current = null;
    }

    if (blob.size < 1024 || durationSec < 2) {
      log.warn("Clip discarded (too short/empty)", { sessionId, questionId, bytes: blob.size, durationSec });
      return null;
    }

    try {
      const filename = `clip-${questionId}-${Date.now()}.webm`;
      const clipUrl = await uploadFileDirect(blob, "videos", filename);
      const entry = { questionId, clipUrl, durationSec };
      videoClipsAccRef.current.push(entry);
      log.info("Clip uploaded", { sessionId, questionId, bytes: blob.size, durationSec, clipUrl });
      return entry;
    } catch (err) {
      log.error("Clip upload failed", { sessionId, questionId, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, [sessionId, uploadFileDirect]);

  /** Stop recording and upload. Audio is uploaded first (small), then video. */
  const stop = useCallback(async (): Promise<{
    audioUrl?: string;
    videoUrl?: string;
    audioDuration?: number;
    screenshots: ScreenshotEntry[];
    hadRecorder?: boolean;
    videoClips: { questionId: string; clipUrl: string; durationSec: number }[];
  }> => {
    if (stoppedRef.current) {
      log.warn("Recording stop skipped — already finalized", {
        sessionId,
        hasAudioRecorder: !!recorderRef.current,
        hasVideoRecorder: !!videoRecorderRef.current,
      });
      return { screenshots: screenshotsRef.current, hadRecorder: false };
    }
    stoppedRef.current = true;
    const wasRecording = isRecordingRef.current;
    isRecordingRef.current = false;

    if (screenshotTimerRef.current) {
      clearInterval(screenshotTimerRef.current);
      screenshotTimerRef.current = null;
    }
    if (shouldTakeScreenshots) takeScreenshots();

    let audioUrl: string | undefined;
    let videoUrl: string | undefined;
    let audioDuration: number | undefined;

    // Finalize any active clip before cleaning up streams
    await stopAndUploadClip().catch(() => {});

    const recorder = recorderRef.current;
    const vrecorder = videoRecorderRef.current;
    const hadRecorder = !!(recorder || vrecorder);
    log.info("Finalizing recording", {
      sessionId,
      hadAudioRecorder: !!recorder,
      hadVideoRecorder: !!vrecorder,
      wasRecording,
    });

    // Stop both recorders before any upload so blobs are finalized.
    let videoBlob: Blob | null = null;
    let audioBlob: Blob | null = null;

    if (vrecorder) {
      await new Promise<void>((res) => vrecorder.stopRecording(() => res()));
      videoRecorderRef.current = null;
      const blob = vrecorder.getBlob();
      log.info("Video blob finalized", {
        sessionId,
        bytes: blob.size,
        contentType: blob.type,
      });
      if (blob.size > 0) {
        videoBlob = blob;
        audioDuration = Math.floor((Date.now() - videoStartTimeRef.current) / 1000);
      } else {
        log.warn("Video blob empty; will rely on audio-only upload", { sessionId });
      }
    }

    if (recorder) {
      await new Promise<void>((res) => recorder.stopRecording(() => res()));
      recorderRef.current = null;
      const blob = recorder.getBlob();
      log.info("Audio blob finalized", {
        sessionId,
        bytes: blob.size,
        contentType: blob.type,
      });
      if (blob.size > 0) {
        audioBlob = blob;
        if (audioDuration == null) {
          audioDuration = await resolveBlobDuration(blob);
        }
      } else {
        log.warn("Audio blob empty", { sessionId });
      }
    }

    // Upload compressed audio first so long sessions still get media when
    // the larger video PUT is rejected (nginx 413) or times out.
    if (audioBlob) {
      try {
        audioUrl = await uploadFileDirect(audioBlob, "recordings", `recording-${Date.now()}.webm`);
        log.info("Audio uploaded via RecordRTC", {
          sessionId,
          bytes: audioBlob.size,
          persistedPath: audioUrl,
        });
      } catch (err) {
        log.error("Audio upload failed:", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (videoBlob) {
      try {
        videoUrl = await uploadFileDirect(videoBlob, "videos", `video-${Date.now()}.webm`);
        log.info("Video uploaded via RecordRTC", {
          sessionId,
          bytes: videoBlob.size,
          persistedPath: videoUrl,
        });
      } catch (err) {
        log.error("Video upload failed after audio attempt:", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!audioUrl && !videoUrl) {
      log.error("Recording stop completed with no uploaded media", {
        sessionId,
        hadVideoRecorder: !!vrecorder,
        hadAudioRecorder: !!recorder,
        videoBlobSize: videoBlob?.size ?? 0,
        audioBlobSize: audioBlob?.size ?? 0,
        audioDuration,
      });
    } else {
      log.info("Recording finalize complete", {
        sessionId,
        audioUrl: audioUrl ?? null,
        videoUrl: videoUrl ?? null,
        audioDuration: audioDuration ?? null,
      });
    }

    // Cleanup mixers + recording clone only. Do NOT stop the live camera
    // tracks here — the UI / PiP may still be showing them during save, and
    // unmount used to black out the candidate tile mid-session.
    if (aiAttachRetryTimerRef.current) {
      clearTimeout(aiAttachRetryTimerRef.current);
      aiAttachRetryTimerRef.current = null;
    }
    try { micSourceRef.current?.disconnect(); } catch { /* noop */ }
    try { aiMediaSourceRef.current?.disconnect(); } catch { /* noop */ }
    try { mixCtxRef.current?.close(); } catch { /* noop */ }
    aiMediaSourceRef.current = null;
    aiMediaElRef.current = null;
    aiMediaSrcRef.current = null;
    pendingAiMediaElRef.current = null;
    ownedMicStreamRef.current?.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* noop */ }
    });
    ownedMicStreamRef.current = null;
    recordingCloneRef.current?.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* noop */ }
    });
    recordingCloneRef.current = null;
    clipStreamRef.current?.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* noop */ }
    });
    clipStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    [cameraVideoRef, screenVideoRef].forEach((ref) => {
      if (ref.current) { ref.current.srcObject = null; ref.current.remove(); ref.current = null; }
    });

    setIsRecording(false);
    return { audioUrl, videoUrl, audioDuration, screenshots: screenshotsRef.current, hadRecorder, videoClips: videoClipsAccRef.current };
  }, [shouldTakeScreenshots, takeScreenshots, uploadFileDirect, sessionId]);

  /** True if RecordRTC audio/video is active (ref-safe for end handlers). */
  const hasActiveRecorder = useCallback(
    () => !!(recorderRef.current || videoRecorderRef.current || isRecordingRef.current),
    [],
  );

  // Cleanup on unmount — stop recorders but NEVER kill the shared camera
  // stream (onboarding / PiP / zoom tile still own it across remounts).
  // If stop() already began (stoppedRef), leave it alone so uploads can finish.
  useEffect(() => {
    return () => {
      if (stoppedRef.current) return;
      if (screenshotTimerRef.current) clearInterval(screenshotTimerRef.current);
      if (aiAttachRetryTimerRef.current) clearTimeout(aiAttachRetryTimerRef.current);
      try { recorderRef.current?.stopRecording(() => {}); } catch { /* noop */ }
      try { videoRecorderRef.current?.stopRecording(() => {}); } catch { /* noop */ }
      try { micSourceRef.current?.disconnect(); } catch { /* noop */ }
      try { aiMediaSourceRef.current?.disconnect(); } catch { /* noop */ }
      try { mixCtxRef.current?.close(); } catch { /* noop */ }
      aiMediaSourceRef.current = null;
      aiMediaElRef.current = null;
      aiMediaSrcRef.current = null;
      pendingAiMediaElRef.current = null;
      ownedMicStreamRef.current?.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      ownedMicStreamRef.current = null;
      recordingCloneRef.current?.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      recordingCloneRef.current = null;
    };
  }, []);

  return {
    start,
    stop,
    startClip,
    stopAndUploadClip,
    addTtsChunk,
    cancelTts,
    attachMicStream,
    attachAiMediaElement,
    cameraStream,
    screenStream,
    isRecording,
    hasActiveRecorder,
    screenshots: screenshotsRef,
  };
}
