"use client";

/**
 * SimliAvatarPanel — Simli real-time lip-sync avatar UI component
 * Drop-in replacement for HeygenAvatarPanel.
 * Simli requires both a <video> and <audio> element.
 */

import { useEffect } from "react";
import { Loader2, Mic, Volume2, WifiOff } from "lucide-react";
import type { AvatarStatus } from "@/hooks/use-simli-avatar";

interface SimliAvatarPanelProps {
  status: AvatarStatus;
  videoRef: React.RefObject<HTMLVideoElement>;
  audioRef: React.RefObject<HTMLAudioElement>;
  aiName: string;
  error: string | null;
  className?: string;
  /** Parent session speaking flag — show video ASAP even before Simli status flips. */
  isSpeaking?: boolean;
  /** LiveKit still has a playable video track. */
  mediaLive?: boolean;
}

function StatusBadge({ status }: { status: AvatarStatus }) {
  const config: Record<AvatarStatus, { icon: React.ReactNode; label: string; color: string } | null> = {
    idle: null,
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
      icon: <WifiOff className="h-3 w-3" />,
      label: "Disconnected",
      color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
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

export function SimliAvatarPanel({
  status,
  videoRef,
  audioRef,
  aiName,
  error,
  className = "",
  isSpeaking = false,
  mediaLive = false,
}: SimliAvatarPanelProps) {
  // Video stays muted (audio lives on the <audio> element). Heard audio is
  // Simli's LiveKit track — the same stream that drives lipsync.
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.muted = true;
      video.volume = 0;
    }
    if (audio) {
      audio.muted = false;
      audio.volume = 1;
    }
  }, [videoRef, audioRef, status]);

  // Auto-play as soon as any media arrives — do not wait for a long buffer.
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    const tryPlay = () => {
      if (video) {
        video.muted = true;
        void video.play().catch(() => {});
      }
      if (audio) {
        audio.muted = false;
        audio.volume = 1;
        void audio.play().catch(() => {});
      }
    };
    tryPlay();
    const targets: HTMLMediaElement[] = [video, audio].filter(
      (el): el is HTMLVideoElement | HTMLAudioElement => !!el,
    );
    for (const el of targets) {
      el.addEventListener("loadedmetadata", tryPlay);
      el.addEventListener("loadeddata", tryPlay);
      el.addEventListener("canplay", tryPlay);
      el.addEventListener("playing", tryPlay);
    }
    return () => {
      for (const el of targets) {
        el.removeEventListener("loadedmetadata", tryPlay);
        el.removeEventListener("loadeddata", tryPlay);
        el.removeEventListener("canplay", tryPlay);
        el.removeEventListener("playing", tryPlay);
      }
    };
  }, [videoRef, audioRef, status, isSpeaking]);

  const displayStatus: AvatarStatus =
    status === "error" || status === "disconnected" || status === "idle"
      ? status
      : mediaLive
        ? status
        : "connecting";
  const isLoading = displayStatus === "connecting";
  const hasError = displayStatus === "error";
  const isLive =
    mediaLive &&
    (status === "ready" ||
      status === "speaking" ||
      status === "listening" ||
      (isSpeaking && status !== "idle" && status !== "disconnected" && status !== "error"));
  const showSpeaking = mediaLive && (status === "speaking" || isSpeaking);

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/10 ${className}`}
    >
      {/* Heard audio is Simli's LiveKit track (synced with the video lips). */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      {/* Avatar Video — visible as soon as LiveKit attaches; no multi-second opacity gate */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover transition-opacity duration-150 ${
          isLive || isLoading ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Loading State — keep video underneath so first frames show through */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900/40 pointer-events-none">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
            <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white">{aiName}</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {status === "ready" || status === "speaking" || status === "listening"
                ? "Reconnecting avatar..."
                : "Initializing avatar..."}
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900 p-4">
          <WifiOff className="h-8 w-8 text-red-400" />
          <p className="text-center text-xs text-zinc-400">{error ?? "Avatar unavailable"}</p>
          <p className="text-center text-xs text-zinc-600">Audio-only mode active</p>
        </div>
      )}

      {/* Idle/Disconnected placeholder */}
      {(status === "idle" || status === "disconnected") && !isSpeaking && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-2xl font-bold text-white">
            {aiName.charAt(0).toUpperCase()}
          </div>
          <p className="text-sm font-medium text-zinc-300">{aiName}</p>
        </div>
      )}

      {/* Status Badge */}
      <div className="absolute top-2 right-2">
        <StatusBadge status={showSpeaking && displayStatus !== "error" ? "speaking" : displayStatus} />
      </div>

      {/* Name overlay */}
      {(isLive || showSpeaking) && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2.5">
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
