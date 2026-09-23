"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clampMediaRect,
  resolveMediaRect,
  type SlideMedia,
  type SlideMediaRect,
} from "@/lib/slide-media";

type Handle = "nw" | "ne" | "sw" | "se";

interface SlideMediaOverlayProps {
  media: SlideMedia;
  editable?: boolean;
  autoPlay?: boolean;
  /**
   * How to fit <video> content inside the slide rect.
   * - `cover` keeps the video filling the frame (can feel "zoomed in")
   * - `contain` fits the full frame (can introduce letterboxing)
   */
  videoObjectFit?: "cover" | "contain";
  className?: string;
  onChange?: (rect: SlideMediaRect) => void;
  onVideoEnded?: () => void;
  onVideoError?: () => void;
}

export function SlideMediaOverlay({
  media,
  editable = false,
  autoPlay = false,
  videoObjectFit = "cover",
  className,
  onChange,
  onVideoEnded,
  onVideoError,
}: SlideMediaOverlayProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onVideoEndedRef = useRef(onVideoEnded);
  const onVideoErrorRef = useRef(onVideoError);
  onVideoEndedRef.current = onVideoEnded;
  onVideoErrorRef.current = onVideoError;
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [rect, setRect] = useState<SlideMediaRect>(() =>
    resolveMediaRect({ x: media.x, y: media.y, w: media.w, h: media.h }),
  );
  const dragRef = useRef<{
    kind: "move" | Handle;
    startX: number;
    startY: number;
    origin: SlideMediaRect;
  } | null>(null);

  useEffect(() => {
    setRect(resolveMediaRect({ x: media.x, y: media.y, w: media.w, h: media.h }));
  }, [media.url, media.x, media.y, media.w, media.h]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || media.type !== "video") return;
    el.loop = false;
    setIsVideoPlaying(false);
    if (!autoPlay) return;
    const tryPlay = el.play();
    if (tryPlay && typeof tryPlay.catch === "function") {
      tryPlay.catch(() => {
        el.muted = true;
        el.play().catch(() => onVideoErrorRef.current?.());
      });
    }
  }, [autoPlay, media.type, media.url]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const dx = ((e.clientX - drag.startX) / bounds.width) * 100;
    const dy = ((e.clientY - drag.startY) / bounds.height) * 100;
    const o = drag.origin;

    let next: SlideMediaRect;
    if (drag.kind === "move") {
      next = { ...o, x: o.x + dx, y: o.y + dy };
    } else if (drag.kind === "se") {
      next = { ...o, w: o.w + dx, h: o.h + dy };
    } else if (drag.kind === "ne") {
      next = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
    } else if (drag.kind === "sw") {
      next = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
    } else {
      next = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
    }
    setRect(clampMediaRect(next));
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    setRect((current) => {
      const clamped = clampMediaRect(current);
      onChange?.(clamped);
      return clamped;
    });
  }, [onChange, onPointerMove]);

  const startDrag = (kind: "move" | Handle, e: React.PointerEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      origin: rect,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const handleVideoEnded = () => {
    const el = videoRef.current;
    if (el) {
      el.loop = false;
      el.pause();
    }
    setIsVideoPlaying(false);
    onVideoEndedRef.current?.();
  };

  const togglePlayback = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    el.loop = false;
    if (el.paused || el.ended) {
      if (el.ended) el.currentTime = 0;
      el.play()
        .then(() => setIsVideoPlaying(true))
        .catch(() => onVideoErrorRef.current?.());
    } else {
      el.pause();
      setIsVideoPlaying(false);
    }
  };

  const handles: Handle[] = ["nw", "ne", "sw", "se"];
  const handlePos: Record<Handle, string> = {
    nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
    ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
    sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
    se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  };

  return (
    <div ref={canvasRef} className={cn("absolute inset-0 z-[5]", className)}>
      <div
        className={cn(
          "absolute overflow-hidden bg-black",
          editable
            ? "rounded-md shadow-md ring-2 ring-primary/80 cursor-move"
            : "rounded-[inherit]",
        )}
        style={{
          left: `${rect.x}%`,
          top: `${rect.y}%`,
          width: `${rect.w}%`,
          height: `${rect.h}%`,
        }}
        onPointerDown={(e) => startDrag("move", e)}
      >
        {media.type === "video" ? (
          <video
            ref={videoRef}
            src={media.url}
            className={cn(
              "h-full w-full pointer-events-none select-none",
              videoObjectFit === "contain" ? "object-contain" : "object-cover",
            )}
            autoPlay={autoPlay}
            muted={!autoPlay && !editable}
            playsInline
            controls={false}
            preload={editable ? "auto" : "metadata"}
            onPlay={() => setIsVideoPlaying(true)}
            onPause={() => {
              const el = videoRef.current;
              if (el && !el.ended) setIsVideoPlaying(false);
            }}
            onEnded={handleVideoEnded}
            onError={() => onVideoErrorRef.current?.()}
          />
        ) : (
          <img
            src={media.url}
            alt=""
            draggable={false}
            className="h-full w-full object-cover pointer-events-none select-none"
          />
        )}
        {media.type === "video" && (editable || !autoPlay) && (
          <button
            type="button"
            aria-label={isVideoPlaying ? "Pause video" : "Play video"}
            className={cn(
              "absolute z-20 flex items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm hover:bg-black/70 hover:scale-105 transition-all pointer-events-auto",
              isVideoPlaying
                ? "bottom-3 left-3 h-9 w-9"
                : "left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2",
            )}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={togglePlayback}
          >
            {isVideoPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-6 w-6 ml-0.5 fill-current" />
            )}
          </button>
        )}
        {editable &&
          handles.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={`Resize ${h}`}
              className={cn(
                "absolute z-10 h-3 w-3 rounded-sm border border-white bg-primary shadow",
                handlePos[h],
              )}
              onPointerDown={(e) => startDrag(h, e)}
            />
          ))}
      </div>
    </div>
  );
}
