"use client";

/**
 * HeygenAvatarPanel — LiveAvatar LITE Mode video component
 *
 * Renders the AI interviewer avatar video stream with status overlays.
 * Designed to be placed in the top-left of the VoiceInterface.
 */

import { useEffect } from "react";
import { Loader2, Mic, Volume2, Wifi, WifiOff } from "lucide-react";
import type { AvatarStatus } from "@/hooks/use-heygen-avatar";

interface HeygenAvatarPanelProps {
  status: AvatarStatus;
  videoRef: React.RefObject<HTMLVideoElement>;
  aiName: string;
  error: string | null;
  className?: string;
}

function StatusBadge({ status }: { status: AvatarStatus }) {
  const config = {
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
    <div
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur-sm ${cfg.color}`}
    >
      {cfg.icon}
      <span>{cfg.label}</span>
    </div>
  );
}

export function HeygenAvatarPanel({
  status,
  videoRef,
  aiName,
  error,
  className = "",
}: HeygenAvatarPanelProps) {
  // Auto-play when src is set
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => { video.play().catch(() => {}); };
    video.addEventListener("loadedmetadata", handler);
    return () => video.removeEventListener("loadedmetadata", handler);
  }, [videoRef]);

  const isLoading = status === "connecting";
  const hasError = status === "error";

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/10 ${className}`}
      style={{ aspectRatio: "9/16", maxWidth: "240px", minWidth: "180px" }}
    >
      {/* Avatar Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className={`h-full w-full object-cover transition-opacity duration-500 ${
          status === "ready" || status === "speaking" || status === "listening"
            ? "opacity-100"
            : "opacity-0"
        }`}
      />

      {/* Loading State Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900">
          {/* Animated avatar silhouette */}
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
            <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white">{aiName}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Initializing avatar...</p>
          </div>
        </div>
      )}

      {/* Error State Overlay */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900 p-4">
          <WifiOff className="h-8 w-8 text-red-400" />
          <p className="text-center text-xs text-zinc-400">
            {error ?? "Avatar unavailable"}
          </p>
          <p className="text-center text-xs text-zinc-600">
            Audio-only mode active
          </p>
        </div>
      )}

      {/* Idle/Disconnected placeholder */}
      {(status === "idle" || status === "disconnected") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-2xl font-bold text-white">
            {aiName.charAt(0).toUpperCase()}
          </div>
          <p className="text-sm font-medium text-zinc-300">{aiName}</p>
        </div>
      )}

      {/* Status Badge — top-right overlay */}
      <div className="absolute top-2 right-2">
        <StatusBadge status={status} />
      </div>

      {/* AI Name — bottom overlay */}
      {(status === "ready" || status === "speaking" || status === "listening") && (
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
