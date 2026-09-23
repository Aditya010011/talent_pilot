"use client";

import { useCallback, useEffect } from "react";
import { Loader2, Mic, Volume2, WifiOff } from "lucide-react";
import type { AvatarStatus } from "@/hooks/use-simli-avatar";
import { DEFAULT_VIDU_AVATAR_PATH } from "@/lib/vidu-client";

interface ViduS1PanelProps {
  status: AvatarStatus;
  videoRef: React.RefObject<HTMLVideoElement>;
  aiName: string;
  error: string | null;
  className?: string;
  /** Static still shown before Live connects (no credit cost). */
  previewImageUrl?: string;
  /** Called when the live <video> mounts/remounts so AliRTC can rebind. */
  onVideoElementReady?: () => void;
  /** Keep the still image (no Vidu Live) — Gemini speaks separately. */
  staticOnly?: boolean;
}

function StatusBadge({ status }: { status: AvatarStatus }) {
  const config: Record<AvatarStatus, { icon: React.ReactNode; label: string; color: string } | null> = {
    idle: {
      icon: <span className="h-2 w-2 rounded-full bg-zinc-400" />,
      label: "Preview",
      color: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
    },
    connecting: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Connecting...",
      color: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    },
    ready: {
      icon: <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />,
      label: "Ready",
      color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    speaking: {
      icon: <Volume2 className="h-3 w-3" />,
      label: "Speaking",
      color: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    },
    listening: {
      icon: <Mic className="h-3 w-3" />,
      label: "Listening",
      color: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    },
    error: {
      icon: <WifiOff className="h-3 w-3" />,
      label: "Offline",
      color: "bg-red-500/20 text-red-300 border-red-500/30",
    },
    disconnected: {
      icon: <span className="h-2 w-2 rounded-full bg-zinc-400" />,
      label: "Preview",
      color: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
    },
  };

  const cfg = config[status];
  if (!cfg) return null;

  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur-sm ${cfg.color}`}>
      {cfg.icon}
      <span>{cfg.label}</span>
    </div>
  );
}

export function ViduS1Panel({
  status,
  videoRef,
  aiName,
  error,
  className = "",
  previewImageUrl = DEFAULT_VIDU_AVATAR_PATH,
  onVideoElementReady,
  staticOnly = false,
}: ViduS1PanelProps) {
  const setVideoNode = useCallback(
    (node: HTMLVideoElement | null) => {
      (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
      if (node) onVideoElementReady?.();
    },
    [videoRef, onVideoElementReady],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => { video.play().catch(() => {}); };
    video.addEventListener("loadedmetadata", handler);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        video.play().catch(() => {});
        onVideoElementReady?.();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      video.removeEventListener("loadedmetadata", handler);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [videoRef, onVideoElementReady, status]);

  const isLoading = status === "connecting";
  const hasError = status === "error";
  const isLive = !staticOnly && (status === "ready" || status === "speaking" || status === "listening");
  // Keep still only for true idle/error — not while connecting (first RTC frames should show).
  const showStaticPreview = staticOnly || (!isLive && !hasError && !isLoading);

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/10 ${className}`}
      style={{ aspectRatio: "16/9" }}
    >
      <video
        ref={setVideoNode}
        autoPlay
        playsInline
        // Unmuted — Vidu's A/V arrive together after video attach unmutes remote audio.
        muted={false}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${isLive || isLoading ? "opacity-100" : "opacity-0"}`}
      />

      {showStaticPreview && (
        <div className="absolute inset-0 z-[1]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImageUrl}
            alt={`${aiName} preview`}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-3">
            <p className="text-xs font-semibold text-white">{aiName}</p>
            <p className="mt-0.5 text-[10px] text-zinc-300">
              {isLoading
                ? "Starting live Premium avatar…"
                : staticOnly
                  ? "Premium · Gemini interviewer (avatar still)"
                  : "Static preview — live avatar starts when you begin the interview"}
            </p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 bg-zinc-950/50 backdrop-blur-[2px]">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/20" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          </div>
          <p className="text-xs text-zinc-200">Connecting Vidu S1…</p>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-zinc-900 p-4">
          <WifiOff className="h-8 w-8 text-red-400" />
          <p className="text-center text-xs text-zinc-400">{error ?? "Avatar unavailable"}</p>
          <p className="text-center text-xs text-zinc-600">Audio-only mode active</p>
        </div>
      )}

      <div className="absolute top-2 right-2 z-[3]">
        <StatusBadge status={status} />
      </div>

      {isLive && (
        <div className="absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/70 to-transparent px-3 py-2.5">
          <p className="text-xs font-semibold text-white">{aiName}</p>
        </div>
      )}



      <style jsx>{`
        @keyframes waveBar {
          from { transform: scaleY(0.5); opacity: 0.5; }
          to   { transform: scaleY(1.5); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
