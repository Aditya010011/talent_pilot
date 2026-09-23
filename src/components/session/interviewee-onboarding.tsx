"use client";

import { PreparingScreen } from "@/components/session/preparing-screen";
import { useAppLocale } from "@/components/app-locale-provider";
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
import { InluwaLogo } from "@/components/ui/inluwa-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import type { InterviewContext } from "@/hooks/use-voice";
import { useOrientation } from "@/hooks/use-orientation";
import { getVideoConstraints } from "@/lib/video-constraints";
import { getMicTestMessage, getSpeechSynthesisLocale } from "@/lib/i18n";
import { resolveLanguage } from "@/lib/languages";
import { CandidateLanguageSelect } from "@/components/session/candidate-language-select";
import {
    setCameraSkipped,
    setScreenSkipped,
    setStoredCameraStream,
    setStoredScreenStream,
} from "@/lib/media-stream-store";
import {
  buildRelayTargets,
  isRecoverableRelayErrorMessage,
  RelayConnector,
  resolveRelayPrimaryPreference,
} from "@/lib/voice/relay-routing";
import { cn } from "@/lib/utils";
import {
    AlertCircle,
    AudioLines,
    Camera,
    CheckCircle2,
    Loader2,
    Mic,
    Monitor,
    RefreshCw,
    RotateCcw,
    ScreenShare,
    User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatInterface } from "./chat-interface";
import { IntervieweeTourOverlay } from "./interviewee-tour-overlay";
import { IntervieweeTourProvider, useIntervieweeTour } from "./interviewee-tour-provider";
import { VoiceInterface } from "./voice-interface";

interface IntervieweeOnboardingProps {
  sessionId?: string;
  interviewTitle: string;
  interviewDescription?: string | null;
  questionCount: number;
  timeLimitMinutes?: number | null;
  language?: string;
  multilingualEnabled?: boolean;
  antiCheatingEnabled?: boolean;
  voiceEnabled?: boolean;
  chatEnabled?: boolean;
  whiteboardEnabled?: boolean;
  codeEnabled?: boolean;
  aiName?: string;
  questionTypes?: string[];
  initialParticipantName?: string | null;
  onComplete: (participantName?: string, language?: string) => void;
}

type OnboardingStep = "info" | "checklist" | "howItWorks";

function WelcomeIllustration() {
  return (
    <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-orange-50 px-6 pt-6 pb-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/marketing/channel-screenshot-sm.webp"
        alt="Interview interface preview"
        className="block w-full rounded-t-lg"
      />
      <div className="absolute -bottom-px left-0 right-0 h-6 bg-gradient-to-t from-white/90 to-transparent" />
    </div>
  );
}

export function PreviewWrapper({
  onReady,
  children,
}: {
  onReady: () => void;
  children: React.ReactNode;
}) {
  const { t } = useAppLocale();
  const tour = useIntervieweeTour();
  const tourDone = tour?.finished ?? false;
  const [welcomed, setWelcomed] = useState(false);
  const showWelcome = !welcomed && !tour?.active && !tourDone;

  const handleStartTour = useCallback(() => {
    setWelcomed(true);
    tour?.restart();
  }, [tour]);

  const handleSkipTour = useCallback(() => {
    setWelcomed(true);
    tour?.skip();
  }, [tour]);

  return (
    <div className="relative flex h-screen flex-col bg-background">
      {children}

      {/* Welcome overlay */}
      {showWelcome && (
        <div className="absolute inset-0 z-[9997] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/30 bg-white shadow-2xl">
            <WelcomeIllustration />
            <div className="space-y-3 px-8 pb-8 pt-2 text-center">
              <h3 className="text-xl font-bold text-gray-900">{t("tour.welcomeTitle")}</h3>
              <p className="text-[15px] font-medium text-gray-700">
                {t("tour.welcomeSubtitle")}
              </p>
              <p className="text-sm leading-relaxed text-gray-500">
                {t("tour.welcomeDesc")}
              </p>
              <div className="flex items-stretch gap-3 pt-3">
                <Button
                  variant="ghost"
                  size="lg"
                  className="text-muted-foreground"
                  onClick={handleSkipTour}
                >
                  {t("tour.skipTour")}
                </Button>
                <Button className="flex-1" size="lg" onClick={handleStartTour}>
                  {t("tour.takeTour")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tour complete overlay */}
      {tourDone && (
        <div className="absolute inset-0 z-[9997] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-2xl">
            <div className="text-center">
              <h3 className="text-lg font-semibold">{t("tour.completeTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tour.completeSubtitle")}
              </p>
            </div>
            <div className="flex items-stretch gap-3">
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                onClick={() => tour?.restart()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("tour.restartTour")}
              </Button>
              <Button className="flex-1" size="lg" onClick={onReady}>
                {t("tour.startInterview")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: OnboardingStep }) {
  const { t } = useAppLocale();
  const STEPS = [
    { key: "info", label: t("onboarding.info") },
    { key: "checklist", label: t("onboarding.checklist") },
    { key: "howItWorks", label: t("onboarding.start") },
  ];
  const stepIdxMap: Record<OnboardingStep, number> = { info: 0, checklist: 1, howItWorks: 2 };
  const currentIdx = Math.min(stepIdxMap[current], STEPS.length - 1);

  return (
    <div className="flex items-center justify-center gap-2 py-6">
      {STEPS.map((step, idx) => {
        const isComplete = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={step.key} className="flex items-center gap-2">
            {idx > 0 && (
              <div
                className={cn(
                  "h-px w-12 sm:w-20",
                  isComplete ? "bg-primary" : "bg-border"
                )}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                  isComplete
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "border border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  isCurrent
                    ? "font-medium text-foreground"
                    : isComplete
                      ? "text-foreground"
                      : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CameraCheck({
  sessionId,
  done,
  onDone,
  onPhotoCaptured,
  allowSkip = true,
}: {
  sessionId?: string;
  done: boolean;
  onDone: () => void;
  onPhotoCaptured?: (photo: string) => void;
  allowSkip?: boolean;
}) {
  const { t } = useAppLocale();
  const { portrait } = useOrientation();
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [streaming]);

  const startCamera = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError(
        window.location.protocol === "http:" && window.location.hostname !== "localhost"
          ? t("onboarding.secureContextError")
          : t("onboarding.cameraError")
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", ...getVideoConstraints(portrait) },
      });
      streamRef.current = stream;
      setPhoto(null);
      setStreaming(true);
    } catch (err) {
      const name = err instanceof Error ? err.name : "UnknownError";
      const message = err instanceof Error ? err.message : String(err);
      console.error("Camera access failed [" + name + "]: " + message, err);
      setError(t("onboarding.cameraError"));
    }
  }, [t, portrait]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    // Scale down photo to fit 320 max dimension to save storage quota
    const maxDim = 320;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    // Keep the live camera stream for the interview tile — do not stop tracks.
    if (streamRef.current) {
      setStoredCameraStream(streamRef.current);
      streamRef.current = null;
    }
    setStreaming(false);
    setPhoto(dataUrl);

    if (typeof window !== "undefined") {
      try {
        // Clean up old photos to free localStorage quota
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("captured_photo_")) {
            keys.push(key);
          }
        }
        keys.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {}
        });

        const key = sessionId ? `captured_photo_${sessionId}` : "captured_photo_default";
        localStorage.setItem(key, dataUrl);
      } catch (e) {
        console.error("Failed to save captured photo to localStorage:", e);
      }
    }

    if (onPhotoCaptured) {
      onPhotoCaptured(dataUrl);
    }

    onDone();
  }, [onDone, sessionId, onPhotoCaptured]);

  const retake = useCallback(() => {
    // Replace any previously handed-off stream before opening a new one.
    const previous = streamRef.current;
    if (previous) {
      previous.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStoredCameraStream(null);
    setPhoto(null);
    void startCamera();
  }, [startCamera]);

  useEffect(() => {
    return () => {
      // Only stop tracks still owned by this check (not handed to the store).
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div
            className={cn(
              "relative overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/50",
              portrait ? "h-44 w-32" : "h-36 w-44",
            )}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt="Captured photo"
                className="h-full w-full object-contain"
              />
            ) : streaming ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full scale-x-[-1] object-contain"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                <User className="h-10 w-10 text-muted-foreground/30" />
                <span className="text-[11px] text-center px-2 text-muted-foreground/50">
                  {t("onboarding.cameraEye")}
                </span>
              </div>
            )}
          </div>
          {!photo && !streaming && !done && (
            <Button size="sm" onClick={startCamera} className="w-full">
              <Camera className="mr-1.5 h-3.5 w-3.5" />
              {t("onboarding.startCollecting")}
            </Button>
          )}
          {streaming && (
            <Button size="sm" onClick={capture} className="w-full">
              {t("onboarding.startCollecting")}
            </Button>
          )}
          {photo && (
            <Button size="sm" variant="outline" onClick={retake} className="w-full">
              <RefreshCw className="mr-1 h-3 w-3" />
              {t("common.retry")}
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            {t("onboarding.cameraDesc")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("onboarding.cameraAuth")}
          </p>
          {error && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" className="ml-auto font-medium underline" onClick={startCamera}>
                {t("common.retry")}
              </button>
            </div>
          )}
          {allowSkip && !error && !photo && !streaming && !done && (
            <p className="text-xs text-muted-foreground">
              {t("onboarding.noCamera")}{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                {t("common.skip")}
              </button>
            </p>
          )}
          {!allowSkip && !error && !photo && !streaming && !done && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Camera is required for this interview.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center self-start pt-0.5">
          {done ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              {t("onboarding.collectPhoto")}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2" />
              {t("onboarding.collectPhoto")}
            </span>
          )}
        </div>
      </CardContent>
      <canvas ref={canvasRef} className="hidden" />
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip photo collection?</AlertDialogTitle>
            <AlertDialogDescription>
              Skipping photo collection is not recommended. The photo is used to
              verify your identity during the interview. Skipping may affect your
              interview results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.back")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setCameraSkipped(true); onDone(); }}>
              {t("common.skip")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type MicPhase = "idle" | "requesting" | "playing" | "listening" | "analyzing" | "confirm";

function MicCheck({ done, onDone, language, allowSkip = true }: { done: boolean; onDone: () => void; language?: string; allowSkip?: boolean }) {
  const { t } = useAppLocale();
  const [phase, setPhase] = useState<MicPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [transcript, setTranscript] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const relayConnectorRef = useRef<RelayConnector<Record<string, unknown>> | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const languageRef = useRef(language);
  languageRef.current = language;

  const stopAll = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    relayConnectorRef.current?.close();
    relayConnectorRef.current = null;
    if (micCtxRef.current) {
      micCtxRef.current.close().catch(() => {});
      micCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const analyzeResponse = useCallback((text: string) => {
    setPhase("analyzing");
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      setPhase("idle");
      onDoneRef.current();
      return;
    }
    setPhase("confirm");
  }, []);

  const getSpeechSynthesisApi = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return null;
    }

    return window.speechSynthesis;
  }, []);

  const stopTtsPlayback = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    getSpeechSynthesisApi()?.cancel();
  }, [getSpeechSynthesisApi]);

  const startListening = useCallback((quiet = false) => {
    if (!quiet) {
      setPhase("listening");
      setTranscript("");
    }

    let lastAsrText = "";
    let handled = false;
    let micStarted = false;
    let finalizeTimer: ReturnType<typeof setTimeout> | null = null;

    const clearFinalizeTimer = () => {
      if (finalizeTimer) {
        clearTimeout(finalizeTimer);
        finalizeTimer = null;
      }
    };

    const finish = (text: string) => {
      if (handled) return;
      clearFinalizeTimer();
      handled = true;
      stopTtsPlayback();
      if (micCtxRef.current) {
        micCtxRef.current.close().catch(() => {});
        micCtxRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      relayConnectorRef.current?.close();
      relayConnectorRef.current = null;
      if (text.trim()) {
        analyzeResponse(text);
      } else if (!quiet) {
        analyzeResponse("");
      }
    };

    const startMicCapture = async () => {
      if (micStarted || handled) return;
      micStarted = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micStreamRef.current = stream;

        const ctx = new AudioContext({ sampleRate: 16000 });
        micCtxRef.current = ctx;

        const workletCode = `
          class MicProcessor extends AudioWorkletProcessor {
            constructor() { super(); this._buf = new Float32Array(4096); this._pos = 0; }
            process(inputs) {
              const ch = inputs[0]?.[0];
              if (!ch) return true;
              for (let i = 0; i < ch.length; i++) {
                this._buf[this._pos++] = ch[i];
                if (this._pos >= 4096) { this.port.postMessage(this._buf); this._buf = new Float32Array(4096); this._pos = 0; }
              }
              return true;
            }
          }
          registerProcessor('mic-processor', MicProcessor);
        `;
        const blob = new Blob([workletCode], { type: "application/javascript" });
        const workletUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const source = ctx.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(ctx, "mic-processor");
        source.connect(worklet);
        worklet.connect(ctx.destination);

        worklet.port.onmessage = (e) => {
          if (handled || !relayConnectorRef.current?.isReady) return;
          const input = e.data as Float32Array;
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
          }
          const bytes = new Uint8Array(pcm.buffer);
          let hex = "";
          for (let i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, "0");
          }
          relayConnectorRef.current?.sendJson({ type: "audio", data: hex });
        };
      } catch {
        finish("");
      }
    };

    const connector = new RelayConnector<Record<string, unknown>>({
      targets: buildRelayTargets({
        language: languageRef.current,
        voiceRelayUrl: process.env.NEXT_PUBLIC_VOICE_RELAY_URL,
        openAiRelayUrl: process.env.NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL,
        primaryPreference: resolveRelayPrimaryPreference(
          process.env.NEXT_PUBLIC_VOICE_RELAY_PRIMARY,
        ),
        browserProtocol: window.location.protocol,
        browserHost: window.location.host,
      }),
      buildInitMessage: () => ({ type: "mic_test", language: languageRef.current }),
      onConnected: () => {
        void startMicCapture();
      },
      onJsonMessage: (msg, { connector: activeConnector }) => {
        if (handled) return;
        if (msg.type === "asr") {
          const data = msg.data as { results?: Array<{ text?: string }> } | undefined;
          const results = data?.results || [];
          if (results.length > 0 && results[0].text) {
            lastAsrText = results[0].text;
            setTranscript(lastAsrText);
            stopTtsPlayback();
            setPhase("listening");
            // New speech arrived — cancel any pending finalize so we
            // don't cut the user off mid-sentence.
            clearFinalizeTimer();
          }
        } else if (msg.type === "asr_ended") {
          const text = ((msg.text as string) || lastAsrText).trim();
          if (text) {
            // Google STT's isFinal often fires on a short pause, not on
            // true end-of-turn. Debounce briefly so a short breath
            // between words doesn't cut the user off; if more speech
            // arrives (new "asr" message) before the timer fires, the
            // timer below is cleared and restarted.
            clearFinalizeTimer();
            finalizeTimer = setTimeout(() => finish(lastAsrText || text), 900);
          }
        } else if (msg.type === "disconnected") {
          if (activeConnector.canFailover) {
            void activeConnector.failover("mic test relay disconnected");
          } else {
            finish(lastAsrText);
          }
        } else if (msg.type === "error") {
          const message = (msg.message as string) || "";
          if (
            isRecoverableRelayErrorMessage(message) &&
            activeConnector.canFailover
          ) {
            return;
          }
          finish(lastAsrText);
        } else if (msg.type === "timeout") {
          finish(lastAsrText);
        }
      },
      onPermanentFailure: () => {
        if (!handled) finish(lastAsrText);
      },
    });

    relayConnectorRef.current = connector;
    void connector.connect().catch(() => {
      if (!handled) finish(lastAsrText);
    });

    setTimeout(() => {
      if (!handled) finish(lastAsrText);
    }, 25000);
  }, [analyzeResponse, stopTtsPlayback]);

  const playTTS = useCallback(async () => {
    setError(null);
    setPhase("requesting");

    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError(
        window.location.protocol === "http:" && window.location.hostname !== "localhost"
          ? t("onboarding.secureContextError")
          : "Unable to access microphone. Please check permissions."
      );
      setPhase("idle");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Unable to access microphone. Please check permissions.");
      setPhase("idle");
      return;
    }

    startListening(true);
    setPhase("playing");

    const msg = getMicTestMessage(language);

    const playPcmStream = async (body: ReadableStream<Uint8Array>) => {
      const ctx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = ctx;
      const reader = body.getReader();
      let playTime = ctx.currentTime;
      let leftover: Uint8Array | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone || !value || value.length === 0) break;

        // Merge leftover bytes from previous chunk to maintain
        // float32 sample alignment (4 bytes per sample).
        let bytes: Uint8Array;
        if (leftover) {
          bytes = new Uint8Array(leftover.length + value.length);
          bytes.set(leftover);
          bytes.set(value, leftover.length);
          leftover = null;
        } else {
          bytes = value;
        }

        const remainder = bytes.length % 4;
        const usable = bytes.length - remainder;
        if (remainder > 0) {
          leftover = bytes.slice(usable);
        }
        if (usable === 0) continue;

        // Copy into a properly-aligned ArrayBuffer for Float32Array
        const aligned = new ArrayBuffer(usable);
        new Uint8Array(aligned).set(bytes.subarray(0, usable));
        const float32 = new Float32Array(aligned);

        if (float32.length === 0) continue;

        const buf = ctx.createBuffer(1, float32.length, 24000);
        buf.getChannelData(0).set(float32);
        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);

        const startAt = Math.max(ctx.currentTime, playTime);
        source.start(startAt);
        playTime = startAt + buf.duration;
      }

      // Wait for all scheduled audio to finish, then listen
      const remaining = playTime - ctx.currentTime;
      if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining * 1000 + 100));
      }
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
      abortRef.current = null;
      if (relayConnectorRef.current?.isReady) {
        setPhase("listening");
      } else {
        startListening();
      }
    };

    // Prefer Google TTS (EN = Standard, yue = Chirp3 HD / WaveNet-tier).
    // Fall back to Doubao S2S, then browser SpeechSynthesis.
    const ttsEndpoints = ["/api/voice/tts", "/api/voice/tts-s2s"] as const;
    for (const endpoint of ttsEndpoints) {
      try {
        const abort = new AbortController();
        abortRef.current = abort;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: msg, language: languageRef.current }),
          signal: abort.signal,
        });

        if (res.ok && res.body) {
          await playPcmStream(res.body);
          return;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Try next endpoint
      }
    }

    fallbackToSpeechSynthesis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startListening]);

  const fallbackToSpeechSynthesis = useCallback(() => {
    const speechSynthesisApi = getSpeechSynthesisApi();
    if (!speechSynthesisApi || typeof SpeechSynthesisUtterance === "undefined") {
      startListening();
      return;
    }

    setPhase("playing");
    const msg = getMicTestMessage(language);
    const utterance = new SpeechSynthesisUtterance(msg);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = getSpeechSynthesisLocale(language);
    utterance.onend = () => { if (relayConnectorRef.current?.isReady) { setPhase("listening"); } else { startListening(); } };
    utterance.onerror = () => { if (relayConnectorRef.current?.isReady) { setPhase("listening"); } else { startListening(); } };
    speechSynthesisApi.speak(utterance);
  }, [getSpeechSynthesisApi, startListening, language]);

  useEffect(() => {
    return () => {
      stopAll();
      getSpeechSynthesisApi()?.cancel();
    };
  }, [getSpeechSynthesisApi, stopAll]);

  const isBusy = phase === "requesting" || phase === "playing" || phase === "listening" || phase === "analyzing";

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-36 w-44 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/50">
            <AudioLines
              className={cn(
                "h-10 w-10 transition-colors",
                isBusy ? "text-primary" : "text-muted-foreground/30"
              )}
            />
            {phase === "playing" && (
              <div className="flex h-5 w-28 items-end justify-center gap-[3px]">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 animate-pulse rounded-full bg-primary"
                    style={{
                      height: `${4 + Math.random() * 14}px`,
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                ))}
              </div>
            )}
            {phase === "listening" && (
              <div className="flex flex-col items-center gap-1">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                  <span className="text-[11px] font-medium text-destructive">{t("onboarding.listening")}</span>
                </div>
                {transcript && (
                  <span className="max-w-[10rem] truncate text-[10px] text-muted-foreground">
                    &quot;{transcript}&quot;
                  </span>
                )}
              </div>
            )}
            {phase === "analyzing" && (
              <span className="text-[11px] text-muted-foreground">{t("onboarding.analyzing")}</span>
            )}
            {phase === "idle" && !done && (
              <span className="text-[11px] text-center px-2 text-muted-foreground/50">
                {t("onboarding.speakerMic")}
              </span>
            )}
            {done && !skipped && (
              <span className="text-xs font-medium text-secondary-600 dark:text-secondary-400">
                {t("onboarding.audioConfirmedShort")}
              </span>
            )}
          </div>
          {phase === "idle" && !done && (
            <Button size="sm" onClick={playTTS} className="w-full">
              <Mic className="mr-1.5 h-3.5 w-3.5" />
              {t("onboarding.testMic")}
            </Button>
          )}
          {phase === "requesting" && (
            <Button size="sm" disabled className="w-full">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t("onboarding.requestingAccess")}
            </Button>
          )}
          {phase === "playing" && (
            <Button size="sm" variant="outline" onClick={() => { stopAll(); setPhase("idle"); }} className="w-full">
              {t("onboarding.stop")}
            </Button>
          )}
          {phase === "listening" && (
            <div className="w-full flex flex-col gap-1">
              <Button size="sm" variant="outline" disabled className="w-full">
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t("onboarding.listening")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs font-semibold text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-950/20"
                onClick={() => {
                  stopAll();
                  setPhase("idle");
                  onDoneRef.current();
                }}
              >
                Confirm manually
              </Button>
            </div>
          )}
          {phase === "analyzing" && (
            <Button size="sm" disabled className="w-full">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t("onboarding.analyzing")}
            </Button>
          )}
          {phase === "confirm" && !done && (
            <Button size="sm" onClick={playTTS} className="w-full">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t("onboarding.playAgain")}
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            {t("onboarding.micDesc")}
          </p>
          <p className="text-xs text-muted-foreground">
            {phase === "idle" && !done && t("onboarding.micInstructions")}
            {phase === "requesting" &&
              t("onboarding.micRequesting")}
            {phase === "playing" &&
              t("onboarding.micPlaying")}
            {phase === "listening" &&
              t("onboarding.micListening")}
            {phase === "analyzing" &&
              t("onboarding.micAnalyzing")}
            {phase === "confirm" && !done && allowSkip &&
              t("onboarding.micRetry")}
            {phase === "confirm" && !done && allowSkip && (
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                skip this step
              </button>
            )}
            {phase === "confirm" && !done && allowSkip && "."}
            {phase === "confirm" && !done && !allowSkip &&
              t("onboarding.micFailed")}
            {done &&
              t("onboarding.audioPass")}
          </p>
          {error && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" className="ml-auto font-medium underline" onClick={playTTS}>
                {t("common.retry")}
              </button>
            </div>
          )}
          {allowSkip && !error && phase === "idle" && !done && (
            <p className="text-xs text-muted-foreground">
              {t("onboarding.noMic")}{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                {t("common.skip")}
              </button>
            </p>
          )}
          {!allowSkip && !error && phase === "idle" && !done && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("onboarding.micRequired")}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center self-start pt-0.5">
          {done ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              {t("onboarding.speakerMic")}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2" />
              {t("onboarding.speakerMic")}
            </span>
          )}
        </div>
      </CardContent>
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip microphone test?</AlertDialogTitle>
            <AlertDialogDescription>
              Skipping the microphone test is not recommended. If your speaker or
              microphone is not working properly, it may affect your interview
              experience and results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.back")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setPhase("idle"); setSkipped(true); onDone(); }}>
              {t("common.skip")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ScreenCheck({
  done,
  onDone,
  allowSkip = true,
}: {
  done: boolean;
  onDone: () => void;
  allowSkip?: boolean;
}) {
  const { t } = useAppLocale();
  const [error, setError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [showHideBannerDialog, setShowHideBannerDialog] = useState(false);

  // getDisplayMedia is unavailable on iOS Safari and most mobile browsers
  const [isSupported, setIsSupported] = useState(true);
  const autoSkippedRef = useRef(false);

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia;
    setIsSupported(supported);
    if (!supported && !done && !autoSkippedRef.current) {
      autoSkippedRef.current = true;
      setScreenSkipped(true);
      onDone();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requestShare = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      setError(
        window.location.protocol === "http:" && window.location.hostname !== "localhost"
          ? t("onboarding.secureContextError")
          : "Screen sharing is not supported by your browser."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      // Validate that the user shared the entire screen, not a tab or window
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack?.getSettings() as MediaTrackSettings & { displaySurface?: string };
        if (settings.displaySurface && settings.displaySurface !== "monitor") {
          stream.getTracks().forEach((t) => t.stop());
          setError(
            t("onboarding.screenInstructions")
          );
          return;
        }

      const videoEl = document.createElement("video");
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      await videoEl.play();

      await new Promise((r) => setTimeout(r, 300));

      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      canvas.getContext("2d")?.drawImage(videoEl, 0, 0);
      setThumbnail(canvas.toDataURL("image/jpeg", 0.7));

      // Keep the stream alive for the interview recording to reuse
      setStoredScreenStream(stream);
      videoEl.srcObject = null;
      setShowHideBannerDialog(true);
    } catch {
      setError(t("onboarding.screenDenied"));
    }
  }, [onDone]);

  if (!isSupported) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">{t("onboarding.screenUnavailable")}</p>
              <p className="text-xs text-muted-foreground">
                {t("onboarding.screenUnavailableDesc")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center self-start pt-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              {t("common.skip")}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-36 w-44 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/50">
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnail}
                alt="Screen capture preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ScreenShare className="h-10 w-10 text-muted-foreground/30" />
                <span className="text-[11px] text-muted-foreground/50">
                  {t("onboarding.entireScreen")}
                </span>
              </div>
            )}
          </div>
          {!done && (
            <Button size="sm" onClick={requestShare} className="w-full">
              <Monitor className="mr-1.5 h-3.5 w-3.5" />
              {t("onboarding.shareScreen")}
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            {t("onboarding.screenDesc")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("onboarding.screenInstructions")}
          </p>
          {error && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" className="ml-auto font-medium underline" onClick={requestShare}>
                {t("common.retry")}
              </button>
            </div>
          )}
          {allowSkip && !error && !done && (
            <p className="text-xs text-muted-foreground">
              Can&apos;t share screen?{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                {t("common.skip")}
              </button>
            </p>
          )}
          {!allowSkip && !error && !done && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("onboarding.screenRequired")}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center self-start pt-0.5">
          {done ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              {t("onboarding.screenCapture")}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2" />
              {t("onboarding.screenCapture")}
            </span>
          )}
        </div>
      </CardContent>
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip screen sharing?</AlertDialogTitle>
            <AlertDialogDescription>
              Skipping screen sharing is not recommended. Screen capture is used
              to monitor your interview environment. Skipping may affect your
              interview results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.back")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setScreenSkipped(true); onDone(); }}>
              {t("common.skip")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog to ensure the user hides the screen sharing banner */}
      <AlertDialog open={showHideBannerDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide Screen Sharing Banner</AlertDialogTitle>
            <AlertDialogDescription>
              Your browser is now sharing your screen. Please click the <strong>&quot;Hide&quot;</strong> button on the browser&apos;s screen sharing banner at the bottom of your screen before continuing. This ensures it won&apos;t accidentally trigger anti-cheating alerts during the interview.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowHideBannerDialog(false);
              onDone();
            }}>
              I have hidden it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function IntervieweeOnboarding({
  sessionId,
  interviewTitle,
  interviewDescription,
  questionCount,
  timeLimitMinutes,
  language,
  multilingualEnabled = false,
  antiCheatingEnabled = false,
  voiceEnabled = false,
  chatEnabled = false,
  whiteboardEnabled = true,
  codeEnabled = true,
  aiName = "AI Interviewer",
  questionTypes = [],
  initialParticipantName,
  onComplete,
}: IntervieweeOnboardingProps) {
  const { t } = useAppLocale();
  const [step, setStep] = useState<OnboardingStep>("info");
  const [agreed, setAgreed] = useState(false);
  const [candidateName, setCandidateName] = useState(initialParticipantName || "");
  const [chosenLanguage, setChosenLanguage] = useState(
    resolveLanguage(language).code,
  );

  const [cameraDone, setCameraDone] = useState(false);
  const [micDone, setMicDone] = useState(false);
  const [screenDone, setScreenDone] = useState(false);
  const [starting, setStarting] = useState(false);

  // ScreenCheck is currently disabled in the checklist UI.
  // Mark screen as skipped on mount so the recording hook doesn't prompt
  // getDisplayMedia (which triggers the browser's screen-sharing popup).
  useEffect(() => {
    setScreenSkipped(true);
  }, []);

  const allChecksDone = cameraDone && micDone;

  const updateNameMutation = trpc.session.updateParticipantName.useMutation();
  const updateMetadataMutation = trpc.session.updateParticipantMetadata.useMutation();
  const setLanguageMutation = trpc.session.setLanguage.useMutation();

  const handleComplete = useCallback(() => {
    setStarting(true);
    onComplete(candidateName.trim(), multilingualEnabled ? chosenLanguage : undefined);
  }, [onComplete, candidateName, multilingualEnabled, chosenLanguage]);

  const header = (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-card px-4 sm:px-6">
      <InluwaLogo size={40} className="shrink-0" />
    </header>
  );

  if (step === "info") {
    return (
      <div className="flex min-h-screen flex-col bg-muted/30">
        {header}
        <StepIndicator current="info" />
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 pb-8 sm:px-6">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{interviewTitle}</h2>

              <div className="mt-4 flex gap-6 text-sm">
                <div>
                  <span className="font-medium">{t("header.content")}</span>
                  <p className="mt-1 text-muted-foreground">
                    {interviewDescription || "No additional description."}
                  </p>
                </div>
              </div>

              <div className="mt-2 text-sm text-muted-foreground">
                {questionCount} {t("sidebar.questions")} &middot;{" "}
                {timeLimitMinutes
                  ? `${timeLimitMinutes} min`
                  : "No time limit"}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4 border-primary/10 shadow-lg bg-card overflow-hidden">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Confirm Your Name
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                To guarantee optimal transcription accuracy and ensure the voice interviewer correctly addresses you, please verify or enter your full name below:
              </p>
              <div className="space-y-2">
                <Label htmlFor="candidateName" className="sr-only">Your Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 transition-colors duration-200" />
                  <Input
                    id="candidateName"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Enter your full name..."
                    className="pl-10 h-11 text-sm font-semibold border-muted/60 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200 rounded-xl"
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {multilingualEnabled && (
            <Card className="mt-4 border-primary/10 shadow-lg bg-card overflow-hidden">
              <CardContent className="p-4 sm:p-6 space-y-4">
                <CandidateLanguageSelect
                  value={chosenLanguage}
                  onChange={(code) => {
                    setChosenLanguage(code);
                  }}
                  label={t("onboarding.chooseLanguage")}
                  description={t("onboarding.chooseLanguageDesc")}
                />
              </CardContent>
            </Card>
          )}

          <Card className="mt-4">
            <CardContent className="space-y-3 p-4 sm:p-6">
              <h3 className="font-semibold">{t("onboarding.integrityNotices")}</h3>
              {antiCheatingEnabled ? (
                <>
                  <div className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    {t("onboarding.integrityDesc")}
                  </div>
                  <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                    <li>
                      {t("onboarding.chromeNotice")}
                    </li>
                    <li>
                      {t("onboarding.submitNotice")}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t("onboarding.tabTracking")}</span>{" "}
                      {t("onboarding.tabTrackingDesc")}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t("onboarding.pasteBlocked")}</span>{" "}
                      {t("onboarding.pasteBlockedDesc")}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t("onboarding.multiScreen")}</span>{" "}
                      {t("onboarding.multiScreenDesc")}
                    </li>
                    <li>
                      {t("onboarding.cameraNotice")}
                    </li>
                    <li>
                      {t("onboarding.screenCaptureNotice")}
                    </li>
                  </ol>
                </>
              ) : (
                <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                  <li>
                    {t("onboarding.chromeNotice")}
                  </li>
                  <li>
                    {t("onboarding.submitNotice")}
                  </li>
                  <li>
                    {t("onboarding.distractionNotice")}
                  </li>
                  <li>
                    {t("onboarding.cameraNotice")}
                  </li>
                  <li>
                    {t("onboarding.screenCaptureNotice")}
                  </li>
                </ol>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 flex flex-col items-center gap-4">
            <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
              <Checkbox
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
              />
              {t("onboarding.agreeNotice")}
            </label>
            <Button
              disabled={!agreed || !candidateName.trim() || updateNameMutation.isLoading || setLanguageMutation.isLoading}
              onClick={async () => {
                if (candidateName.trim() && candidateName.trim() !== initialParticipantName) {
                  try {
                    await updateNameMutation.mutateAsync({
                      sessionId: sessionId!,
                      participantName: candidateName.trim(),
                    });
                  } catch (e) {
                    console.error("Failed to update candidate name:", e);
                  }
                }
                if (multilingualEnabled && sessionId) {
                  try {
                    await setLanguageMutation.mutateAsync({
                      sessionId,
                      language: chosenLanguage,
                    });
                  } catch (e) {
                    console.error("Failed to save interview language:", e);
                  }
                }
                setStep("checklist");
              }}
              className="w-44 h-11 text-sm font-bold shadow-md rounded-xl transition-all duration-200 active:scale-[0.98]"
            >
              {updateNameMutation.isLoading || setLanguageMutation.isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
                  Saving...
                </span>
              ) : (
                t("common.next")
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (starting) {
    return <PreparingScreen />;
  }

  if (step === "howItWorks") {
    const mode = voiceEnabled ? "voice" : "chat";

    const mockContext: InterviewContext = {
      title: interviewTitle,
      aiName: aiName ?? "AI Interviewer",
      aiTone: "professional",
      language: chosenLanguage,
      followUpDepth: "medium",
      questions: Array.from({ length: questionCount }, (_, i) => ({
        text: `Question ${i + 1}`,
        type: questionTypes?.[i] ?? "OPEN_ENDED",
        order: i,
      })),
    };

    return (
      <IntervieweeTourProvider mode={mode}>
        <PreviewWrapper onReady={handleComplete}>
          {mode === "voice" ? (
            <VoiceInterface
              sessionId="__preview__"
              interviewId="__preview__"
              interviewTitle={interviewTitle}
              aiName={aiName ?? "AI Interviewer"}
              questionCount={questionCount}
              interviewContext={mockContext}
              durationMinutes={timeLimitMinutes ?? undefined}
              chatEnabled={chatEnabled}
              whiteboardEnabled={whiteboardEnabled}
              codeEnabled={codeEnabled}
              onComplete={() => {}}
              preview
            />
          ) : (
            <ChatInterface
              sessionId="__preview__"
              interview={{
                id: "__preview__",
                title: interviewTitle,
                aiName: aiName ?? "AI Interviewer",
                mode: "CHAT",
                questions: mockContext.questions.map((q, i) => ({
                  id: `preview-q-${i}`,
                  text: q.text,
                  type: q.type,
                })),
              }}
              durationMinutes={timeLimitMinutes ?? undefined}
              onComplete={() => {}}
              preview
            />
          )}
        </PreviewWrapper>
        <IntervieweeTourOverlay />
      </IntervieweeTourProvider>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {header}
      <StepIndicator current="checklist" />
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 pb-8">
        <Card className="border-primary/10 shadow-sm bg-card overflow-hidden">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Verify Your Name
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Please enter your full name below to ensure transcription accuracy:
            </p>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                id="candidateNameChecklist"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="Enter your full name..."
                className="pl-10 h-10 text-sm font-semibold border-muted/60 focus-visible:ring-primary focus-visible:border-primary rounded-xl"
                required
              />
            </div>
          </CardContent>
        </Card>

        <CameraCheck
          sessionId={sessionId}
          done={cameraDone}
          onDone={() => setCameraDone(true)}
          allowSkip={!antiCheatingEnabled}
          onPhotoCaptured={async (photoUrl) => {
            if (!sessionId) return;
            try {
              await updateMetadataMutation.mutateAsync({
                sessionId,
                participantMetadata: { capturedPhoto: photoUrl },
              });
            } catch (e) {
              console.error("Failed to save onboarding photo:", e);
            }
          }}
        />
        <MicCheck done={micDone} onDone={() => setMicDone(true)} language={chosenLanguage} allowSkip={!antiCheatingEnabled} />
        {/* <ScreenCheck done={screenDone} onDone={() => setScreenDone(true)} allowSkip={!antiCheatingEnabled} /> */}

        <div className="flex items-center justify-center gap-3 pt-4">
          <Button variant="outline" onClick={() => setStep("info")}>
            {t("common.back")}
          </Button>
          <Button
            disabled={!allChecksDone || !candidateName.trim() || updateNameMutation.isLoading}
            onClick={async () => {
              if (candidateName.trim()) {
                try {
                  await updateNameMutation.mutateAsync({
                    sessionId: sessionId!,
                    participantName: candidateName.trim(),
                  });
                } catch (e) {
                  console.error("Failed to update candidate name from checklist next:", e);
                }
              }
              handleComplete();
            }}
          >
            {t("common.next")}
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {t("onboarding.chromeRecommended")}
        </p>
      </div>
    </div>
  );
}
