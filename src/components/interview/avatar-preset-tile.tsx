"use client";

import { useEffect, useRef, useState } from "react";
import type { AvatarPreset } from "@/lib/avatar-voices";
import { cn } from "@/lib/utils";

type AvatarPresetTileProps = {
  preset: AvatarPreset;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  className?: string;
  labelClassName?: string;
};

/**
 * Preset grid tile: still PNG by default; plays matching MP4 once (with audio) on select.
 * Clicking an already-selected preset replays from the start. Does not loop.
 * Only the selected tile mounts a <video>; others stay on stills so playback cannot
 * bleed into a neighboring tile. Still PNGs stay on the preset for Runware `frameImages`.
 */
export function AvatarPresetTile({
  preset,
  selected,
  disabled,
  onSelect,
  className,
  labelClassName,
}: AvatarPresetTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Incremented on each click; video mounts only while selected && playGeneration > 0. */
  const [playGeneration, setPlayGeneration] = useState(0);

  // Deselect: drop video mount and reset so a later re-select starts clean.
  useEffect(() => {
    if (selected) return;
    setPlayGeneration(0);
  }, [selected]);

  // Play / replay whenever this tile is selected and the user clicked (generation bump).
  useEffect(() => {
    if (!selected || playGeneration === 0) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    el.currentTime = 0;
    void el.play().catch(() => {
      /* autoplay / gesture policies */
    });
  }, [selected, playGeneration, preset.videoPath]);

  const handleClick = () => {
    if (disabled) return;
    onSelect();
    setPlayGeneration((g) => g + 1);
  };

  const showVideo = selected && playGeneration > 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "group relative isolate overflow-hidden rounded-xl border-2 bg-muted text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        selected
          ? "border-primary ring-2 ring-primary/30 shadow-md"
          : "border-transparent hover:border-primary/40",
        className,
      )}
      aria-pressed={selected}
      aria-label={`${preset.label}, ${preset.voice}`}
    >
      {/* Nested clip box: widescreen MP4s (object-cover) cannot spill into adjacent grid cells */}
      <div className="relative aspect-square w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- public preset stills */}
          <img
            key={`${preset.id}-still`}
            src={preset.imagePath}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6">
        <p
          className={cn(
            "truncate text-[11px] font-medium text-white leading-tight",
            labelClassName,
          )}
        >
          {preset.voice.replace(/ \(.+\)$/, "")}
        </p>
      </div>
    </button>
  );
}
