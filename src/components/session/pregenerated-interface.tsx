"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  getStoredCameraStream,
  setStoredCameraStream,
} from "@/lib/media-stream-store";
import {
  Mic,
  PhoneOff,
  Send,
  Check,
  FileText,
  Video,
  VideoOff,
  PenLine,
  Code2,
  Volume2,
  Loader2,
  Plus,
  Save,
  Clock,
  AlertCircle,
  RotateCcw,
  Play,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useInterviewRecording } from "@/hooks/use-interview-recording";
import { useFaceAnalysis } from "@/hooks/use-face-analysis";
import { trpc } from "@/lib/trpc/client";
import { useVoice, type InterviewContext } from "@/hooks/use-voice";
import {
  WhiteboardCanvas,
  type WhiteboardCanvasRef,
} from "@/components/whiteboard/whiteboard-canvas";
import { CodeEditorCanvas, type CodeEditorCanvasRef } from "@/components/code-editor/code-editor-canvas";
import {
  completeSessionBeacon,
  completeSessionNow,
} from "@/lib/session-complete-client";
import {
  mediaUrlsReferToSameClip,
  toSameOriginMediaUrl,
} from "@/lib/media-proxy";

export interface PregeneratedInterfaceProps {
  sessionId: string;
  interviewId: string;
  interviewTitle: string;
  aiName: string;
  interviewContext: InterviewContext;
  pregeneratedVideos: {
    intro: string;
    questions: string[];
    outro: string;
    headNod?: string;
  };
  durationMinutes?: number;
  whiteboardEnabled?: boolean;
  codeEnabled?: boolean;
  isPreview?: boolean;
  onComplete?: () => void;
}

type Stage = "INTRO" | "QUESTION" | "OUTRO" | "DONE";

type DrawingTab = { id: string; label: string; snapshotData?: string };

export function PregeneratedInterface({
  sessionId,
  interviewId,
  interviewTitle,
  aiName,
  interviewContext,
  pregeneratedVideos,
  durationMinutes,
  whiteboardEnabled = true,
  codeEnabled = true,
  isPreview = false,
  onComplete,
}: PregeneratedInterfaceProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Start with INTRO stage if intro clip is available, otherwise start with QUESTION
  const [stage, setStage] = useState<Stage>(() => {
    return pregeneratedVideos.intro ? "INTRO" : "QUESTION";
  });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sttError, setSttError] = useState<string | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [whiteboardActive, setWhiteboardActive] = useState(false);
  const [codeEditorActive, setCodeEditorActive] = useState(false);
  const [splitPercent, setSplitPercent] = useState(35);
  const [isMobile, setIsMobile] = useState(false);
  const [drawings, setDrawings] = useState<DrawingTab[]>([
    { id: crypto.randomUUID(), label: "Drawing 1" },
  ]);
  const [activeDrawingIdx, setActiveDrawingIdx] = useState(0);
  const [codeSnippetId] = useState(() => crypto.randomUUID());
  const [codeSaveStatus, setCodeSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timerDeadlineRef = useRef<number | null>(
    durationMinutes ? Date.now() + durationMinutes * 60_000 : null,
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    durationMinutes ? durationMinutes * 60 : null,
  );
  const timerExpiredRef = useRef(false);

  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const whiteboardRef = useRef<WhiteboardCanvasRef>(null);
  const codeEditorRef = useRef<CodeEditorCanvasRef>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const splitDragging = useRef(false);
  const finishingRef = useRef(false);
  const startedPlaybackKeysRef = useRef(new Set<string>());
  const endedPlaybackKeysRef = useRef(new Set<string>());
  /** Which element is currently loading/playing each key (cleared on unmount or abort). */
  const playbackInFlightByKeyRef = useRef(new Map<string, HTMLVideoElement>());
  const playbackTimeByKeyRef = useRef(new Map<string, number>());
  const prevPlaybackKeyRef = useRef<string | null>(null);
  const playbackAttemptSeqRef = useRef(0);

  const createUploadUrl = trpc.session.createUploadUrl.useMutation();
  const recording = useInterviewRecording({
    sessionId,
    enabled: !isPreview,
    getUploadUrl: async (bucket, path) => {
      return await createUploadUrl.mutateAsync({ bucket, path });
    },
  });
  const faceAnalysis = useFaceAnalysis({
    enabled: !isPreview,
    emotionServiceUrl: "/_emotion/analyze",
  });
  const saveRecordingMutation = trpc.session.saveRecording.useMutation();
  const recordingStartRef = useRef(recording.start);
  const recordingStopRef = useRef(recording.stop);
  const recordingAttachAiRef = useRef(recording.attachAiMediaElement);
  const sessionRecordingStartedRef = useRef(false);
  recordingStartRef.current = recording.start;
  recordingStopRef.current = recording.stop;
  recordingAttachAiRef.current = recording.attachAiMediaElement;

  const cameraStream = recording.cameraStream ?? localCameraStream;

  // STT-only relay (Google ASR) — pregenerated clips own AI speech; unmute→mute
  // commits one USER transcript row via /api/voice/save.
  const voice = useVoice({
    interviewId,
    sessionId,
    interviewContext: { ...interviewContext, skipLlm: true },
    skipLlm: true,
    mutePlayback: true,
    onError: (err) => {
      setSttError(err);
      window.setTimeout(() => setSttError(null), 5000);
    },
  });
  const isListening = voice.isListening;
  const voiceConnectRef = useRef(voice.connect);
  const voiceDisconnectRef = useRef(voice.disconnect);
  const voiceStartListeningRef = useRef(voice.startListening);
  const voiceStopListeningRef = useRef(voice.stopListening);
  const voiceCommitTurnRef = useRef(voice.commitTurn);
  const voiceSetQuestionIndexRef = useRef(voice.setQuestionIndex);
  voiceConnectRef.current = voice.connect;
  voiceDisconnectRef.current = voice.disconnect;
  voiceStartListeningRef.current = voice.startListening;
  voiceStopListeningRef.current = voice.stopListening;
  voiceCommitTurnRef.current = voice.commitTurn;
  voiceSetQuestionIndexRef.current = voice.setQuestionIndex;

  // Connect STT relay for the whole pregen session.
  // Do not disconnect-with-complete on unmount — Strict Mode remounts would
  // prematurely complete the session; finishInterview handles teardown.
  useEffect(() => {
    void voiceConnectRef.current();
  }, [sessionId]);

  // Keep USER message questionIndex in sync with clip progression.
  useEffect(() => {
    voiceSetQuestionIndexRef.current(questionIndex);
  }, [questionIndex]);

  const currentVideoUrl =
    stage === "INTRO"
      ? pregeneratedVideos.intro
      : stage === "QUESTION"
        ? pregeneratedVideos.questions[questionIndex]
        : stage === "OUTRO"
          ? pregeneratedVideos.outro
          : null;
  const currentPlaybackKey = currentVideoUrl
    ? `${stage}:${stage === "QUESTION" ? questionIndex : stage}:${currentVideoUrl}`
    : null;

  const currentQ =
    stage === "QUESTION"
      ? interviewContext.questions?.[questionIndex] ?? null
      : null;

  const currentQuestionText = currentQ?.text || null;
  const isCodingQuestion = currentQ?.type === "CODING";
  const isWhiteboardQuestion = currentQ?.type === "WHITEBOARD";
  const toolsActive = whiteboardActive || codeEditorActive;

  const finishInterview = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      if (voice.isListening) {
        voiceStopListeningRef.current();
        await voiceCommitTurnRef.current();
      }
    } catch {
      /* best-effort STT flush */
    }

    // Finalize + upload media BEFORE flipping COMPLETED so completed sessions
    // are less likely to show "Recording not available" after a mid-upload exit.
    try {
      console.info("[pregenerated] finalizing recording before session complete", {
        sessionId,
        hasActiveRecorder: recording.hasActiveRecorder(),
        isRecording: recording.isRecording,
      });
      const result = await recordingStopRef.current();
      const faceResults = faceAnalysis.stop();
      console.info("[pregenerated] recording stop result", {
        sessionId,
        hasAudio: !!result?.audioUrl,
        hasVideo: !!result?.videoUrl,
        audioDuration: result?.audioDuration ?? null,
        hadRecorder: result?.hadRecorder ?? false,
        audioUrl: result?.audioUrl ?? null,
        videoUrl: result?.videoUrl ?? null,
        eyeContactScore: faceResults.eyeContactScore,
        multipleFacesCount: faceResults.multipleFacesCount,
      });
      if (result?.audioUrl || result?.videoUrl || result?.audioDuration) {
        await saveRecordingMutation.mutateAsync({
          sessionId,
          audioRecordingUrl: result.audioUrl ?? null,
          videoRecordingUrl: result.videoUrl ?? null,
          audioDuration: result.audioDuration ?? null,
          screenshots: result.screenshots,
          participantMetadata: {
            eye_contact_score: faceResults.eyeContactScore,
            missed_count: faceResults.missedCount,
            multiple_faces_count: faceResults.multipleFacesCount,
            face_analysis_results: faceResults.results,
          },
        });
        console.info("[pregenerated] saveRecording persisted", {
          sessionId,
          hasAudio: !!result.audioUrl,
          hasVideo: !!result.videoUrl,
        });
      } else {
        // Still persist face metrics when media URLs are missing.
        await saveRecordingMutation.mutateAsync({
          sessionId,
          participantMetadata: {
            eye_contact_score: faceResults.eyeContactScore,
            missed_count: faceResults.missedCount,
            multiple_faces_count: faceResults.multipleFacesCount,
            face_analysis_results: faceResults.results,
          },
        });
        console.error("[pregenerated] recording finalized without media", {
          sessionId,
          hadRecorder: result?.hadRecorder ?? false,
        });
      }
    } catch (err) {
      console.error("[pregenerated] best-effort recording save failed:", err);
    }

    await completeSessionNow(sessionId);
    completeSessionBeacon(sessionId);

    try {
      await voiceDisconnectRef.current();
    } catch (err) {
      console.warn("[pregenerated] voice disconnect after complete:", err);
    }

    setStage("DONE");
    onComplete?.();
  }, [onComplete, sessionId, recording, saveRecordingMutation, voice.isListening, faceAnalysis]);

  const finishInterviewRef = useRef(finishInterview);
  finishInterviewRef.current = finishInterview;

  useEffect(() => {
    if (!timerDeadlineRef.current) return;
    const update = () =>
      setRemainingSeconds(
        Math.max(0, Math.ceil((timerDeadlineRef.current! - Date.now()) / 1000)),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remainingSeconds !== 0 || timerExpiredRef.current) return;
    timerExpiredRef.current = true;
    void finishInterview();
  }, [remainingSeconds, finishInterview]);

  useEffect(() => {
    if (stage !== "QUESTION" || !currentQ?.text) return;
    void fetch("/api/voice/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        currentQuestionIndex: questionIndex,
        messages: [{
          role: "assistant",
          content: currentQ.description?.trim()
            ? `${currentQ.text}\n\n${currentQ.description}`.trim()
            : currentQ.text,
          questionIndex,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  }, [stage, questionIndex, currentQ, sessionId]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const [cameraError, setCameraError] = useState<string | null>(null);

  // Acquire candidate camera on mount — always try (even if onboarding skipped).
  useEffect(() => {
    let cancelled = false;

    async function setupCamera() {
      const stored = getStoredCameraStream();
      if (stored) {
        // Re-enable tracks in case they were muted earlier.
        stored.getVideoTracks().forEach((t) => {
          t.enabled = true;
        });
        if (!cancelled) {
          setLocalCameraStream(stored);
          setCameraError(null);
        }
        return;
      }
      try {
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          cam.getTracks().forEach((t) => t.stop());
          return;
        }
        setLocalCameraStream(cam);
        setStoredCameraStream(cam);
        setCameraError(null);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof DOMException && err.name === "NotAllowedError"
              ? "Camera permission denied"
              : "Camera unavailable";
          setCameraError(msg);
        }
      }
    }

    void setupCamera();
    return () => {
      cancelled = true;
      // Don't stop tracks — recording / store may still own them.
    };
  }, []);

  // Continuous session recording for the whole interview (cam + mic + AI audio).
  // Must NOT start/stop per answer — that left coding-only / End-early sessions
  // with null audioRecordingUrl / videoRecordingUrl.
  useEffect(() => {
    if (sessionRecordingStartedRef.current || finishingRef.current) return;
    sessionRecordingStartedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        console.info("[pregenerated] starting continuous session recording", { sessionId });
        await recordingStartRef.current();
        if (cancelled) return;
        const avatar = avatarVideoRef.current;
        // Soft-attach AI audio — never fail the whole recording start.
        if (avatar) {
          try {
            recordingAttachAiRef.current(avatar);
          } catch (attachErr) {
            console.warn(
              "[pregenerated] AI audio attach after recording start failed — continuing without AI mix",
              attachErr,
            );
          }
        }
      } catch (err) {
        console.error("[pregenerated] failed to start session recording:", err);
        sessionRecordingStartedRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Callback ref so remounts (tools ↔ main) re-attach the stream
  const bindCameraVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      cameraVideoRef.current = video;
      if (!video || !cameraStream) return;
      if (video.srcObject !== cameraStream) {
        video.srcObject = cameraStream;
      }
      void video.play().catch(() => {});
      faceAnalysis.start(video);
    },
    // faceAnalysis.start is stable enough for bind; avoid re-binding loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cameraStream],
  );

  useEffect(() => {
    return () => {
      faceAnalysis.stop();
    };
  }, []);

  // Also re-attach when stream identity changes (safety net for remount races).
  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video || !cameraStream) return;
    if (video.srcObject !== cameraStream) {
      video.srcObject = cameraStream;
    }
    void video.play().catch(() => {});
  }, [cameraStream]);

  const currentVideoUrlRef = useRef(currentVideoUrl);
  currentVideoUrlRef.current = currentVideoUrl;
  const currentPlaybackKeyRef = useRef(currentPlaybackKey);
  currentPlaybackKeyRef.current = currentPlaybackKey;

  const clearInFlightForKey = useCallback((key: string, video?: HTMLVideoElement) => {
    const inFlightEl = playbackInFlightByKeyRef.current.get(key);
    if (!inFlightEl) return;
    if (!video || inFlightEl === video) {
      playbackInFlightByKeyRef.current.delete(key);
    }
  }, []);

  const playAvatarClipRef = useRef<
    (
      video: HTMLVideoElement,
      url: string,
      key: string,
      reason?: string,
    ) => Promise<void>
  >(async () => {});

  const scheduleAvatarPlayRetry = useCallback(
    (url: string, key: string, reason: string) => {
      window.requestAnimationFrame(() => {
        const mounted = avatarVideoRef.current;
        const activeKey = currentPlaybackKeyRef.current;
        if (!mounted || activeKey !== key || endedPlaybackKeysRef.current.has(key)) {
          return;
        }
        void playAvatarClipRef.current(mounted, url, key, `${reason}-retry`);
      });
    },
    [],
  );

  /** Play each AI clip once, with autoplay fallback only until playback starts. */
  const playAvatarClip = useCallback(
    async (
      video: HTMLVideoElement,
      url: string,
      key: string,
      reason = "unknown",
    ) => {
      if (!url) {
        console.warn("[pregenerated] play attempt skipped — empty url", { key, reason });
        return;
      }
      if (endedPlaybackKeysRef.current.has(key)) {
        console.info("[pregenerated] play attempt skipped — clip ended", { key, reason });
        return;
      }

      const attemptId = ++playbackAttemptSeqRef.current;
      const playbackUrl = toSameOriginMediaUrl(url);
      const currentSrc = video.src || video.currentSrc || "";
      const sameSrc = mediaUrlsReferToSameClip(currentSrc, playbackUrl);
      const isResume = startedPlaybackKeysRef.current.has(key);

      const logResult = (result: string, extra?: Record<string, unknown>) => {
        console.info("[pregenerated] play attempt", {
          key,
          reason,
          result,
          attemptId,
          isResume,
          sameSrc,
          mounted: avatarVideoRef.current === video,
          activeKey: currentPlaybackKeyRef.current,
          ...extra,
        });
      };

      const safeAttachAi = () => {
        try {
          recordingAttachAiRef.current(video);
        } catch (attachErr) {
          console.warn(
            "[pregenerated] AI audio attach failed — playback continues without mix",
            attachErr,
          );
        }
      };

      safeAttachAi();

      // Already playing this clip on the mounted element — never restart.
      if (
        isResume &&
        !video.ended &&
        !video.paused &&
        sameSrc &&
        avatarVideoRef.current === video &&
        currentPlaybackKeyRef.current === key
      ) {
        setIsVideoPlaying(true);
        logResult("already-playing");
        return;
      }

      const inFlightEl = playbackInFlightByKeyRef.current.get(key);
      if (inFlightEl && inFlightEl !== video) {
        // Stale in-flight on an unmounted/replaced element — take over on this one.
        playbackInFlightByKeyRef.current.delete(key);
      } else if (inFlightEl === video) {
        logResult("deduped-in-flight");
        return;
      }

      playbackInFlightByKeyRef.current.set(key, video);

      const applyClipSource = () => {
        video.setAttribute("playsinline", "");
        video.playsInline = true;
        video.preload = "auto";
        if (playbackUrl.startsWith("/api/media/proxy")) {
          video.crossOrigin = "anonymous";
        } else {
          video.removeAttribute("crossorigin");
        }
        if (!sameSrc) {
          video.src = playbackUrl;
          video.load();
        }
      };

      const waitForCanPlay = () =>
        new Promise<void>((resolve) => {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            resolve();
            return;
          }
          const onReady = () => {
            video.removeEventListener("canplay", onReady);
            video.removeEventListener("loadeddata", onReady);
            resolve();
          };
          video.addEventListener("canplay", onReady);
          video.addEventListener("loadeddata", onReady);
          window.setTimeout(resolve, 4000);
        });

      const tryPlay = async (muted: boolean) => {
        video.muted = muted;
        await video.play();
      };

      const isStaleAttempt = () =>
        playbackInFlightByKeyRef.current.get(key) !== video ||
        avatarVideoRef.current !== video ||
        currentPlaybackKeyRef.current !== key ||
        endedPlaybackKeysRef.current.has(key);

      try {
        applyClipSource();
        await waitForCanPlay();

        if (isStaleAttempt()) {
          clearInFlightForKey(key, video);
          logResult("aborted-stale-after-buffer");
          scheduleAvatarPlayRetry(url, key, reason);
          return;
        }

        if (isResume) {
          const savedTime = playbackTimeByKeyRef.current.get(key) ?? 0;
          if (
            savedTime > 0 &&
            Number.isFinite(video.duration) &&
            video.duration > 0 &&
            savedTime < video.duration - 0.25
          ) {
            video.currentTime = savedTime;
          }
        }

        try {
          await tryPlay(false);
        } catch {
          await tryPlay(true);
          video.muted = false;
        }

        if (isStaleAttempt()) {
          clearInFlightForKey(key, video);
          logResult("aborted-stale-after-play");
          scheduleAvatarPlayRetry(url, key, reason);
          return;
        }

        startedPlaybackKeysRef.current.add(key);
        setIsIdle(false);
        setIsVideoPlaying(true);
        safeAttachAi();
        logResult("playing");
      } catch (err) {
        if (!isStaleAttempt()) {
          setIsVideoPlaying(false);
          logResult("failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        } else {
          logResult("aborted-stale-on-error");
          scheduleAvatarPlayRetry(url, key, reason);
        }
      } finally {
        clearInFlightForKey(key, video);
      }
    },
    [clearInFlightForKey, scheduleAvatarPlayRetry],
  );

  playAvatarClipRef.current = playAvatarClip;

  const bindAvatarVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      const prevVideo = avatarVideoRef.current;
      avatarVideoRef.current = video;
      if (!video) {
        if (prevVideo) {
          for (const [key, el] of playbackInFlightByKeyRef.current.entries()) {
            if (el === prevVideo) {
              playbackInFlightByKeyRef.current.delete(key);
            }
          }
        }
        try {
          recordingAttachAiRef.current(null);
        } catch {
          /* noop */
        }
        return;
      }
      try {
        recordingAttachAiRef.current(video);
      } catch (attachErr) {
        console.warn("[pregenerated] AI audio attach on bind failed", attachErr);
      }
      const url = currentVideoUrlRef.current;
      const key = currentPlaybackKeyRef.current;
      if (!url || !key) return;
      if (endedPlaybackKeysRef.current.has(key)) return;
      void playAvatarClip(video, url, key, "bind");
    },
    [playAvatarClip],
  );

  // Authoritative play when the clip identity changes (stage / question / URL).
  // Defer one frame so tool-layout effects (coding Q2) remount the video first.
  useEffect(() => {
    if (!currentVideoUrl || !currentPlaybackKey) {
      if (stage === "INTRO") {
        setStage("QUESTION");
        setQuestionIndex(0);
      } else if (stage === "OUTRO") {
        void finishInterviewRef.current();
      }
      return;
    }

    const keyChanged = prevPlaybackKeyRef.current !== currentPlaybackKey;
    prevPlaybackKeyRef.current = currentPlaybackKey;
    if (!keyChanged) return;

    setIsVideoPlaying(false);
    const url = currentVideoUrl;
    const key = currentPlaybackKey;

    const attemptPlay = () => {
      const video = avatarVideoRef.current;
      if (!video || currentPlaybackKeyRef.current !== key) return;
      try {
        recordingAttachAiRef.current(video);
      } catch (attachErr) {
        console.warn("[pregenerated] AI audio attach on clip change failed", attachErr);
      }
      void playAvatarClip(video, url, key, "key-change");
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(attemptPlay);
    });
  }, [currentPlaybackKey, currentVideoUrl, stage, playAvatarClip]);

  // Unconditional COMPLETED on tab/browser close (beacon-compatible route)
  useEffect(() => {
    const onExit = () => {
      if (finishingRef.current || stage === "DONE") {
        completeSessionBeacon(sessionId);
        return;
      }
      completeSessionBeacon(sessionId);
    };
    window.addEventListener("pagehide", onExit);
    window.addEventListener("beforeunload", onExit);
    return () => {
      window.removeEventListener("pagehide", onExit);
      window.removeEventListener("beforeunload", onExit);
    };
  }, [sessionId, stage]);

  // Auto-open whiteboard/code for matching question types (same as VoiceInterface).
  useEffect(() => {
    if (stage !== "QUESTION") {
      setWhiteboardActive(false);
      setCodeEditorActive(false);
      return;
    }
    if (isCodingQuestion && codeEnabled) {
      setCodeEditorActive(true);
      setWhiteboardActive(false);
    } else if (isWhiteboardQuestion && whiteboardEnabled) {
      setWhiteboardActive(true);
      setCodeEditorActive(false);
    } else {
      setCodeEditorActive(false);
      setWhiteboardActive(false);
    }
  }, [stage, questionIndex, isCodingQuestion, isWhiteboardQuestion, codeEnabled, whiteboardEnabled]);

  useEffect(() => {
    if (!isListening) {
      setRecordingSeconds(0);
      return;
    }
    const timer = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isListening]);

  const handleVideoEnded = () => {
    const key = currentPlaybackKeyRef.current;
    if (key) {
      endedPlaybackKeysRef.current.add(key);
      playbackTimeByKeyRef.current.delete(key);
    }
    setIsVideoPlaying(false);
    setIsIdle(true);
    if (stage === "INTRO") {
      // Keep in INTRO stage until user clicks "Let's Begin" button
      return;
    }
    if (stage === "OUTRO") {
      void finishInterview();
    }
  };

  const advanceAfterAnswer = () => {
    setIsIdle(false);
    if (stage === "INTRO") {
      setStage("QUESTION");
      setQuestionIndex(0);
      return;
    }
    if (stage === "QUESTION") {
      if (questionIndex + 1 < pregeneratedVideos.questions.length) {
        setQuestionIndex(questionIndex + 1);
      } else if (pregeneratedVideos.outro) {
        setStage("OUTRO");
      } else {
        void finishInterview();
      }
    }
  };

  const startRecording = async () => {
    // Answer-turn STT — session RecordRTC already runs continuously.
    if (!voice.isConnected) {
      await voiceConnectRef.current();
    }
    await voiceStartListeningRef.current();
  };

  const stopRecordingAndSend = async () => {
    // Do NOT call recording.stop() here — that finalized/uploaded the whole
    // session early and left End/auto-complete with no media to persist.
    // Stop mic first (silence helps Google finalize), then wait for relay
    // flush + asr_ended before advancing so the full answer is saved.
    voiceStopListeningRef.current();
    setSentFlash(true);
    setTimeout(() => setSentFlash(false), 1800);
    try {
      await voiceCommitTurnRef.current();
    } catch {
      /* timeout fallback inside commitTurn */
    }
    advanceAfterAnswer();
  };

  const handleRepeatIntro = () => {
    setIsIdle(false);
    const key = currentPlaybackKey;
    if (key) {
      endedPlaybackKeysRef.current.delete(key);
    }
    const video = avatarVideoRef.current;
    if (video) {
      video.currentTime = 0;
      void video.play().catch(() => {});
      setIsVideoPlaying(true);
    }
  };

  const handleMicClick = async () => {
    if (sentFlash) return;
    if (stage === "OUTRO") {
      void finishInterview();
      return;
    }
    if (stage === "INTRO") {
      setStage("QUESTION");
      setQuestionIndex(0);
      return;
    }
    if (isListening) {
      await stopRecordingAndSend();
      return;
    }
    // Coding: Submit advances (session recording keeps running).
    if (isCodingQuestion && stage === "QUESTION" && !isListening) {
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 1800);
      advanceAfterAnswer();
      return;
    }
    await startRecording();
  };

  const handleToggleWhiteboard = useCallback(() => {
    if (whiteboardActive) {
      setWhiteboardActive(false);
    } else {
      setWhiteboardActive(true);
      setCodeEditorActive(false);
    }
  }, [whiteboardActive]);

  const handleToggleCodeEditor = useCallback(() => {
    if (codeEditorActive) {
      setCodeEditorActive(false);
    } else {
      setCodeEditorActive(true);
      setWhiteboardActive(false);
    }
  }, [codeEditorActive]);

  const handleSplitDividerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      splitDragging.current = true;
      const onMove = (ev: PointerEvent) => {
        if (!splitDragging.current || !splitContainerRef.current) return;
        const rect = splitContainerRef.current.getBoundingClientRect();
        if (isMobile) {
          const pct = ((ev.clientY - rect.top) / rect.height) * 100;
          setSplitPercent(Math.min(70, Math.max(20, pct)));
        } else {
          const pct = ((ev.clientX - rect.left) / rect.width) * 100;
          setSplitPercent(Math.min(70, Math.max(20, pct)));
        }
      };
      const onUp = () => {
        splitDragging.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isMobile],
  );

  const persistDrawing = useCallback(
    async (drawing: DrawingTab, snapshotData: string) => {
      try {
        await fetch("/api/trpc/session.saveWhiteboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            json: {
              sessionId,
              drawingId: drawing.id,
              label: drawing.label,
              snapshotData,
            },
          }),
        });
      } catch (err) {
        console.error("[pregen] Failed to save whiteboard:", err);
      }
    },
    [sessionId],
  );

  const handleWhiteboardAutoSave = useCallback(
    (snapshotData: string) => {
      const drawing = drawings[activeDrawingIdx];
      if (!drawing) return;
      setDrawings((prev) =>
        prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData } : d)),
      );
      void persistDrawing(drawing, snapshotData);
    },
    [activeDrawingIdx, drawings, persistDrawing],
  );

  const handleCodeAutoSave = useCallback(
    async (snapshotData: string) => {
      setCodeSaveStatus("saving");
      try {
        await fetch("/api/trpc/session.saveCode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            json: {
              sessionId,
              snippetId: codeSnippetId,
              label: `Code Q${questionIndex + 1}`,
              snapshotData,
            },
          }),
        });
        setCodeSaveStatus("saved");
        setTimeout(() => setCodeSaveStatus("idle"), 1500);
      } catch {
        setCodeSaveStatus("idle");
      }
    },
    [sessionId, codeSnippetId, questionIndex],
  );

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const statusLabel =
    stage === "DONE"
      ? "Completed"
      : isVideoPlaying
        ? `${aiName} speaking`
        : isListening
          ? "Listening"
          : "Connected";

  const micDisabled = sentFlash || (isVideoPlaying && stage !== "OUTRO" && !isListening);

  const renderZoomTiles = (compact = false, hideCandidate = false) => (
    <div
      className={cn(
        "relative flex w-full overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10 shrink-0",
        hideCandidate
          ? "aspect-video"
          : compact
            ? "aspect-video max-h-[28vh]"
            : "aspect-[16/9] max-h-[52vh] w-full lg:aspect-[2/1]",
      )}
    >
      <div
        className={cn(
          "flex h-full w-full flex-row",
          !hideCandidate && (compact ? "gap-1.5 p-1.5" : "gap-2 p-2 md:gap-4 md:p-4")
        )}
      >
        <div
          className={cn(
            "relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-900 transition-all duration-300 md:rounded-2xl",
            isVideoPlaying && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
          )}
        >
          {/* IDLE VIDEO (Background, looping, silent).
              Mild top-anchored scale crops burned-in subtitles / hands at the bottom
              without the old aggressive face zoom. */}
          {pregeneratedVideos.headNod && (
            <video
              src={pregeneratedVideos.headNod}
              autoPlay
              loop
              muted
              playsInline
              style={{ transform: "scale(1.22)", transformOrigin: "center top" }}
              className={cn(
                "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-300",
                isIdle ? "opacity-100 z-10" : "opacity-0 z-0"
              )}
            />
          )}

          {/* MAIN VIDEO */}
          <video
            ref={bindAvatarVideo}
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-300",
              !isIdle ? "opacity-100 z-10" : "opacity-0 z-0"
            )}
            style={{ transform: "scale(1.22)", transformOrigin: "center top" }}
            onEnded={handleVideoEnded}
            onTimeUpdate={(e) => {
              const key = currentPlaybackKeyRef.current;
              const el = e.currentTarget;
              if (key && !el.ended && !el.paused) {
                playbackTimeByKeyRef.current.set(key, el.currentTime);
              }
            }}
            playsInline
            preload="auto"
          />
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-md">
            <span className="text-xs font-medium text-white">{aiName}</span>
            {isVideoPlaying && <Volume2 className="h-3 w-3 animate-pulse text-green-400" />}
          </div>
        </div>

        {!hideCandidate && (
          <div
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-900 transition-all duration-300 md:rounded-2xl",
              isListening && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
            )}
          >
            {cameraStream ? (
              <video
                ref={bindCameraVideo}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover object-center"
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 px-4">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800 text-3xl font-semibold text-zinc-400">
                  {(interviewContext.participantName || "C").charAt(0).toUpperCase()}
                </div>
                {cameraError && (
                  <p className="max-w-[12rem] text-center text-[11px] text-zinc-400">
                    {cameraError}
                  </p>
                )}
              </div>
            )}
            {cameraStream && (
              <>
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${
                      faceAnalysis.latestResult?.eyeContact
                        ? "bg-green-500 shadow-[0_0_5px_#22c55e]"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-[9px] text-white">Eye Contact</span>
                </div>
                {faceAnalysis.latestResult?.multipleFacesDetected && (
                  <div className="absolute top-8 right-2 z-10 flex items-center gap-1 rounded border border-red-500/50 bg-red-900/80 px-1.5 py-0.5">
                    <AlertCircle className="h-2.5 w-2.5 text-white" />
                    <span className="text-[9px] font-medium text-white">Multiple Faces</span>
                  </div>
                )}
              </>
            )}
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-md">
              <span className="text-xs font-medium text-white">
                {interviewContext.participantName || "You"}
              </span>
              {isListening ? (
                <Mic className="h-3 w-3 animate-pulse text-green-400" />
              ) : cameraStream ? (
                <Video className="h-3 w-3 text-zinc-400" />
              ) : (
                <VideoOff className="h-3 w-3 text-zinc-400" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (stage === "DONE") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-background">
        <h2 className="text-2xl font-bold">Interview Completed</h2>
        <p className="text-muted-foreground">Thank you for your time.</p>
      </div>
    );
  }

  const formattedRemaining = remainingSeconds == null
    ? null
    : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const isTimeLow = remainingSeconds != null && remainingSeconds <= 60;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      {/* Integrity Warning Banner — same eye-contact / multi-face proctoring as interactive */}
      <div
        className={`fixed top-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-red-500 px-4 py-2 text-white shadow-xl transition-all duration-300 ${
          faceAnalysis.latestResult?.multipleFacesDetected ||
          (recording.isRecording &&
            faceAnalysis.latestResult &&
            !faceAnalysis.latestResult.eyeContact)
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-12 opacity-0"
        }`}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap text-sm font-semibold">
          {faceAnalysis.latestResult?.multipleFacesDetected
            ? "Multiple faces detected in frame"
            : "Please look at the camera"}
        </span>
      </div>

      {/* Header */}
      <div className="shrink-0 border-b bg-card px-3 py-2 md:px-6 md:py-3">
        <div className="flex items-center justify-between relative">
          <div className="mr-2 min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold md:text-base">{interviewTitle}</h1>
            <p className="hidden text-xs text-muted-foreground md:block">
              Interview with {aiName}
            </p>
          </div>

          {/* Centered Bold Timer and Question Badge */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
            {formattedRemaining && (
              <div className={cn(
                "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold tabular-nums shadow-sm border",
                isTimeLow ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-primary/10 text-primary border-primary/20",
              )}>
                <Clock className="h-4 w-4" />
                <span>{formattedRemaining} left</span>
              </div>
            )}
            {stage === "QUESTION" && (
              <Badge variant="secondary" className="px-4 py-1.5 text-sm font-extrabold bg-slate-100 text-slate-800 border shadow-sm">
                Q{questionIndex + 1} / {pregeneratedVideos.questions.length}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 z-10">
            {isListening && (
              <div className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5">
                <div className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                <span className="text-[10px] font-medium text-destructive">REC</span>
              </div>
            )}
            <Badge variant="default">{statusLabel}</Badge>
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 rounded-full"
              onClick={() => setShowEndDialog(true)}
              title="End interview"
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col">
          {toolsActive ? (
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* Minimized status bar */}
              <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
                {isVideoPlaying ? (
                  <div className="flex items-center gap-1.5 text-primary">
                    <Volume2 className="h-4 w-4 animate-pulse" />
                    <span className="text-xs font-medium">{aiName} speaking</span>
                  </div>
                ) : isListening ? (
                  <div className="flex items-center gap-1.5 text-secondary-500">
                    <Mic className="h-4 w-4" />
                    <span className="text-xs font-medium">Listening</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Voice active — {whiteboardActive ? "draw" : "code"} freely
                  </span>
                )}
              </div>

              {whiteboardActive && (
                <div className="flex items-center gap-1 border-b bg-card px-3 py-1.5">
                  {drawings.map((d, i) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        if (i === activeDrawingIdx) return;
                        const snapshot = whiteboardRef.current?.getSnapshotData();
                        if (snapshot) {
                          setDrawings((prev) =>
                            prev.map((dr, idx) =>
                              idx === activeDrawingIdx ? { ...dr, snapshotData: snapshot } : dr,
                            ),
                          );
                          const current = drawings[activeDrawingIdx];
                          if (current) void persistDrawing(current, snapshot);
                        }
                        setActiveDrawingIdx(i);
                      }}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        i === activeDrawingIdx
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const snapshot = whiteboardRef.current?.getSnapshotData();
                      if (snapshot) {
                        setDrawings((prev) =>
                          prev.map((dr, idx) =>
                            idx === activeDrawingIdx ? { ...dr, snapshotData: snapshot } : dr,
                          ),
                        );
                        const current = drawings[activeDrawingIdx];
                        if (current) void persistDrawing(current, snapshot);
                      }
                      setDrawings((prev) => [
                        ...prev,
                        { id: crypto.randomUUID(), label: `Drawing ${prev.length + 1}` },
                      ]);
                      setActiveDrawingIdx(drawings.length);
                    }}
                    className="ml-1 flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" />
                    New
                  </button>
                </div>
              )}

              {codeEditorActive && (
                <div className="flex items-center justify-end border-b bg-card px-3 py-1.5">
                  <button
                    type="button"
                    disabled={codeSaveStatus === "saving"}
                    onClick={() => {
                      const data = codeEditorRef.current?.getSnapshotData();
                      if (data) void handleCodeAutoSave(data);
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
                      codeSaveStatus === "saved"
                        ? "text-secondary-600"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {codeSaveStatus === "saving" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : codeSaveStatus === "saved" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    {codeSaveStatus === "saved" ? "Saved" : "Save"}
                  </button>
                </div>
              )}

              <div className="min-h-0 flex-1">
                {whiteboardActive && currentQ ? (
                  <div
                    ref={splitContainerRef}
                    className={isMobile ? "flex h-full flex-col" : "flex h-full"}
                  >
                    <div
                      className={cn(
                        "flex min-w-0 shrink-0 flex-col overflow-y-auto overflow-x-hidden p-4",
                        isMobile && "border-b",
                      )}
                      style={
                        isMobile
                          ? { height: `${splitPercent}%`, minHeight: 80 }
                          : { width: `${splitPercent}%`, minWidth: 180 }
                      }
                    >
                      <div className="mb-4 shrink-0 border-b border-white/5 pb-4">
                        {renderZoomTiles(true)}
                      </div>
                      <div className="mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Problem
                        </span>
                      </div>
                      <p className="mb-3 text-sm font-medium leading-snug">{currentQ.text}</p>
                      {currentQ.description && (
                        <p className="mb-3 whitespace-pre-wrap text-xs text-muted-foreground">
                          {currentQ.description}
                        </p>
                      )}
                    </div>
                    <div
                      className={cn(
                        "group flex items-center justify-center border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20",
                        isMobile
                          ? "h-1 cursor-row-resize touch-none border-b border-t"
                          : "w-1 cursor-col-resize touch-none border-l border-r",
                      )}
                      onPointerDown={handleSplitDividerDown}
                    />
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                      <WhiteboardCanvas
                        key={drawings[activeDrawingIdx]?.id}
                        ref={whiteboardRef}
                        fillParent
                        dark={isDark}
                        initialData={drawings[activeDrawingIdx]?.snapshotData}
                        onAutoSave={handleWhiteboardAutoSave}
                        autoSaveInterval={5000}
                      />
                    </div>
                  </div>
                ) : whiteboardActive ? (
                  <WhiteboardCanvas
                    ref={whiteboardRef}
                    fillParent
                    dark={isDark}
                    initialData={drawings[activeDrawingIdx]?.snapshotData}
                    onAutoSave={handleWhiteboardAutoSave}
                    autoSaveInterval={5000}
                  />
                ) : codeEditorActive && currentQ ? (
                  <div
                    ref={splitContainerRef}
                    className={isMobile ? "flex h-full flex-col" : "flex h-full"}
                  >
                    <div
                      className={cn(
                        "flex min-w-0 shrink-0 flex-col overflow-y-auto overflow-x-hidden p-4",
                        isMobile && "border-b",
                      )}
                      style={
                        isMobile
                          ? { height: `${splitPercent}%`, minHeight: 80 }
                          : { width: `${splitPercent}%`, minWidth: 180 }
                      }
                    >
                      <div className="mb-4 shrink-0 border-b border-white/5 pb-4">
                        {renderZoomTiles(true, true)}
                      </div>
                      <div className="mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Problem
                        </span>
                      </div>
                      <p className="mb-3 text-sm font-medium leading-snug">{currentQ.text}</p>
                      {currentQ.description && (
                        <p className="mb-3 text-xs text-muted-foreground">{currentQ.description}</p>
                      )}
                      {/* Candidate webcam — replaces duplicate starter-code panel (editor has starter on the right) */}
                      <div
                        className={cn(
                          "relative mt-auto aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10 transition-all duration-300",
                          isListening && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
                        )}
                      >
                        {cameraStream ? (
                          <video
                            ref={bindCameraVideo}
                            autoPlay
                            playsInline
                            muted
                            className="absolute inset-0 h-full w-full object-cover"
                            style={{ transform: "scaleX(-1)" }}
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-2xl font-semibold text-zinc-400">
                              {(interviewContext.participantName || "C").charAt(0).toUpperCase()}
                            </div>
                            {cameraError && (
                              <p className="max-w-[12rem] text-center text-[11px] text-zinc-400">
                                {cameraError}
                              </p>
                            )}
                          </div>
                        )}
                        {cameraStream && (
                          <>
                            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
                              <div
                                className={`h-1.5 w-1.5 rounded-full ${
                                  faceAnalysis.latestResult?.eyeContact
                                    ? "bg-green-500 shadow-[0_0_5px_#22c55e]"
                                    : "bg-red-500"
                                }`}
                              />
                              <span className="text-[9px] text-white">Eye Contact</span>
                            </div>
                            {faceAnalysis.latestResult?.multipleFacesDetected && (
                              <div className="absolute top-8 right-2 z-10 flex items-center gap-1 rounded border border-red-500/50 bg-red-900/80 px-1.5 py-0.5">
                                <AlertCircle className="h-2.5 w-2.5 text-white" />
                                <span className="text-[9px] font-medium text-white">Multiple Faces</span>
                              </div>
                            )}
                          </>
                        )}
                        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-md">
                          <span className="text-[11px] font-medium text-white">
                            {interviewContext.participantName || "You"}
                          </span>
                          {isListening ? (
                            <Mic className="h-3 w-3 animate-pulse text-green-400" />
                          ) : cameraStream ? (
                            <Video className="h-3 w-3 text-zinc-400" />
                          ) : (
                            <VideoOff className="h-3 w-3 text-zinc-400" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "group flex items-center justify-center border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20",
                        isMobile
                          ? "h-1 cursor-row-resize touch-none border-b border-t"
                          : "w-1 cursor-col-resize touch-none border-l border-r",
                      )}
                      onPointerDown={handleSplitDividerDown}
                    />
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                      <CodeEditorCanvas
                        key={`code-${questionIndex}`}
                        ref={codeEditorRef}
                        fillParent
                        dark={isDark}
                        initialData={
                          currentQ.starterCode
                            ? JSON.stringify({
                                language: currentQ.starterCode.language,
                                code: currentQ.starterCode.code,
                              })
                            : undefined
                        }
                        templates={currentQ.starterCode?.templates}
                        onAutoSave={handleCodeAutoSave}
                        autoSaveInterval={5000}
                      />
                    </div>
                  </div>
                ) : (
                  <CodeEditorCanvas
                    key={`code-${questionIndex}`}
                    ref={codeEditorRef}
                    fillParent
                    dark={isDark}
                    templates={currentQ?.starterCode?.templates}
                    onAutoSave={handleCodeAutoSave}
                    autoSaveInterval={5000}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-3 md:gap-4 md:p-6">
              {currentQuestionText && (
                <div className="w-full max-w-5xl shrink-0">
                  <div className="relative rounded-2xl border border-primary/10 bg-gradient-to-b from-card/50 to-card p-4 shadow-xl backdrop-blur-md md:p-5">
                    <div className="absolute -top-3 left-6 flex items-center gap-2 rounded-full bg-primary px-3 py-1 shadow-lg">
                      <FileText className="h-3.5 w-3.5 text-primary-foreground" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                        Current Question
                      </span>
                    </div>
                    <p className="pt-2 text-center text-base font-medium leading-relaxed md:text-xl">
                      {currentQuestionText}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex w-full max-w-5xl shrink-0 items-center justify-center">
                {renderZoomTiles(false)}
              </div>
            </div>
          )}
        </div>
      </div>

      {isListening && (
        <div className="absolute bottom-[10.5rem] left-1/2 z-50 flex max-w-[min(90vw,36rem)] -translate-x-1/2 flex-col items-center gap-2">
          <div className="flex items-center gap-3 rounded-full border border-primary/20 bg-background/95 px-4 py-2 shadow-lg backdrop-blur-md">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <span className="text-sm font-bold tracking-wide">
              Answering {formatRecordingTime(recordingSeconds)}
            </span>
          </div>
          {/* Live STT interim text is intentionally hidden; ASR still runs and saves to transcript */}
        </div>
      )}
      {sttError && (
        <div className="absolute bottom-[10.5rem] left-1/2 z-50 -translate-x-1/2 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive shadow-lg backdrop-blur-md">
          {sttError}
        </div>
      )}
      {!isListening && recording.isRecording && (
        <div className="absolute bottom-[10.5rem] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white/80 shadow-lg backdrop-blur-md">
          <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          Session recording
        </div>
      )}

      {/* Bottom control bar — large mute like realtime avatar VoiceInterface */}
      <div className="relative flex min-h-[152px] items-center justify-between border-t bg-card px-4 pt-14 pb-8">
        <div className="flex min-w-[120px] items-center gap-3" />

        <div className="absolute left-1/2 top-[calc(50%-0.25rem)] z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-2 md:gap-4">
          {whiteboardEnabled && (
            <button
              type="button"
              onClick={handleToggleWhiteboard}
              className={cn(
                "group flex h-16 w-16 flex-col items-center justify-start gap-1 pt-1 transition-colors",
                whiteboardActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                  whiteboardActive ? "bg-primary/20" : "bg-muted group-hover:bg-muted/80",
                )}
              >
                <PenLine className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium leading-none">Whiteboard</span>
            </button>
          )}

          {stage === "INTRO" && (
            <button
              type="button"
              onClick={handleRepeatIntro}
              className="flex h-14 items-center justify-center gap-2 rounded-full border border-primary/30 bg-background px-6 shadow-md transition-all hover:bg-muted"
            >
              <RotateCcw className="h-5 w-5 text-primary" />
              <span className="whitespace-nowrap text-sm font-semibold">Repeat Intro</span>
            </button>
          )}

          <button
            type="button"
            data-tour="voice-send"
            disabled={micDisabled && stage !== "INTRO"}
            onClick={() => void handleMicClick()}
            className={cn(
              "group relative flex h-14 items-center justify-center gap-3 rounded-full px-8 shadow-md transition-all duration-300 sm:px-10",
              sentFlash
                ? "scale-105 bg-green-500 text-white"
                : isListening
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              micDisabled && stage !== "INTRO" && "pointer-events-none opacity-50",
            )}
          >
            {sentFlash && (
              <span className="absolute inset-0 animate-[sendRipple_0.6s_ease-out_forwards] rounded-full bg-green-400/50" />
            )}
            {sentFlash ? (
              <Check className="h-6 w-6" />
            ) : isListening ? (
              <Send className="h-6 w-6" />
            ) : isCodingQuestion && stage === "QUESTION" ? (
              <Send className="h-6 w-6" />
            ) : stage === "INTRO" ? (
              <Play className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
            <span className="whitespace-nowrap text-sm font-semibold sm:text-base">
              {sentFlash
                ? "Submitted"
                : isListening
                  ? "Submit Response"
                  : stage === "INTRO"
                    ? "Let's Begin"
                    : stage === "OUTRO"
                      ? "Finish"
                      : isCodingQuestion && stage === "QUESTION"
                        ? "Submit"
                        : "Unmute to Speak"}
            </span>
          </button>

          {codeEnabled && (
            <button
              type="button"
              onClick={handleToggleCodeEditor}
              className={cn(
                "group flex h-16 w-16 flex-col items-center justify-start gap-1 pt-1 transition-colors",
                codeEditorActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                  codeEditorActive ? "bg-primary/20" : "bg-muted group-hover:bg-muted/80",
                )}
              >
                <Code2 className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium leading-none">Code</span>
            </button>
          )}
        </div>

        <div className="flex h-9 min-w-[120px] items-center justify-end gap-3" />
      </div>

      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End interview?</AlertDialogTitle>
            <AlertDialogDescription>
              This will save your progress and end the current interview session. You won&apos;t be able to continue after this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void finishInterview()}
            >
              End Interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
