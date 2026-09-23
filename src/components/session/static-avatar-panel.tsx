"use client";

import { useEffect, useRef } from "react";
import { Mic, Volume2, WifiOff } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type AvatarDisplayStatus = "idle" | "listening" | "speaking" | "error";

interface StaticAvatarPanelProps {
  aiName: string;
  candidateName: string;
  status: AvatarDisplayStatus;
  cameraStream?: MediaStream | null;
  error?: string | null;
  compactMode?: boolean;
  className?: string;
}

export function StaticAvatarPanel({
  aiName,
  candidateName,
  status,
  cameraStream,
  error,
  compactMode = false,
  className = "",
}: StaticAvatarPanelProps) {
  const isSpeaking = status === "speaking";
  const isListening = status === "listening";
  const isError = status === "error";
  
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      if (videoRef.current.srcObject !== cameraStream) {
        videoRef.current.srcObject = cameraStream;
      }
    }
  }, [cameraStream]);

  return (
    <div
      className={`relative flex w-full h-full overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10 ${className}`}
    >
      {isError ? (
        <div className="flex flex-col items-center justify-center w-full h-full gap-3 p-4">
          <WifiOff className="h-10 w-10 text-red-400" />
          <p className="text-xs text-zinc-400 text-center">{error ?? "Avatar unavailable"}</p>
        </div>
      ) : (
        <div className={compactMode ? "flex w-full h-full" : "flex flex-row w-full h-full gap-2 md:gap-4 p-2 md:p-4"}>
          
          {/* AI View (Left) */}
          <div className={cn("relative flex-1 bg-zinc-900 overflow-hidden flex flex-col items-center justify-center rounded-xl md:rounded-2xl transition-all duration-300", isSpeaking && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]")}>
            <Image 
              src="/avatars/woman-v1.png"
              alt={aiName}
              fill
              className="object-cover"
            />
            
            {/* Dark overlay when listening to highlight the speaking state */}
            <div className={`absolute inset-0 bg-black transition-opacity duration-300 ${isSpeaking ? 'opacity-0' : 'opacity-30'}`} />

            <div className="absolute bottom-4 left-4 flex flex-col items-start gap-2">
              <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-md">
                <span className="text-xs font-medium text-white">{aiName}</span>
                {isSpeaking && (
                  <div className="ml-1 flex items-end gap-0.5 h-3">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="w-0.5 rounded-full bg-green-400 inline-block"
                        style={{
                          animation: `staticWave 0.5s ease-in-out ${i * 0.15}s infinite alternate`,
                          height: "100%",
                        }}
                      />
                    ))}
                  </div>
                )}
                {isListening && (
                  <Mic className="h-3 w-3 text-blue-400 animate-pulse ml-1" />
                )}
              </div>
            </div>
          </div>

          {/* Candidate View (Right) - Only show if not in compact mode */}
          {!compactMode && (
            <div className={cn("relative flex-1 bg-zinc-900 overflow-hidden flex flex-col items-center justify-center rounded-xl md:rounded-2xl transition-all duration-300", isListening && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]")}>
              {/* Display Candidate initials/name placeholder instead of video */}
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800 text-3xl font-semibold text-zinc-400">
                {candidateName ? candidateName.charAt(0).toUpperCase() : "C"}
              </div>
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-md">
                <span className="text-xs font-medium text-white">{candidateName || "Candidate"}</span>
                <Mic className="h-3 w-3 text-zinc-400 ml-1" />
              </div>
            </div>
          )}
          
        </div>
      )}

      {/* CSS keyframes */}
      <style>{`
        @keyframes staticWave {
          from { transform: scaleY(0.4); opacity: 0.5; }
          to   { transform: scaleY(1.0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
