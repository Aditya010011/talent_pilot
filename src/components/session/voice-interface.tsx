"use client";

import { trpc } from "@/lib/trpc/client";
import {
    CodeEditorCanvas,
    type CodeEditorCanvasRef,
} from "@/components/code-editor/code-editor-canvas";
import { IntervieweeHelpPopover } from "@/components/session/interviewee-help-popover";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    WhiteboardCanvas,
    type WhiteboardCanvasRef,
} from "@/components/whiteboard/whiteboard-canvas";
import { useInterviewRecording } from "@/hooks/use-interview-recording";
import { useFaceAnalysis } from "@/hooks/use-face-analysis";
import { useSimliAvatar } from "@/hooks/use-simli-avatar";
import { SimliAvatarPanel } from "@/components/session/simli-avatar-panel";
import { useViduS1 } from "@/hooks/use-vidu-s1";
import { ViduS1Panel } from "@/components/session/vidu-s1-panel";
import { StaticAvatarPanel } from "@/components/session/static-avatar-panel";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOrientation } from "@/hooks/use-orientation";
import { useToast } from "@/hooks/use-toast";
import { getVideoConstraints } from "@/lib/video-constraints";
import { isTap } from "@/components/session/pip-tap-detection";
import { useVoice, type InterviewContext } from "@/hooks/use-voice";
import {
    AlertCircle,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Clock,
    Code2,
    FileText,
    Loader2,
    Maximize2,
    MessageSquare,
    Mic,
    MicOff,
    PenLine,
    PhoneOff,
    Plus,
    Save,
    Send,
    SkipBack,
    SkipForward,
    Video,
    VideoOff,
    Volume2,
    X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { createLogger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import {
  completeSessionBeacon,
  completeSessionNow,
} from "@/lib/session-complete-client";
import { buildViduVerbatimLines } from "@/lib/vidu-script";
import {
  getStoredCameraStream,
  setStoredCameraStream,
} from "@/lib/media-stream-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
 
const log = createLogger("voice-interface");
const premiumLog = createLogger("premium-vidu");

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: "voice" | "chat";
}
function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasRecentAssistantTranscript(messages: Message[], text: string): boolean {
  const normalized = normalizeTranscript(text);
  if (!normalized) return false;

  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 6); i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    if (normalizeTranscript(message.content) === normalized) return true;
  }

  return false;
}

function isExpandedTranscript(previous: string, next: string): boolean {
  const prev = normalizeTranscript(previous);
  const curr = normalizeTranscript(next);
  if (!prev || !curr || prev === curr) return false;
  if (curr.length <= prev.length) return false;
  if (curr.includes(prev)) return true;

  const maxPrefix = Math.min(prev.length, curr.length);
  let prefixLen = 0;
  while (prefixLen < maxPrefix && prev[prefixLen] === curr[prefixLen]) {
    prefixLen++;
  }

  return prefixLen >= Math.min(24, Math.floor(prev.length * 0.7));
}

function looksLikeInterviewFarewell(text: string): boolean {
  const normalized = normalizeTranscript(text);
  if (!normalized || /[?？]/.test(normalized)) return false;

  return [
    /\bgood\s*bye\b/,
    /\bgoodbye\b/,
    /\bbye for now\b/,
    /\bhave a great day\b/,
    /\btake care\b/,
    /\bwrap up here\b/,
    /\bthat'?s all for now\b/,
    /\bthank(?:s| you)(?: so much)? for your time\b/,
    /\bi wish you all the best\b/,
    /\bbest moving forward\b/,
    /\bthat wraps up\b/,
    /\bwraps up our\b/,
    /\bbest in your .*journey\b/,
    /再见/,
    /保重/,
    /祝你/,
  ].some((pattern) => pattern.test(normalized));
}

function isBriefStandaloneVoiceUtterance(text: string): boolean {
  const normalized = normalizeTranscript(text);
  if (!normalized) return false;
  const words = normalized.split(" ").filter(Boolean);
  return words.length <= 3 && normalized.length <= 16;
}

function formatTranscriptText(text: string): string {
  if (!text) return text;
  return text
    .replace(/ai interviewer/gi, "Inluwa")
    .replace(/internscreenbot/gi, "Inluwa")
    .replace(/Kim iyi/gi, "Inluwa")
    // Keep brand as one word (LLM/TTS sometimes insert a space)
    .replace(/\bInlu\s+wa\b/gi, "Inluwa")
    .replace(/\bIn\s+lu\s+wa\b/gi, "Inluwa")
    .replace(/L LM/gi, "LLM")
    // Prefer plain punctuation for readable on-screen copy
    .replace(/[\u2014\u2013]/g, ", ")
    .replace(/\s*,\s*,+/g, ", ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\s+\?/g, "?")
    .replace(/\s+!/g, "!")
    .replace(/I 'm/gi, "I'm")
    .replace(/I 've/gi, "I've")
    .replace(/don 't/gi, "don't")
    .replace(/can 't/gi, "can't")
    .replace(/it 's/gi, "it's")
    .replace(/that 's/gi, "that's")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function findRecentVoiceTranscriptMatch(
  messages: Message[],
  nextText: string,
): { kind: "expanded" | "duplicate"; index: number } | null {
  const nextNormalized = normalizeTranscript(nextText);
  const nextIsBriefStandalone = isBriefStandaloneVoiceUtterance(nextText);
  if (!nextNormalized) return null;

  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 8); i--) {
    const message = messages[i];
    if (message.role !== "user" || (message.source && message.source !== "voice")) continue;
    const existingNormalized = normalizeTranscript(message.content);
    const existingIsBriefStandalone = isBriefStandaloneVoiceUtterance(message.content);
    if (!existingNormalized) continue;
    if (existingNormalized === nextNormalized) {
      return { kind: "duplicate", index: i };
    }
    if (nextIsBriefStandalone || existingIsBriefStandalone) {
      continue;
    }
    if (
      nextNormalized.includes(existingNormalized) ||
      existingNormalized.includes(nextNormalized)
    ) {
      return {
        kind: nextNormalized.length >= existingNormalized.length ? "expanded" : "duplicate",
        index: i,
      };
    }
    if (isExpandedTranscript(message.content, nextText)) {
      return { kind: "expanded", index: i };
    }
  }

  return null;
}

function findTrailingVoiceDuplicateCluster(
  messages: Message[],
  nextText: string,
): { start: number; end: number } | null {
  const nextNormalized = normalizeTranscript(nextText);
  if (!nextNormalized || isBriefStandaloneVoiceUtterance(nextText)) return null;

  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user" || (message.source && message.source !== "voice")) break;
    if (isBriefStandaloneVoiceUtterance(message.content)) return null;
    start = i;
  }

  if (start >= messages.length || messages.length - start < 2) return null;

  for (let i = start; i < messages.length; i++) {
    const candidate = normalizeTranscript(messages[i].content);
    if (!candidate) return null;
    if (!nextNormalized.includes(candidate)) return null;
  }

  return { start, end: messages.length - 1 };
}

function upsertFinalVoiceTranscript(messages: Message[], text: string): Message[] {
  const nextMessage = {
    id: crypto.randomUUID(),
    role: "user" as const,
    content: text,
    source: "voice" as const,
  };

  const duplicateCluster = findTrailingVoiceDuplicateCluster(messages, text);
  if (duplicateCluster) {
    return [...messages.slice(0, duplicateCluster.start), nextMessage];
  }

  const recentMatch = findRecentVoiceTranscriptMatch(messages, text);
  if (recentMatch?.kind === "duplicate") {
    const prior = messages[recentMatch.index];
    const replacement =
      text.length > prior.content.length ? { ...prior, content: text } : prior;
    return [
      ...messages.slice(0, recentMatch.index),
      replacement,
      ...messages.slice(recentMatch.index + 1),
    ];
  }

  if (recentMatch?.kind === "expanded") {
    const prior = messages[recentMatch.index];
    const replacement =
      text.length >= prior.content.length
        ? { ...prior, content: text }
        : prior;
    return [
      ...messages.slice(0, recentMatch.index),
      replacement,
      ...messages.slice(recentMatch.index + 1),
    ];
  }

  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.source === "voice") {
    const lastNormalized = normalizeTranscript(last.content);
    const nextNormalized = normalizeTranscript(text);
    if (!nextNormalized) return messages;
    if (lastNormalized === nextNormalized) return messages;
    if (nextNormalized.includes(lastNormalized)) {
      return [
        ...messages.slice(0, -1),
        { ...last, content: text },
      ];
    }
    if (lastNormalized.includes(nextNormalized)) {
      return messages;
    }
    // Keep a single coherent "pre-send" user turn by concatenating
    // consecutive voice chunks until the assistant responds.
    return [
      ...messages.slice(0, -1),
      {
        ...last,
        content: `${last.content.replace(/\s+$/g, "")} ${text.replace(/^\s+/g, "")}`.replace(/\s+/g, " ").trim(),
      },
    ];
  }

  if (last?.role === "user" && last.source === "chat") {
    // Never merge typed chat messages into voice transcript blobs.
    return [...messages, nextMessage];
  }

  if (last?.role === "user" && !last.source) {
    if (
      !isBriefStandaloneVoiceUtterance(last.content) &&
      !isBriefStandaloneVoiceUtterance(text) &&
      isExpandedTranscript(last.content, text)
    ) {
      const replacement =
        text.length >= last.content.length ? nextMessage : { ...last };
      return [...messages.slice(0, -1), replacement];
    }
  }

  const assistantIdx = messages.length - 1;
  const priorUserIdx = messages.length - 2;
  if (
    assistantIdx >= 0 &&
    priorUserIdx >= 0 &&
    messages[assistantIdx]?.role === "assistant" &&
    messages[priorUserIdx]?.role === "user" &&
    messages[priorUserIdx]?.source === "voice" &&
    !isBriefStandaloneVoiceUtterance(messages[priorUserIdx].content) &&
    !isBriefStandaloneVoiceUtterance(text) &&
    isExpandedTranscript(messages[priorUserIdx].content, text)
  ) {
    const replacement =
      text.length >= messages[priorUserIdx].content.length
        ? { ...messages[priorUserIdx], content: text }
        : messages[priorUserIdx];
    return [
      ...messages.slice(0, priorUserIdx),
      replacement,
      ...messages.slice(priorUserIdx + 1),
    ];
  }

  return [...messages, nextMessage];
}

function svgToPngDataUrl(svgDataUrl: string, maxWidth = 1024): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) { resolve(null); return; }
      ctx2d.fillStyle = "#fff";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = svgDataUrl;
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function DraggablePip({
  children,
  onTap,
  swapStyle,
}: {
  children: React.ReactNode;
  onTap?: () => void;
  swapStyle?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const [pos, setPos] = useState({ right: 16, bottom: 100 });
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    container.setPointerCapture(e.pointerId);
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.right,
      origY: pos.bottom,
    };
    setIsDragging(true);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos({
      right: Math.max(0, dragState.current.origX - dx),
      bottom: Math.max(0, dragState.current.origY - dy),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    containerRef.current?.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    if (onTap && isTap({ startX: dragState.current.startX, startY: dragState.current.startY, endX: e.clientX, endY: e.clientY })) {
      onTap();
    }
  }, [onTap]);

  return (
    <div
      ref={containerRef}
      className="absolute z-40 overflow-hidden rounded-lg border bg-black shadow-lg select-none"
      style={{
        right: pos.right,
        bottom: pos.bottom,
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
        ...swapStyle,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
    </div>
  );
}

interface VoiceInterfaceProps {
  sessionId: string;
  interviewId: string;
  interviewTitle: string;
  aiName: string;
  questionCount: number;
  interviewContext: InterviewContext;
  durationMinutes?: number;
  initialMessages?: Array<{ id: string; role: string; content: string }>;
  initialDrawings?: Array<{ id: string; label: string; snapshotData: string }>;
  chatEnabled?: boolean;
  whiteboardEnabled?: boolean;
  codeEnabled?: boolean;
  onComplete?: () => void;
  /** 'simli' = live Simli video, 'static' = animated orb, 'none' = audio-only */
  avatarMode?: "none" | "static" | "simli" | "vidu";
  /** Legacy alias kept for backward compat — true maps to avatarMode='simli' */
  videoMode?: boolean;
  /** Render in static preview mode — shows full layout without connecting */
  preview?: boolean;
  /** Optional per-interview Simli face id; falls back to env SIMLI_FACE_ID. */
  simliFaceId?: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────
const MIN_PANEL_WIDTH = 260;
const DEFAULT_RIGHT_WIDTH = 380;
const COLLAPSED_RIGHT_DOCK_WIDTH = 56;

export function VoiceInterface({
  sessionId,
  interviewId,
  interviewTitle,
  aiName: _aiName,
  questionCount,
  interviewContext,
  durationMinutes,
  initialMessages,
  initialDrawings,
  chatEnabled = false,
  whiteboardEnabled = true,
  codeEnabled = true,
  onComplete,
  avatarMode: avatarModeProp = "none",
  videoMode = false,
  preview = false,
  simliFaceId = null,
}: VoiceInterfaceProps) {
  // Enforce Inluwa as the bot name
  const aiName = "Inluwa";
  // Resolve effective avatar mode: legacy videoMode=true maps to simli
  const avatarMode = videoMode ? "simli" : avatarModeProp;
  const isInteractiveVideoAvatar = avatarMode === "simli" || avatarMode === "vidu";
  const useZoomLayout = avatarMode === "none";
  // Simli also uses a zoom-style side-by-side layout (AI tile | candidate tile)
  const useSimliZoom = avatarMode === "simli";
  // WhatsApp-style big/mini swap: which tile (avatar vs. candidate camera) is full-stage.
  const [swapped, setSwapped] = useState(false);
  // Desktop-only toggle into the same big/mini swap layout ("theater mode"). Session-only, no persistence.
  const [theaterMode, setTheaterMode] = useState(false);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isMobile = useIsMobile();
  const { portrait } = useOrientation();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>(
    () =>
      initialMessages?.map((m) => ({
        id: m.id,
        role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      })) ?? [],
  );
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [locallyCompleted, setLocallyCompleted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isStartingInterview, setIsStartingInterview] = useState(false);
  const [desktopTranscriptCollapsed, setDesktopTranscriptCollapsed] = useState(false);
  const [mobileTranscriptCollapsed, setMobileTranscriptCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [whiteboardActive, setWhiteboardActive] = useState(false);
  const [codeEditorActive, setCodeEditorActive] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [splitPercent, setSplitPercent] = useState(35);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const voiceSplitContainerRef = useRef<HTMLDivElement>(null);
  const whiteboardRef = useRef<WhiteboardCanvasRef>(null);
  const codeEditorRef = useRef<CodeEditorCanvasRef>(null);
  const liveCodeSnapshotRef = useRef<string | null>(null);
  const lastFinalTranscriptRef = useRef("");
  const handleEndInterviewRef = useRef<() => void>(() => {});
  const endingRef = useRef(false);
  const saveRecordingMutation = trpc.session.saveRecording.useMutation();

  // ── Countdown timer state ────────────────────────────────────────
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerExpiredRef = useRef(false);
  const timerStartedRef = useRef(false);
  const timerDeadlineRef = useRef<number | null>(null);
  

  const formatRecordingTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Multiple drawings state ───────────────────────────────────
  interface Drawing {
    id: string;
    label: string;
    snapshotData: string | null;
  }
  const [drawings, setDrawings] = useState<Drawing[]>(
    () =>
      initialDrawings?.length
        ? initialDrawings.map((d) => ({
            id: d.id,
            label: d.label,
            snapshotData: d.snapshotData,
          }))
        : [{ id: crypto.randomUUID(), label: "Drawing 1", snapshotData: null }],
  );
  const [activeDrawingIdx, setActiveDrawingIdx] = useState(0);

  // ── Multiple code snippets state ────────────────────────────────
  interface CodeSnippet {
    id: string;
    label: string;
    snapshotData: string | null;
  }
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([
    { id: crypto.randomUUID(), label: "Snippet 1", snapshotData: null },
  ]);
  const [activeSnippetIdx, setActiveSnippetIdx] = useState(0);

  // ── Per-question content map (save/restore on question switch) ──
  interface QuestionContent {
    drawings: Drawing[];
    activeDrawingIdx: number;
    codeSnippets: CodeSnippet[];
    activeSnippetIdx: number;
  }
  const questionContentMapRef = useRef<Map<number, QuestionContent>>(new Map());

  // ── Load saved whiteboard data when canvas first opens ────────
  const initialDrawingsLoadedRef = useRef(false);
  useEffect(() => {
    if (whiteboardActive && !initialDrawingsLoadedRef.current) {
      initialDrawingsLoadedRef.current = true;
      const activeDrawing = drawings[activeDrawingIdx];
      if (activeDrawing?.snapshotData) {
        // Small delay to let the Excalidraw canvas fully initialize
        const timer = setTimeout(() => {
          whiteboardRef.current?.loadScene(activeDrawing.snapshotData!);
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteboardActive]);

  // ── Persist drawings/code + mark session COMPLETED on tab close ──
  const drawingsRef = useRef(drawings);
  const activeDrawingIdxRef = useRef(activeDrawingIdx);
  drawingsRef.current = drawings;
  activeDrawingIdxRef.current = activeDrawingIdx;

  const codeSnippetsRef = useRef(codeSnippets);
  const activeSnippetIdxRef = useRef(activeSnippetIdx);
  codeSnippetsRef.current = codeSnippets;
  activeSnippetIdxRef.current = activeSnippetIdx;

  useEffect(() => {
    if (preview) return;

    const persistToolsBeacon = () => {
      const active = drawingsRef.current[activeDrawingIdxRef.current];
      if (active) {
        const wb = whiteboardRef.current;
        const snapshotData = wb?.getSnapshotData() ?? active.snapshotData;
        if (snapshotData) {
          const payload = { json: { sessionId, drawingId: active.id, label: active.label, snapshotData } };
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          navigator.sendBeacon("/api/trpc/session.saveWhiteboard", blob);
        }
      }

      const activeSnippet = codeSnippetsRef.current[activeSnippetIdxRef.current];
      if (activeSnippet) {
        const ce = codeEditorRef.current;
        const codeSnapshot = ce?.getSnapshotData() ?? activeSnippet.snapshotData;
        if (codeSnapshot) {
          const payload = { json: { sessionId, snippetId: activeSnippet.id, label: activeSnippet.label, snapshotData: codeSnapshot } };
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          navigator.sendBeacon("/api/trpc/session.saveCode", blob);
        }
      }
    };

    const markSessionCompletedBeacon = () => {
      // Always fire — endpoint is idempotent; never gate on speech/recording/endingRef
      completeSessionBeacon(sessionId);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!locallyCompleted && !preview) {
        e.preventDefault();
        e.returnValue = "Are you sure you want to leave? Your active recording is being finalized and will be lost if you exit.";
        return e.returnValue;
      }
    };

    const handlePageExit = () => {
      persistToolsBeacon();
      markSessionCompletedBeacon();
      // Best-effort full end (recording upload) — may be killed by the browser.
      if (!endingRef.current) {
        void handleEndInterviewRef.current();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageExit);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageExit);
    };
  }, [sessionId, preview, locallyCompleted]);

  // ── Draggable divider state (vertical — left/right panels) ──────
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // ── Draggable divider state (horizontal — transcript/chat) ─────
  const [chatSplitPercent, setChatSplitPercent] = useState(50);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const chatDragging = useRef(false);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    dragging.current = true;

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRight = rect.right - ev.clientX;
      setRightWidth(Math.max(MIN_PANEL_WIDTH, Math.min(newRight, rect.width - MIN_PANEL_WIDTH)));
    };

    const onUp = () => {
      dragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const onChatDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    chatDragging.current = true;

    const onMove = (ev: PointerEvent) => {
      if (!chatDragging.current || !rightPanelRef.current) return;
      const rect = rightPanelRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setChatSplitPercent(Math.min(Math.max(pct, 20), 80));
    };

    const onUp = () => {
      chatDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // Orientation is locked at session start; warn once if the device rotates mid-session.
  const initialPortraitRef = useRef(portrait);
  const rotationWarnedRef = useRef(false);
  useEffect(() => {
    if (!rotationWarnedRef.current && portrait !== initialPortraitRef.current) {
      rotationWarnedRef.current = true;
      toast({
        description:
          "Rotating your device may affect recording quality — keep it steady",
      });
    }
  }, [portrait, toast]);

  const createUploadUrl = trpc.session.createUploadUrl.useMutation();

  // ── Recording hook (all avatar modes — including static) ──────────
  const recording = useInterviewRecording({
    sessionId,
    enabled: !preview,
    getUploadUrl: async (bucket, path) => {
      return await createUploadUrl.mutateAsync({ bucket, path });
    },
  });

  // Same eye-contact / multi-face proctoring for interactive avatars AND
  // voice-only (Zoom tiles) and Simli zoom — candidate camera is on in all.
  const faceAnalysis = useFaceAnalysis({
    enabled: isInteractiveVideoAvatar || useZoomLayout || useSimliZoom,
    emotionServiceUrl: "/_emotion/analyze",
  });
  const faceProctoringActive = isInteractiveVideoAvatar || useZoomLayout || useSimliZoom;

  // ── Live digital human ─────────────────────────────────────────
  // Premium (vidu): Vidu Live only — its LLM + avatar + audio. No Gemini/Simli.
  // Video Avatar (simli): Gemini + Simli lipsync.
  const isPremiumVidu = avatarMode === "vidu";
  const avatar = useSimliAvatar({
    enabled: avatarMode === "simli",
    faceId: simliFaceId,
  });
  const avatarStatusRef = useRef(avatar.status);
  useEffect(() => {
    avatarStatusRef.current = avatar.status;
  }, [avatar.status]);

  const [viduLiveArmed, setViduLiveArmed] = useState(false);
  const [viduListening, setViduListening] = useState(false);
  const [viduQuestionIndex, setViduQuestionIndex] = useState(0);
  const viduPcmChunksRef = useRef<Int16Array[]>([]);
  const viduMicCleanupRef = useRef<(() => void) | null>(null);

  const sortedViduQuestions = useMemo(
    () => interviewContext.questions.slice().sort((a, b) => a.order - b.order),
    [interviewContext.questions],
  );

  const vidu = useViduS1({
    enabled: isPremiumVidu && viduLiveArmed,
    aiName,
    title: interviewTitle,
    objective: interviewContext.objective,
    questions: sortedViduQuestions.map((q) => ({
      text: q.text,
      type: q.type,
      description: q.description,
      options: q.options,
    })),
    language: interviewContext.language,
    aiTone: interviewContext.aiTone,
    followUpDepth: interviewContext.followUpDepth,
    participantName: interviewContext.participantName,
  });

  /** On-screen script = same verbatim lines embedded in Vidu's persona. */
  const viduScriptLines = useMemo(
    () =>
      buildViduVerbatimLines({
        aiName,
        participantName: interviewContext.participantName,
        questions: sortedViduQuestions.map((q) => ({ text: q.text })),
      }),
    [aiName, interviewContext.participantName, sortedViduQuestions],
  );

  const viduDisplayScript = useMemo(() => {
    const line = viduScriptLines[viduQuestionIndex];
    return line || viduScriptLines[viduScriptLines.length - 1] || "";
  }, [viduScriptLines, viduQuestionIndex]);

  useEffect(() => {
    if (!isPremiumVidu) return;
    premiumLog.info("script display", {
      index: viduQuestionIndex,
      total: viduScriptLines.length,
      text: viduDisplayScript.slice(0, 160),
    });
  }, [isPremiumVidu, viduQuestionIndex, viduScriptLines.length, viduDisplayScript]);

  const cameraPipRef = useRef<HTMLVideoElement>(null);
  const zoomCameraVideoRef = useRef<HTMLVideoElement>(null);
  const [previewCameraStream, setPreviewCameraStream] = useState<MediaStream | null>(null);

  // Acquire webcam early for all take modes so video is on by default
  // before recording.start() runs on connect (Zoom tile / PIP / static panel).
  useEffect(() => {
    let cancelled = false;
    let owned: MediaStream | null = null;

    async function setupCamera() {
      const stored = getStoredCameraStream();
      if (stored?.active) {
        stored.getVideoTracks().forEach((t) => {
          t.enabled = true;
        });
        if (!cancelled) setPreviewCameraStream(stored);
        return;
      }
      // Always try — even if onboarding skipped camera (permission may still be granted).
      try {
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", ...getVideoConstraints(portrait) },
          audio: false,
        });
        if (cancelled) {
          cam.getTracks().forEach((t) => t.stop());
          return;
        }
        owned = cam;
        cam.getVideoTracks().forEach((t) => {
          t.enabled = true;
          t.addEventListener("ended", () => {
            // Track died (device switch / second getUserMedia) — clear so we re-acquire.
            if (!cancelled) {
              setPreviewCameraStream((prev) => (prev === cam ? null : prev));
            }
          });
        });
        setPreviewCameraStream(cam);
        // Prefer reuse by recording.acquireStreams() over opening a second track.
        setStoredCameraStream(cam);
      } catch {
        /* camera optional for preview — tile shows placeholder */
      }
    }

    void setupCamera();
    return () => {
      cancelled = true;
      // Don't stop tracks here — recording / store may still own them.
      void owned;
    };
  }, []);

  const displayCameraStream = recording.cameraStream ?? previewCameraStream;

  // If stream was cleared (track ended) and nothing else owns a live cam, re-acquire.
  useEffect(() => {
    if (displayCameraStream) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = getStoredCameraStream();
        if (stored?.active) {
          stored.getVideoTracks().forEach((t) => { t.enabled = true; });
          if (!cancelled) setPreviewCameraStream(stored);
          return;
        }
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", ...getVideoConstraints(portrait) },
          audio: false,
        });
        if (cancelled) {
          cam.getTracks().forEach((t) => t.stop());
          return;
        }
        cam.getVideoTracks().forEach((t) => { t.enabled = true; });
        setPreviewCameraStream(cam);
        setStoredCameraStream(cam);
      } catch {
        /* still optional */
      }
    })();
    return () => { cancelled = true; };
  }, [preview, displayCameraStream]);

  // Callback ref so remounts (tools ↔ main / PiP) re-attach the stream
  const bindZoomCameraVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      zoomCameraVideoRef.current = video;
      if (!video || !displayCameraStream) return;
      displayCameraStream.getVideoTracks().forEach((t) => { t.enabled = true; });
      if (video.srcObject !== displayCameraStream) {
        video.srcObject = displayCameraStream;
      }
      void video.play().catch(() => {});
      // Voice-only and simli zoom have no PiP on the main Zoom layout — start analysis here.
      if (useZoomLayout || useSimliZoom) {
        faceAnalysis.start(video);
      }
    },
    // faceAnalysis.start is stable enough for bind; avoid re-binding loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayCameraStream, useZoomLayout, useSimliZoom],
  );

  const bindCameraPipVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      cameraPipRef.current = video;
      if (!video || !displayCameraStream) return;
      displayCameraStream.getVideoTracks().forEach((t) => { t.enabled = true; });
      if (video.srcObject !== displayCameraStream) {
        video.srcObject = displayCameraStream;
      }
      void video.play().catch(() => {});
      if (faceProctoringActive) {
        faceAnalysis.start(video);
      }
    },
    // faceAnalysis.start is stable enough for bind; avoid re-binding loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayCameraStream, faceProctoringActive],
  );

  // Keep candidate tiles playing — remounts / layout switches often pause video.
  useEffect(() => {
    if (!displayCameraStream) return;
    const ensure = () => {
      displayCameraStream.getVideoTracks().forEach((t) => { t.enabled = true; });
      for (const video of [zoomCameraVideoRef.current, cameraPipRef.current]) {
        if (!video) continue;
        if (video.srcObject !== displayCameraStream) {
          video.srcObject = displayCameraStream;
        }
        if (video.paused) void video.play().catch(() => {});
      }
    };
    ensure();
    const id = window.setInterval(ensure, 2000);
    return () => clearInterval(id);
  }, [displayCameraStream]);

  useEffect(() => {
    return () => {
      faceAnalysis.stop();
    };
  }, []);

  // ── Voice hooks ─────────────────────────────────────────────────
  const handleTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      if (isFinal && text.trim()) {
        const normalized = normalizeTranscript(text);
        if (normalized === lastFinalTranscriptRef.current) return;
        lastFinalTranscriptRef.current = normalized;
        setMessages((prev) => upsertFinalVoiceTranscript(prev, text));
      } else if (!isFinal && text.trim()) {
        lastFinalTranscriptRef.current = "";
      }
    },
    [],
  );

  const handleAIResponse = useCallback((text: string) => {
    const trimmed = formatTranscriptText(text);
    if (!trimmed) return;
    setMessages((prev) => {
      if (hasRecentAssistantTranscript(prev, trimmed)) {
        return prev;
      }
      const last = prev[prev.length - 1];
      if (last?.role !== "assistant") {
        return [...prev, { id: crypto.randomUUID(), role: "assistant", content: trimmed, source: "voice" }];
      }
      const lastNorm = last.content.replace(/\s+/g, " ").trim();
      const newNorm = trimmed.replace(/\s+/g, " ").trim();
      if (lastNorm === newNorm) return prev;
      if (newNorm.startsWith(lastNorm) && newNorm.length > lastNorm.length) {
        return [...prev.slice(0, -1), { ...last, content: trimmed }];
      }
      return [...prev, { id: crypto.randomUUID(), role: "assistant", content: trimmed, source: "voice" }];
    });
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
    setTimeout(() => setError(""), 5000);
  }, []);

  const voice = useVoice({
    interviewId,
    sessionId,
    interviewContext,
    onTranscript: handleTranscript,
    onAIResponse: handleAIResponse,
    onError: handleError,
    // Premium Vidu: no Gemini at all — never connect voice for that mode.
    // Simli: do not play Google TTS on speakers — heard audio is Simli's
    // LiveKit track so lipsync is driven by the same stream.
    mutePlayback: isPremiumVidu || (avatarMode === "simli" && avatar.status !== "error"),
    skipLlm: isPremiumVidu,
    onListeningStart: undefined,
    onMicPcmChunk: undefined,
    onTtsChunk: !isPremiumVidu
      ? (pcmData: ArrayBuffer) => {
          // Always mix TTS into the session recording (zoom + simli).
          recording.addTtsChunk(pcmData);
          if (avatarMode === "simli") {
            avatar.sendAudio(pcmData);
          }
        }
      : undefined,
    onInterrupt: !isPremiumVidu
      ? () => {
          recording.cancelTts();
          if (avatarMode === "simli") {
            avatar.interrupt();
          }
        }
      : undefined,
  });

  const waitForSimliAvatar = useCallback(async () => {
    if (avatarMode !== "simli") return;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const status = avatarStatusRef.current;
      if (
        status === "ready" ||
        status === "speaking" ||
        status === "listening" ||
        status === "error"
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, [avatarMode]);

  const handleStartInterview = useCallback(async () => {
    setError("");
    setIsStartingInterview(true);
    try {
      if (isPremiumVidu) {
        setViduQuestionIndex(0);
        setViduLiveArmed(true);
        return;
      }
      await waitForSimliAvatar();
      await voice.connect();
    } catch {
      setIsStartingInterview(false);
    }
  }, [isPremiumVidu, waitForSimliAvatar, voice]);

  // Unified session flags — Premium uses Vidu Live only; others use Gemini voice.
  const sessionConnected = isPremiumVidu
    ? vidu.status === "ready" || vidu.status === "speaking" || vidu.status === "listening"
    : voice.isConnected;
  const sessionListening = isPremiumVidu ? viduListening : voice.isListening;
  const sessionSpeaking = isPremiumVidu ? vidu.status === "speaking" : voice.isSpeaking;
  const sessionProcessing = isPremiumVidu ? false : voice.isProcessing;
  const sessionTransitioning = isPremiumVidu ? false : voice.isTransitioning;
  const sessionAiText = isPremiumVidu
    ? viduDisplayScript
    : (voice.aiTranscript || voice.lastAiQuestion || "");
  const sessionQuestionIndex = isPremiumVidu ? viduQuestionIndex : voice.currentQuestionIndex;

  // ── Simli-only UX gating: disable "Unmute to Speak" until avatar finishes
  // reading the current question. Voice-only + non-interactive are unchanged.
  const isSimliLiveInterview =
    avatarMode === "simli" && !preview && !isPremiumVidu && avatar.status !== "error";

  // Simli may show "Speaking" from avatar.status even when Gemini voice.isSpeaking lags.
  const avatarSpeakingForUnmute =
    sessionSpeaking || (isSimliLiveInterview && avatar.status === "speaking");

  const [simliQuestionFinished, setSimliQuestionFinished] = useState(false);
  const simliSpeakingStartedForQuestionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isSimliLiveInterview) {
      simliSpeakingStartedForQuestionRef.current = null;
      setSimliQuestionFinished(false);
      return;
    }
    // New question: clear finished state until we observe speaking -> ready.
    simliSpeakingStartedForQuestionRef.current = null;
    setSimliQuestionFinished(false);
  }, [isSimliLiveInterview, sessionQuestionIndex]);

  useEffect(() => {
    if (!isSimliLiveInterview) return;

    // Mark when avatar starts reading this question.
    if (avatar.status === "speaking") {
      simliSpeakingStartedForQuestionRef.current = sessionQuestionIndex;
      setSimliQuestionFinished(false);
      return;
    }

    // When Simli transitions back to "ready" *after* speaking for this question,
    // the question has been fully read.
    if (avatar.status === "ready") {
      setSimliQuestionFinished(
        simliSpeakingStartedForQuestionRef.current === sessionQuestionIndex &&
          !sessionListening,
      );
      return;
    }

    // Any other avatar state means the question isn't finished yet.
    setSimliQuestionFinished(false);
  }, [isSimliLiveInterview, avatar.status, sessionQuestionIndex, sessionListening]);

  // First question only: show a "Unmute to speak" prompt after the avatar finishes.
  const firstUnmutePromptShownRef = useRef(false);
  const [showFirstUnmutePrompt, setShowFirstUnmutePrompt] = useState(false);
  const [firstUnmutePromptAcknowledged, setFirstUnmutePromptAcknowledged] = useState(false);

  useEffect(() => {
    if (!isSimliLiveInterview) return;
    if (sessionQuestionIndex !== 0) return;
    const sortedQ = interviewContext.questions.slice().sort((a, b) => a.order - b.order);
    if (sortedQ[0]?.type === "CODING") return;
    if (firstUnmutePromptShownRef.current) return;
    if (!simliQuestionFinished) return;
    if (sessionListening) return;

    firstUnmutePromptShownRef.current = true;
    setFirstUnmutePromptAcknowledged(false);
    setShowFirstUnmutePrompt(true);
  }, [isSimliLiveInterview, sessionQuestionIndex, simliQuestionFinished, sessionListening, interviewContext.questions]);

  useEffect(() => {
    if (!showFirstUnmutePrompt) return;
    // If user navigates away from question 1 (e.g. due to fast transitions), close the modal.
    if (!isSimliLiveInterview || sessionQuestionIndex !== 0) {
      setShowFirstUnmutePrompt(false);
      setFirstUnmutePromptAcknowledged(true);
    }
  }, [showFirstUnmutePrompt, isSimliLiveInterview, sessionQuestionIndex]);

  useEffect(() => {
    if (!isPremiumVidu) return;
    premiumLog.info("session state", {
      viduStatus: vidu.status,
      armed: viduLiveArmed,
      viduListening,
      sessionConnected,
      sessionSpeaking,
      scriptIndex: viduQuestionIndex,
      error: vidu.error,
    });
  }, [
    isPremiumVidu,
    vidu.status,
    viduLiveArmed,
    viduListening,
    sessionConnected,
    sessionSpeaking,
    viduQuestionIndex,
    vidu.error,
  ]);

  const stopViduMicCapture = useCallback(() => {
    premiumLog.info("stopViduMicCapture", {
      hadCleanup: !!viduMicCleanupRef.current,
      bufferedChunks: viduPcmChunksRef.current.length,
    });
    viduMicCleanupRef.current?.();
    viduMicCleanupRef.current = null;
    setViduListening(false);
  }, []);

  const startViduMicCapture = useCallback(async () => {
    premiumLog.info("startViduMicCapture called", {
      alreadyListening: viduListening,
      viduStatus: vidu.status,
      sessionConnected,
      sessionSpeaking,
    });
    if (viduListening) {
      premiumLog.warn("startViduMicCapture ignored — already listening");
      return;
    }
    // The Vidu RTC SDK already owns the published microphone track. Swapping in
    // a locally buffered AudioContext track meant Vidu often received no usable
    // answer. Use Vidu's native track directly for the push-to-send interval.
    if (vidu.setLocalMicMuted(false)) {
      setViduListening(true);
      premiumLog.info("Vidu RTC mic unmuted for candidate answer");
    } else {
      const message = "Vidu microphone is not ready. Please reconnect the interview.";
      setError(message);
      setTimeout(() => setError(""), 5000);
    }
  }, [viduListening, vidu, vidu.status, sessionConnected, sessionSpeaking]);

  const submitViduTurn = useCallback(async () => {
    premiumLog.info("submitViduTurn", {
      scriptIndex: viduQuestionIndex,
      viduStatus: vidu.status,
    });
    vidu.setLocalMicMuted(true);
    stopViduMicCapture();
    // Do not advance text simply because the user submitted. Vidu does not
    // expose its spoken transcript, so advancing here would fabricate a
    // caption and caused the mismatch the candidate saw.
  }, [stopViduMicCapture, vidu, viduQuestionIndex]);

  // Disarm Vidu when leaving Premium or session ends
  useEffect(() => {
    if (!isPremiumVidu) {
      setViduLiveArmed(false);
      stopViduMicCapture();
    }
  }, [isPremiumVidu, stopViduMicCapture]);

  useEffect(() => {
    if (isPremiumVidu && (vidu.status === "ready" || vidu.status === "speaking" || vidu.status === "listening")) {
      setIsStartingInterview(false);
    }
  }, [isPremiumVidu, vidu.status]);

  // Sync avatar listening state with user mic state (Simli only)
  useEffect(() => {
    if (avatarMode !== "simli") return;
    if (voice.isListening) {
      avatar.setListening();
    } else {
      avatar.stopListening();
    }
  }, [avatarMode, voice.isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sessionConnected) {
      setIsStartingInterview(false);
    }
  }, [sessionConnected]);

  useEffect(() => {
    if (error || vidu.error) {
      setIsStartingInterview(false);
      if (vidu.error) {
        setError(vidu.error);
        setTimeout(() => setError(""), 5000);
      }
    }
  }, [error, vidu.error]);

  // ── Start recording when session connects (video mode) ───────────
  const recordingStartedRef = useRef(false);
  useEffect(() => {
    if (!sessionConnected || recordingStartedRef.current) return;
    recordingStartedRef.current = true;
    const micStream = isPremiumVidu ? undefined : voice.mediaStreamRef.current;
    recording.start(micStream ?? undefined).then(() => {
      // Start clip for the first question as soon as the session recording is live.
      const firstQ = interviewContext.questions.slice().sort((a, b) => a.order - b.order)[0];
      if (firstQ?.id) {
        // Small delay to let RecordRTC fully initialise its combined stream.
        setTimeout(() => recording.startClip(firstQ.id), 500);
      }
    }).catch(() => {});
  }, [sessionConnected, isPremiumVidu]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach mic stream to recording when it becomes available (Gemini voice only)
  useEffect(() => {
    if (isPremiumVidu || !sessionListening) return;
    const micStream = voice.mediaStreamRef.current;
    if (micStream) {
      recording.attachMicStream(micStream);
    }
  }, [sessionListening, isPremiumVidu]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Countdown timer (starts when session connects) ────────────────
  useEffect(() => {
    if (!sessionConnected || timerStartedRef.current || !durationMinutes) return;
    timerStartedRef.current = true;
    timerDeadlineRef.current = Date.now() + durationMinutes * 60_000;
    setRemainingSeconds(Math.ceil((timerDeadlineRef.current - Date.now()) / 1000));
  }, [sessionConnected, durationMinutes]);

  // ── Recording utterance timer ────────────────────────────────────
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (sessionListening) {
      setRecordingSeconds(0);
      interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionListening]);

  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0 || !timerDeadlineRef.current) return;
    const id = setInterval(() => {
      setRemainingSeconds(
        Math.max(0, Math.ceil((timerDeadlineRef.current! - Date.now()) / 1000)),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [remainingSeconds !== null && remainingSeconds > 0]);

  // ── Whiteboard persistence ──────────────────────────────────────
  /** Persist a single drawing to the backend. */
  const persistDrawing = useCallback(
    async (drawing: { id: string; label: string }, snapshotData: string, imageDataUrl?: string) => {
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
              imageDataUrl: imageDataUrl ?? undefined,
            },
          }),
        });
      } catch (err) {
        console.error("[voice] Failed to save whiteboard:", err);
      }
    },
    [sessionId],
  );

  /** Save all drawings that have content (with images for final save). */
  const saveAllDrawings = useCallback(async () => {
    const wb = whiteboardRef.current;
    if (!wb) return;

    // Capture the active drawing's live state from the canvas
    const currentSnapshot = wb.getSnapshotData();

    const updatedDrawings = drawings.map((d, i) =>
      i === activeDrawingIdx && currentSnapshot ? { ...d, snapshotData: currentSnapshot } : d,
    );

    // Generate images sequentially (shared wb instance) but persist in parallel
    const persistOps: Promise<void>[] = [];
    for (const drawing of updatedDrawings) {
      if (!drawing.snapshotData) continue;
      const img =
        drawing.id === updatedDrawings[activeDrawingIdx]?.id
          ? await wb.getImageDataUrl()
          : await wb.exportImageFromData(drawing.snapshotData);
      persistOps.push(persistDrawing(drawing, drawing.snapshotData, img ?? undefined));
    }
    await Promise.all(persistOps);
  }, [drawings, activeDrawingIdx, persistDrawing]);

  // Debounced auto-save callback from WhiteboardCanvas
  const lastAutoSave = useRef<string | null>(null);
  const handleWhiteboardAutoSave = useCallback(
    async (snapshotData: string) => {
      if (snapshotData === lastAutoSave.current) return;
      lastAutoSave.current = snapshotData;

      const drawing = drawings[activeDrawingIdx];
      if (!drawing) return;

      // Update local snapshot cache
      setDrawings((prev) =>
        prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData } : d)),
      );

      await persistDrawing(drawing, snapshotData);
      setSaveStatus("saved");

      // Send whiteboard image as PNG to relay for agent context
      // (Vision LLMs don't support SVG; we convert on the client)
      const wb = whiteboardRef.current;
      if (wb) {
        wb.getImageDataUrl().then((svgUrl) => {
          if (!svgUrl) return;
          svgToPngDataUrl(svgUrl).then((pngUrl) => {
            if (pngUrl) voice.sendWhiteboardUpdate(pngUrl);
          }).catch(() => {});
        }).catch(() => {});
      }
    },
    [drawings, activeDrawingIdx, persistDrawing, voice],
  );

  // ── Drawing management ────────────────────────────────────────
  const switchDrawing = useCallback(
    (targetIdx: number) => {
      if (targetIdx === activeDrawingIdx) return;
      const wb = whiteboardRef.current;
      if (!wb) return;

      // Snapshot current canvas into drawings state and persist to backend
      const currentSnapshot = wb.getSnapshotData();
      const currentDrawing = drawings[activeDrawingIdx];
      setDrawings((prev) =>
        prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData: currentSnapshot } : d)),
      );
      if (currentDrawing && currentSnapshot) {
        persistDrawing(currentDrawing, currentSnapshot);
      }

      // Load the target drawing
      const target = drawings[targetIdx];
      if (target?.snapshotData) {
        wb.loadScene(target.snapshotData);
      } else {
        wb.resetScene();
      }
      setActiveDrawingIdx(targetIdx);
      lastAutoSave.current = null;
    },
    [activeDrawingIdx, drawings, persistDrawing],
  );

  const addNewDrawing = useCallback(() => {
    const wb = whiteboardRef.current;
    if (!wb) return;

    // Save current canvas to state and persist to backend
    const currentSnapshot = wb.getSnapshotData();
    const currentDrawing = drawings[activeDrawingIdx];
    setDrawings((prev) => {
      const updated = prev.map((d, i) =>
        i === activeDrawingIdx ? { ...d, snapshotData: currentSnapshot } : d,
      );
      const newDrawing = {
        id: crypto.randomUUID(),
        label: `Drawing ${updated.length + 1}`,
        snapshotData: null,
      };
      return [...updated, newDrawing];
    });
    if (currentDrawing && currentSnapshot) {
      persistDrawing(currentDrawing, currentSnapshot);
    }

    wb.resetScene();
    setActiveDrawingIdx(drawings.length); // index of the new drawing
    lastAutoSave.current = null;
  }, [activeDrawingIdx, drawings, persistDrawing]);

  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);

  const renameDrawing = useCallback((drawingId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setDrawings((prev) => prev.map((d) => (d.id === drawingId ? { ...d, label: trimmed } : d)));
    setEditingDrawingId(null);
  }, []);

  const deleteDrawing = useCallback(
    (idx: number) => {
      if (drawings.length <= 1) return; // keep at least one

      const drawing = drawings[idx];

      if (!window.confirm(`Delete "${drawing.label}"? This cannot be undone.`)) return;

      // Delete from backend
      fetch("/api/trpc/session.deleteWhiteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { sessionId, drawingId: drawing.id } }),
      }).catch((err) => console.error("[voice] Failed to delete whiteboard:", err));

      setDrawings((prev) => prev.filter((_, i) => i !== idx));

      // Adjust active index
      if (idx === activeDrawingIdx) {
        const newIdx = Math.min(idx, drawings.length - 2);
        setActiveDrawingIdx(newIdx);
        const target = drawings.filter((_, i) => i !== idx)[newIdx];
        const wb = whiteboardRef.current;
        if (wb) {
          if (target?.snapshotData) wb.loadScene(target.snapshotData);
          else wb.resetScene();
        }
      } else if (idx < activeDrawingIdx) {
        setActiveDrawingIdx((prev) => prev - 1);
      }
      lastAutoSave.current = null;
    },
    [drawings, activeDrawingIdx, sessionId],
  );

  // ── Save status tracking ───────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("saved");

  const handleWhiteboardDirty = useCallback(() => {
    setSaveStatus("idle");
  }, []);

  const handleManualSave = useCallback(async () => {
    const wb = whiteboardRef.current;
    if (!wb || !wb.hasContent()) return;

    const drawing = drawings[activeDrawingIdx];
    if (!drawing) return;

    setSaveStatus("saving");
    const snapshotData = wb.getSnapshotData();
    const imageDataUrl = await wb.getImageDataUrl();
    if (snapshotData) {
      setDrawings((prev) =>
        prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData } : d)),
      );
      await persistDrawing(drawing, snapshotData, imageDataUrl ?? undefined);
    }
    setSaveStatus("saved");
  }, [drawings, activeDrawingIdx, persistDrawing]);

  // ── Code snippet persistence ────────────────────────────────────
  const persistCodeSnippet = useCallback(
    async (snippet: { id: string; label: string }, snapshotData: string) => {
      try {
        await fetch("/api/trpc/session.saveCode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            json: { sessionId, snippetId: snippet.id, label: snippet.label, snapshotData },
          }),
        });
      } catch (err) {
        console.error("[voice] Failed to save code:", err);
      }
    },
    [sessionId],
  );

  const saveAllCodeSnippets = useCallback(async () => {
    const ce = codeEditorRef.current;
    if (!ce) return;
    const currentSnapshot = ce.getSnapshotData();
    const updatedSnippets = codeSnippets.map((s, i) =>
      i === activeSnippetIdx && currentSnapshot ? { ...s, snapshotData: currentSnapshot } : s,
    );
    await Promise.all(
      updatedSnippets
        .filter((s) => s.snapshotData)
        .map((snippet) => persistCodeSnippet(snippet, snippet.snapshotData!))
    );
  }, [codeSnippets, activeSnippetIdx, persistCodeSnippet]);

  const lastCodeAutoSave = useRef<string | null>(null);
  const handleCodeAutoSave = useCallback(
    async (snapshotData: string) => {
      if (snapshotData === lastCodeAutoSave.current) return;
      lastCodeAutoSave.current = snapshotData;
      const snippet = codeSnippets[activeSnippetIdx];
      if (!snippet) return;
      setCodeSnippets((prev) =>
        prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData } : s)),
      );
      await persistCodeSnippet(snippet, snapshotData);
      setCodeSaveStatus("saved");

      // Send code content to relay for agent context
      try {
        const parsed = JSON.parse(snapshotData);
        if (parsed.code) {
          voice.sendCodeUpdate(parsed.code, parsed.language || "plaintext");
        }
      } catch { /* ignore */ }
    },
    [codeSnippets, activeSnippetIdx, persistCodeSnippet, voice],
  );

  const switchCodeSnippet = useCallback(
    (targetIdx: number) => {
      if (targetIdx === activeSnippetIdx) return;
      const ce = codeEditorRef.current;
      if (!ce) return;
      const currentSnapshot = ce.getSnapshotData();
      const currentSnippet = codeSnippets[activeSnippetIdx];
      setCodeSnippets((prev) =>
        prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData: currentSnapshot } : s)),
      );
      if (currentSnippet && currentSnapshot) persistCodeSnippet(currentSnippet, currentSnapshot);
      const target = codeSnippets[targetIdx];
      if (target?.snapshotData) ce.loadScene(target.snapshotData);
      else ce.resetScene();
      setActiveSnippetIdx(targetIdx);
      lastCodeAutoSave.current = null;
    },
    [activeSnippetIdx, codeSnippets, persistCodeSnippet],
  );

  const addNewCodeSnippet = useCallback(() => {
    const ce = codeEditorRef.current;
    if (!ce) return;
    const currentSnapshot = ce.getSnapshotData();
    const currentSnippet = codeSnippets[activeSnippetIdx];
    setCodeSnippets((prev) => {
      const updated = prev.map((s, i) =>
        i === activeSnippetIdx ? { ...s, snapshotData: currentSnapshot } : s,
      );
      return [...updated, { id: crypto.randomUUID(), label: `Snippet ${updated.length + 1}`, snapshotData: null }];
    });
    if (currentSnippet && currentSnapshot) persistCodeSnippet(currentSnippet, currentSnapshot);
    ce.resetScene();
    setActiveSnippetIdx(codeSnippets.length);
    lastCodeAutoSave.current = null;
  }, [activeSnippetIdx, codeSnippets, persistCodeSnippet]);

  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);

  const renameCodeSnippet = useCallback((snippetId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setCodeSnippets((prev) => prev.map((s) => (s.id === snippetId ? { ...s, label: trimmed } : s)));
    setEditingSnippetId(null);
  }, []);

  const deleteCodeSnippet = useCallback(
    (idx: number) => {
      if (codeSnippets.length <= 1) return;
      const snippet = codeSnippets[idx];
      if (!window.confirm(`Delete "${snippet.label}"? This cannot be undone.`)) return;
      fetch("/api/trpc/session.deleteCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { sessionId, snippetId: snippet.id } }),
      }).catch((err) => console.error("[voice] Failed to delete code:", err));
      setCodeSnippets((prev) => prev.filter((_, i) => i !== idx));
      if (idx === activeSnippetIdx) {
        const newIdx = Math.min(idx, codeSnippets.length - 2);
        setActiveSnippetIdx(newIdx);
        const target = codeSnippets.filter((_, i) => i !== idx)[newIdx];
        const ce = codeEditorRef.current;
        if (ce) { if (target?.snapshotData) ce.loadScene(target.snapshotData); else ce.resetScene(); }
      } else if (idx < activeSnippetIdx) {
        setActiveSnippetIdx((prev) => prev - 1);
      }
      lastCodeAutoSave.current = null;
    },
    [codeSnippets, activeSnippetIdx, sessionId],
  );

  const [codeSaveStatus, setCodeSaveStatus] = useState<"idle" | "saving" | "saved">("saved");

  const handleCodeDirty = useCallback(() => {
    setCodeSaveStatus("idle");
    const ce = codeEditorRef.current;
    if (ce) liveCodeSnapshotRef.current = ce.getSnapshotData();
  }, []);

  const handleCodeManualSave = useCallback(async () => {
    const ce = codeEditorRef.current;
    if (!ce || !ce.hasContent()) return;
    const snippet = codeSnippets[activeSnippetIdx];
    if (!snippet) return;
    setCodeSaveStatus("saving");
    const snapshotData = ce.getSnapshotData();
    if (snapshotData) {
      setCodeSnippets((prev) =>
        prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData } : s)),
      );
      await persistCodeSnippet(snippet, snapshotData);
    }
    setCodeSaveStatus("saved");
  }, [codeSnippets, activeSnippetIdx, persistCodeSnippet]);

  // ── Save-before-navigate wrappers ───────────────────────────────
  const saveCurrentContent = useCallback(async () => {
    const wb = whiteboardRef.current;
    if (wb) {
      const snapshot = wb.getSnapshotData();
      const drawing = drawings[activeDrawingIdx];
      if (drawing && snapshot) {
        setDrawings((prev) =>
          prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData: snapshot } : d)),
        );
        await persistDrawing(drawing, snapshot);
      }
    }
    const ce = codeEditorRef.current;
    if (ce) {
      const snapshot = ce.getSnapshotData();
      const snippet = codeSnippets[activeSnippetIdx];
      if (snippet && snapshot) {
        setCodeSnippets((prev) =>
          prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData: snapshot } : s)),
        );
        await persistCodeSnippet(snippet, snapshot);
      }
    }
  }, [drawings, activeDrawingIdx, persistDrawing, codeSnippets, activeSnippetIdx, persistCodeSnippet]);

  const handlePreviousQuestion = useCallback(async () => {
    await saveCurrentContent();
    voice.previousQuestion();
  }, [saveCurrentContent, voice]);

  const handleNextQuestion = useCallback(async () => {
    await saveCurrentContent();
    voice.nextQuestion();
  }, [saveCurrentContent, voice]);

  // ── Editor toggle helpers (save before deactivate, restore on activate)
  const saveCodeEditorState = useCallback(() => {
    const ce = codeEditorRef.current;
    if (ce) {
      const snapshot = ce.getSnapshotData();
      if (snapshot) {
        setCodeSnippets((prev) =>
          prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData: snapshot } : s)),
        );
      }
    }
  }, [activeSnippetIdx]);

  const saveWhiteboardState = useCallback(() => {
    const wb = whiteboardRef.current;
    if (wb) {
      const snapshot = wb.getSnapshotData();
      if (snapshot) {
        setDrawings((prev) =>
          prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData: snapshot } : d)),
        );
      }
    }
  }, [activeDrawingIdx]);

  const handleToggleCodeEditor = useCallback(() => {
    if (codeEditorActive) {
      saveCodeEditorState();
      setCodeEditorActive(false);
    } else {
      if (whiteboardActive) saveWhiteboardState();
      setCodeEditorActive(true);
      setWhiteboardActive(false);
    }
  }, [codeEditorActive, whiteboardActive, saveCodeEditorState, saveWhiteboardState]);

  const handleToggleWhiteboard = useCallback(() => {
    if (whiteboardActive) {
      saveWhiteboardState();
      setWhiteboardActive(false);
    } else {
      if (codeEditorActive) saveCodeEditorState();
      setWhiteboardActive(true);
      setCodeEditorActive(false);
    }
  }, [whiteboardActive, codeEditorActive, saveWhiteboardState, saveCodeEditorState]);

  // Restore editor/whiteboard content when reactivated after toggle
  useEffect(() => {
    if (!codeEditorActive) return;
    const snippet = codeSnippets[activeSnippetIdx];
    if (snippet?.snapshotData) {
      const timer = setTimeout(() => {
        codeEditorRef.current?.loadScene(snippet.snapshotData!);
      }, 400);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeEditorActive]);

  useEffect(() => {
    if (!whiteboardActive) return;
    const drawing = drawings[activeDrawingIdx];
    if (drawing?.snapshotData) {
      const timer = setTimeout(() => {
        whiteboardRef.current?.loadScene(drawing.snapshotData!);
      }, 400);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteboardActive]);

  // ── Common save-and-end logic ───────────────────────────────────
  const handleEndInterview = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setIsSaving(true);

    stopViduMicCapture();
    if (!isPremiumVidu) {
      voice.stopListening();
    }

    try {
      await Promise.allSettled([
        withTimeout(saveAllDrawings(), 5000, "save drawings"),
        withTimeout(saveAllCodeSnippets(), 5000, "save code snippets"),
      ]);

      try {
        let faceResults: ReturnType<typeof faceAnalysis.stop> | null = null;

        // Finalize + upload media BEFORE flipping COMPLETED so a tab close
        // mid-upload is less likely to leave a completed session with no recording.
        // Unload beacons still complete the session as a last resort.
        {
          log.info("Finalizing recording before session complete...", {
            hasActiveRecorder: recording.hasActiveRecorder(),
            isRecording: recording.isRecording,
          });
          // Large uploads can take several minutes on slower networks.
          const result = await withTimeout(recording.stop(), 600000, "stop recording");
          faceResults = faceAnalysis.stop();

          log.info("Face analysis results:", {
            eyeContactScore: faceResults.eyeContactScore,
            totalChecks: faceResults.totalChecks,
            emotionsCount: faceResults.results.length,
          });

          if (!result.audioUrl && !result.videoUrl) {
            log.error("Recording stop returned no media URLs", {
              audioDuration: result.audioDuration,
              screenshots: result.screenshots?.length ?? 0,
              hadRecorder: result.hadRecorder,
            });
          } else if (!result.videoUrl && result.audioUrl) {
            log.warn("Video missing after stop; persisting audio-only recording", {
              audioDuration: result.audioDuration,
            });
          }

          log.info("Saving recording mutation...", {
            hasAudio: !!result.audioUrl,
            hasVideo: !!result.videoUrl,
            audioDuration: result.audioDuration,
          });
          await withTimeout(
            saveRecordingMutation.mutateAsync({
              sessionId,
              audioRecordingUrl: result.audioUrl ?? null,
              videoRecordingUrl: result.videoUrl ?? null,
              audioDuration: result.audioDuration ?? null,
              screenshots: result.screenshots,
              videoClips: result.videoClips?.length ? result.videoClips : null,
              participantMetadata: {
                eye_contact_score: faceResults.eyeContactScore,
                missed_count: faceResults.missedCount,
                multiple_faces_count: faceResults.multipleFacesCount,
                face_analysis_results: faceResults.results,
              },
            }),
            120000,
            "save recording",
          );
          log.info("Recording saved successfully");
        }

        if (!faceResults && faceProctoringActive) {
          faceResults = faceAnalysis.stop();
          log.info("Saving face analysis metadata...", {
            eyeContactScore: faceResults.eyeContactScore,
            emotionsCount: faceResults.results.length,
          });
          await withTimeout(
            saveRecordingMutation.mutateAsync({
              sessionId,
              participantMetadata: {
                eye_contact_score: faceResults.eyeContactScore,
                missed_count: faceResults.missedCount,
                multiple_faces_count: faceResults.multipleFacesCount,
                face_analysis_results: faceResults.results,
              },
            }),
            120000,
            "save face analysis",
          );
        }
      } catch (err) {
        console.error("[voice] Failed to save recording/video:", err);
        // Recording is best-effort — still mark COMPLETED below
      }

      // DB completion after media persist attempt (beacon remains unload fallback)
      try {
        await completeSessionNow(sessionId);
        completeSessionBeacon(sessionId);
      } catch (err) {
        console.error("[voice] Failed to mark session complete (continuing):", err);
        completeSessionBeacon(sessionId);
      }

      // Force a small delay to ensure auto-saves have finished
      await new Promise(r => setTimeout(r, 1000));

      if (isPremiumVidu) {
        setViduLiveArmed(false);
        vidu.disconnect();
      } else {
        await withTimeout(voice.disconnect(), 15000, "voice disconnect");
      }
    } catch (err) {
      console.error("[voice] Failed to end interview cleanly:", err);
      // Last-resort complete if earlier steps threw before the complete call
      try {
        await completeSessionNow(sessionId);
      } catch {
        completeSessionBeacon(sessionId);
      }
    } finally {
      setIsSaving(false);
      setLocallyCompleted(true);
      onComplete?.();
    }
  }, [saveAllDrawings, saveAllCodeSnippets, isInteractiveVideoAvatar, faceProctoringActive, isPremiumVidu, recording, sessionId, stopViduMicCapture, vidu, voice, onComplete, faceAnalysis, saveRecordingMutation]);

  useEffect(() => {
    handleEndInterviewRef.current = handleEndInterview;
  }, [handleEndInterview]);

  // ── Auto-end when timer expires ──────────────────────────────────
  useEffect(() => {
    if (remainingSeconds !== 0 || timerExpiredRef.current) return;
    timerExpiredRef.current = true;
    handleEndInterviewRef.current();
  }, [remainingSeconds]);

  // ── Scroll transcript to bottom ─────────────────────────────────
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sessionAiText, voice.userTranscript, sessionProcessing]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMessages]);

  // ── Send chat message helper ──────────────────────────────────
  const handleSendChat = useCallback((text: string) => {
    if (isPremiumVidu) return; // Premium is Vidu-only — no Gemini chat inject
    const trimmed = text.trim();
    if (!trimmed) return;
    voice.interruptPlayback();
    const msg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed, source: "chat" };
    setMessages((prev) => [...prev, msg]);
    setChatMessages((prev) => [...prev, msg]);
    voice.sendTextMessage(trimmed);
  }, [isPremiumVidu, voice]);

  const sortedQuestions = interviewContext.questions.slice().sort((a, b) => a.order - b.order);

  // ── Derived state ───────────────────────────────────────────────
  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant") ?? null,
    [messages],
  );
  const latestAssistantFarewellCandidate = useMemo(() => {
    if (isPremiumVidu) {
      if (viduQuestionIndex >= viduScriptLines.length - 1) {
        return sessionAiText;
      }
      return "";
    }
    const liveTranscript = voice.aiTranscript.trim();
    if (liveTranscript) return liveTranscript;
    return lastAssistantMessage?.content ?? "";
  }, [
    isPremiumVidu,
    viduQuestionIndex,
    viduScriptLines.length,
    sessionAiText,
    voice.aiTranscript,
    lastAssistantMessage,
  ]);
  const hasVisibleFarewell =
    !!latestAssistantFarewellCandidate &&
    looksLikeInterviewFarewell(latestAssistantFarewellCandidate);
  const farewellReadyToClose =
    hasVisibleFarewell &&
    (isPremiumVidu
      ? !sessionSpeaking
      : voice.lastAssistantUtteranceEndedAt > 0 && !sessionSpeaking);
  // Only auto-close on farewell when the relay confirmed all questions are done,
  // the countdown hit zero, or there is no time cap configured.
  const shouldAutoEndOnFarewell =
    farewellReadyToClose &&
    (voice.isInterviewComplete ||
      remainingSeconds === 0 ||
      durationMinutes == null);
  const shouldShowCompletionScreen =
    !preview &&
    locallyCompleted;

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  const isTimeLow = remainingSeconds !== null && remainingSeconds <= 60;

  useEffect(() => {
    if (!shouldAutoEndOnFarewell || locallyCompleted) return;
    const timer = setTimeout(() => {
      handleEndInterviewRef.current();
    }, 2000);
    return () => clearTimeout(timer);
  }, [shouldAutoEndOnFarewell, locallyCompleted]);

  useEffect(() => {
    if (isPremiumVidu) {
      if (viduQuestionIndex < viduScriptLines.length - 1 || locallyCompleted) return;
      const timer = setTimeout(() => {
        handleEndInterviewRef.current();
      }, 8000);
      return () => clearTimeout(timer);
    }
    if (!voice.isInterviewComplete || locallyCompleted || hasVisibleFarewell) return;
    const timer = setTimeout(() => {
      handleEndInterviewRef.current();
    }, 8000);
    return () => clearTimeout(timer);
  }, [isPremiumVidu, viduQuestionIndex, viduScriptLines.length, voice.isInterviewComplete, locallyCompleted, hasVisibleFarewell]);
  const completionScreen = (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-secondary-500" />
          <h2 className="mt-4 text-2xl font-bold">Thank you!</h2>
          <p className="mt-2 text-muted-foreground">
            Your interview has been completed successfully. We appreciate your
            time and thoughtful responses.
          </p>
        </CardContent>
      </Card>
    </div>
  );

  const currentQVoice = sortedQuestions[sessionQuestionIndex];
  const currentQuestionText = isPremiumVidu ? sessionAiText : (currentQVoice?.text || "");
  const isCodingQuestion = currentQVoice?.type === "CODING";
  const isWhiteboardQuestion = currentQVoice?.type === "WHITEBOARD";

  const codeEditorInitialData = useMemo(() => {
    const snippet = codeSnippets[activeSnippetIdx];
    if (snippet?.snapshotData) return snippet.snapshotData;
    if (currentQVoice?.starterCode?.code) {
      return JSON.stringify({
        code: currentQVoice.starterCode.code,
        language: currentQVoice.starterCode.language,
      });
    }
    return undefined;
  }, [codeSnippets, activeSnippetIdx, currentQVoice]);

  // ── Draggable split handlers ──────────────────────────────
  const handleSplitDividerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    splitDragging.current = true;
    const onPointerMove = (ev: PointerEvent) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = isMobile
        ? ((ev.clientY - rect.top) / rect.height) * 100
        : ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(Math.max(pct, 20), 70));
    };
    const onPointerUp = () => {
      splitDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [isMobile]);

  // Voice view: vertical split (voice vs transcript) on mobile
  const handleVoiceTranscriptSplitDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    splitDragging.current = true;
    const onPointerMove = (ev: PointerEvent) => {
      if (!splitDragging.current || !voiceSplitContainerRef.current) return;
      const rect = voiceSplitContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(Math.max(pct, 20), 70));
    };
    const onPointerUp = () => {
      splitDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, []);

  // Auto-activate editor and save/restore per-question content
  const prevQIndexRef = useRef(sessionQuestionIndex);
  useEffect(() => {
    const prevIdx = prevQIndexRef.current;
    const newIdx = sessionQuestionIndex;
    const questionChanged = prevIdx !== newIdx;

    // ── Save outgoing question's content ──
    if (questionChanged) {
      const wb = whiteboardRef.current;
      const ce = codeEditorRef.current;

      const savedDrawings = drawings.map((d, i) => {
        if (i === activeDrawingIdx && wb) {
          return { ...d, snapshotData: wb.getSnapshotData() ?? d.snapshotData };
        }
        return d;
      });
      const savedSnippets = codeSnippets.map((s, i) => {
        if (i === activeSnippetIdx) {
          const snapshot = ce?.getSnapshotData() ?? liveCodeSnapshotRef.current ?? s.snapshotData;
          return { ...s, snapshotData: snapshot };
        }
        return s;
      });
      liveCodeSnapshotRef.current = null;

      questionContentMapRef.current.set(prevIdx, {
        drawings: savedDrawings,
        activeDrawingIdx,
        codeSnippets: savedSnippets,
        activeSnippetIdx,
      });
    }

    // ── Rotate per-question clip recording ──
    if (questionChanged && recording.isRecording) {
      const incoming = sortedQuestions[newIdx];
      // Stop the outgoing clip, then start a fresh one for the new question.
      recording.stopAndUploadClip().catch(() => {}).finally(() => {
        if (incoming?.id) {
          recording.startClip(incoming.id);
        }
      });
    }

    // ── Restore incoming question's content (or create fresh) ──
    if (questionChanged) {
      const saved = questionContentMapRef.current.get(newIdx);
      if (saved) {
        setDrawings(saved.drawings);
        setActiveDrawingIdx(saved.activeDrawingIdx);
        setCodeSnippets(saved.codeSnippets);
        setActiveSnippetIdx(saved.activeSnippetIdx);
        setTimeout(() => {
          const activeD = saved.drawings[saved.activeDrawingIdx];
          if (activeD?.snapshotData) whiteboardRef.current?.loadScene(activeD.snapshotData);
          else whiteboardRef.current?.resetScene();
          const activeS = saved.codeSnippets[saved.activeSnippetIdx];
          if (activeS?.snapshotData) codeEditorRef.current?.loadScene(activeS.snapshotData);
        }, 400);
      } else {
        const freshDrawings = [{ id: crypto.randomUUID(), label: "Drawing 1", snapshotData: null as string | null }];
        const freshSnippets = [{ id: crypto.randomUUID(), label: "Snippet 1", snapshotData: null as string | null }];
        setDrawings(freshDrawings);
        setActiveDrawingIdx(0);
        setCodeSnippets(freshSnippets);
        setActiveSnippetIdx(0);
        setTimeout(() => {
          whiteboardRef.current?.resetScene();
        }, 150);
      }
    }

    // ── Auto-activate/deactivate the appropriate editor on question change ──
    if (questionChanged) {
      if (isCodingQuestion) {
        setCodeEditorActive(true);
        setWhiteboardActive(false);
      } else if (isWhiteboardQuestion) {
        setWhiteboardActive(true);
        setCodeEditorActive(false);
      } else {
        setCodeEditorActive(false);
        setWhiteboardActive(false);
      }
    }

    // ── Load starter code for fresh coding questions ──
    if (
      isCodingQuestion &&
      questionChanged &&
      currentQVoice?.starterCode?.code &&
      !questionContentMapRef.current.has(newIdx)
    ) {
      const starterData = JSON.stringify({
        code: currentQVoice.starterCode.code,
        language: currentQVoice.starterCode.language,
      });
      setTimeout(() => {
        codeEditorRef.current?.loadScene(starterData);
      }, 300);
    }

    prevQIndexRef.current = newIdx;
  }, [sessionQuestionIndex, isCodingQuestion, isWhiteboardQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-activate the correct editor whenever the session connects or the active
  // question type changes (covers first coding question at index 0, resume
  // mid-interview, and transitions — the old one-shot ref missed these cases).
  useEffect(() => {
    if (!sessionConnected) return;
    if (isCodingQuestion && codeEnabled) {
      setCodeEditorActive(true);
      setWhiteboardActive(false);
    } else if (isWhiteboardQuestion && whiteboardEnabled) {
      setWhiteboardActive(true);
      setCodeEditorActive(false);
    }
  }, [
    sessionConnected,
    sessionQuestionIndex,
    isCodingQuestion,
    isWhiteboardQuestion,
    codeEnabled,
    whiteboardEnabled,
  ]);

  // ── Render Helpers ────────────────────────────────────────────────
  // Big/mini swap layout (mobile + desktop theater mode reuse this later).
  const bigStageSwapStyle: React.CSSProperties = swapped
    ? { position: "absolute", right: 16, bottom: 100, width: 144, height: 112, zIndex: 20 }
    : {};
  const miniPipSwapStyle: React.CSSProperties = swapped
    ? { position: "relative", width: "100%", height: "100%", zIndex: 1 }
    : {};
  const swapEnabled = (isMobile || theaterMode) && avatarMode !== "none";

  const [avatarStyle, setAvatarStyle] = useState<React.CSSProperties>({
    position: "fixed",
    zIndex: 40,
    opacity: 0,
    pointerEvents: "none",
    visibility: "hidden",
  });

  useEffect(() => {
    if (avatarMode === "none") return;
    
    const toolsActive = whiteboardActive || codeEditorActive;
    const targetId = toolsActive ? "avatar-target-split" : "avatar-target-center";
    
    const updatePosition = () => {
      const target = document.getElementById(targetId);
      if (target) {
        const rect = target.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        setAvatarStyle({
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          zIndex: 40,
          opacity: 1,
          visibility: "visible",
          transition: "top 0.15s ease, left 0.15s ease, width 0.15s ease, height 0.15s ease",
          pointerEvents: "auto",
        });
      } else {
        // Keep last known position during split-panel layout transitions
      }
    };

    updatePosition();
    // Next frame + short RAF burst so the overlay lands ASAP after layout
    const raf1 = requestAnimationFrame(() => {
      updatePosition();
      requestAnimationFrame(updatePosition);
    });
    
    window.addEventListener("resize", updatePosition);
    
    const resizeObserver = new ResizeObserver(() => {
      updatePosition();
    });

    const target = document.getElementById(targetId);
    if (target) {
      resizeObserver.observe(target);
    }
    const splitContainer = voiceSplitContainerRef.current;
    if (splitContainer) {
      resizeObserver.observe(splitContainer);
    }

    const interval = setInterval(updatePosition, 100);

    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener("resize", updatePosition);
      resizeObserver.disconnect();
      clearInterval(interval);
    };
  }, [whiteboardActive, codeEditorActive, avatarMode]);

  // Kick Simli/Vidu media.play() the moment TTS/session speaking starts
  useEffect(() => {
    if (!sessionSpeaking || !isInteractiveVideoAvatar) return;
    const video =
      avatarMode === "vidu"
        ? vidu.remoteVideoRef.current
        : avatar.videoRef.current;
    if (!video) return;
    // Vidu plays speech on <video>. Simli plays speech on <audio> (video muted).
    video.muted = avatarMode !== "vidu";
    void video.play().catch(() => {});
    if (avatarMode === "simli") {
      const audio = avatar.audioRef.current;
      if (audio) {
        audio.muted = false;
        audio.volume = 1;
        void audio.play().catch(() => {});
      }
    }
  }, [sessionSpeaking, isInteractiveVideoAvatar, avatarMode, avatar.videoRef, avatar.audioRef, vidu.remoteVideoRef]);

  const renderSimliAvatarPlaceholder = (targetId: string) => {
    if (avatarMode === "none") return null;
    if (targetId === "avatar-target-center") {
      if (isMobile) {
        return <div id={targetId} className="h-full w-full" />;
      }
      return <div id={targetId} className={avatarMode === "static" ? "w-full max-h-[60vh] aspect-[16/9] lg:aspect-[2/1] max-w-5xl mx-auto" : "w-full max-h-[45vh] aspect-video mx-auto"} />;
    }
    return <div id={targetId} className={isMobile ? "w-full aspect-[9/16]" : "w-full aspect-video"} />;
  };

  /**
   * Zoom-style side-by-side tiles for Simli mode:
   * Left tile = persistent Simli avatar (placeholder div the fixed panel teleports into)
   * Right tile = candidate webcam
   */
  const renderSimliZoomTiles = (compact = false, hideCandidate = false, avatarTargetId = "avatar-target-center") => {
    if (hideCandidate) {
      return (
        <div
          className={cn(
            "relative flex w-full flex-col items-center justify-center overflow-hidden bg-zinc-900 ring-1 ring-white/10 transition-all duration-300",
            isMobile
              ? "h-full flex-1 rounded-none"
              : compact
                ? "aspect-video shrink-0 rounded-xl"
                : "aspect-[16/9] max-h-[52vh] shrink-0 rounded-xl lg:aspect-[2/1]",
            sessionSpeaking && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
          )}
        >
          <div id={avatarTargetId} className="absolute inset-0" />
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-md">
            <span className="text-xs font-medium text-white">{aiName}</span>
            {sessionSpeaking && <Volume2 className="h-3 w-3 animate-pulse text-green-400" />}
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "relative flex w-full overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10",
          compact
            ? "aspect-video max-h-[28vh]"
            : "aspect-[16/9] max-h-[52vh] w-full lg:aspect-[2/1]",
        )}
      >
        <div
          className={cn(
            "flex h-full w-full flex-row",
            compact ? "gap-1.5 p-1.5" : "gap-2 p-2 md:gap-4 md:p-4",
          )}
        >
          {/* Left tile — Simli avatar placeholder (fixed panel teleports here) */}
          <div
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-900 transition-all duration-300 md:rounded-2xl",
              sessionSpeaking && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
            )}
          >
            <div id={avatarTargetId} className="absolute inset-0" />
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-md">
              <span className="text-xs font-medium text-white">{aiName}</span>
              {sessionSpeaking && <Volume2 className="h-3 w-3 animate-pulse text-green-400" />}
            </div>
          </div>

          {/* Right tile — candidate webcam */}
          <div
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-900 transition-all duration-300 md:rounded-2xl",
              sessionListening && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
            )}
          >
            {displayCameraStream ? (
              <video
                ref={bindZoomCameraVideo}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 px-4">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800 text-3xl font-semibold text-zinc-400">
                  {(interviewContext.participantName || "C").charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            {/* Eye-contact / multi-face indicators */}
            {faceProctoringActive && displayCameraStream && (
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
              {sessionListening ? (
                <Mic className="h-3 w-3 animate-pulse text-green-400" />
              ) : displayCameraStream ? (
                <Video className="h-3 w-3 text-zinc-400" />
              ) : (
                <VideoOff className="h-3 w-3 text-zinc-400" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderVoiceZoomTiles = (compact = false, hideCandidate = false) => {
    if (hideCandidate) {
      return (
        <div
          className={cn(
            "relative flex w-full shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10 transition-all duration-300",
            compact ? "aspect-video" : "aspect-[16/9] max-h-[52vh] lg:aspect-[2/1]",
            sessionSpeaking && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
          )}
        >
          <img
            src="/avatars/woman-v1.png"
            alt="AI Avatar"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className={cn(
              "absolute inset-0 bg-black transition-opacity duration-300",
              sessionSpeaking ? "opacity-0" : "opacity-30",
            )}
          />
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-md">
            <span className="text-xs font-medium text-white">{aiName}</span>
            {sessionSpeaking && <Volume2 className="h-3 w-3 animate-pulse text-green-400" />}
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "relative flex w-full overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10",
          compact
            ? "aspect-video max-h-[28vh]"
            : "aspect-[16/9] max-h-[52vh] w-full lg:aspect-[2/1]",
        )}
      >
        <div
          className={cn(
            "flex h-full w-full flex-row",
            compact ? "gap-1.5 p-1.5" : "gap-2 p-2 md:gap-4 md:p-4",
          )}
        >
          <div
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-900 transition-all duration-300 md:rounded-2xl",
              sessionSpeaking && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
            )}
          >
            <img
              src="/avatars/woman-v1.png"
              alt="AI Avatar"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className={cn(
                "absolute inset-0 bg-black transition-opacity duration-300",
                sessionSpeaking ? "opacity-0" : "opacity-30",
              )}
            />
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-md">
              <span className="text-xs font-medium text-white">{aiName}</span>
              {sessionSpeaking && <Volume2 className="h-3 w-3 animate-pulse text-green-400" />}
            </div>
          </div>

          <div
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-900 transition-all duration-300 md:rounded-2xl",
              sessionListening && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
            )}
          >
            {displayCameraStream ? (
              <video
                ref={bindZoomCameraVideo}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800 text-3xl font-semibold text-zinc-400">
                {(interviewContext.participantName || "C").charAt(0).toUpperCase()}
              </div>
            )}
            {/* Eye-contact / multi-face indicators (voice-only Zoom tile) */}
            {faceProctoringActive && displayCameraStream && (
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
              {sessionListening ? (
                <Mic className="h-3 w-3 animate-pulse text-green-400" />
              ) : displayCameraStream ? (
                <Video className="h-3 w-3 text-zinc-400" />
              ) : (
                <VideoOff className="h-3 w-3 text-zinc-400" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────
  return shouldShowCompletionScreen ? completionScreen : (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      
      {/* Persistent avatar container (NEVER moved in DOM to prevent WebRTC unmount) */}
      <div
        style={swapEnabled ? { ...avatarStyle, ...bigStageSwapStyle } : avatarStyle}
        className={avatarMode !== "none" ? "flex flex-col items-center justify-center overflow-hidden rounded-2xl" : "hidden"}
      >
        {avatarMode === "vidu" ? (
          <ViduS1Panel
            status={viduLiveArmed ? vidu.status : "idle"}
            videoRef={vidu.remoteVideoRef}
            aiName={aiName}
            error={vidu.error}
            onVideoElementReady={vidu.reattachRemoteView}
            className="w-full h-full"
          />
        ) : avatarMode === "simli" ? (
          <SimliAvatarPanel
            status={avatar.status}
            videoRef={avatar.videoRef}
            audioRef={avatar.audioRef}
            aiName={aiName}
            error={avatar.error}
            isSpeaking={sessionSpeaking}
            mediaLive={avatar.mediaLive}
            className="w-full h-full"
          />
        ) : avatarMode === "static" ? (
          <StaticAvatarPanel
            aiName={aiName}
            candidateName={interviewContext.participantName || "Candidate"}
            compactMode={whiteboardActive || codeEditorActive}
            status={
              sessionSpeaking ? "speaking"
              : sessionListening ? "listening"
              : "idle"
            }
            cameraStream={displayCameraStream}
            className="w-full h-full"
          />
        ) : null}
      </div>

      {/* Saving overlay */}
      {isSaving && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 text-lg font-medium">Saving interview data...</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This will only take a moment.
          </p>
        </div>
      )}

      {/* Integrity Warning Banner */}
      <div 
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 rounded-full bg-red-500 text-white px-4 py-2 shadow-xl transition-all duration-300 ${
          (faceAnalysis.latestResult?.multipleFacesDetected) || 
          (faceProctoringActive && recording.isRecording && faceAnalysis.latestResult && !faceAnalysis.latestResult.eyeContact)
            ? "translate-y-0 opacity-100" 
            : "-translate-y-12 opacity-0 pointer-events-none"
        }`}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="text-sm font-semibold whitespace-nowrap">
          {faceAnalysis.latestResult?.multipleFacesDetected ? "Multiple faces detected in frame" : "Please look at the camera"}
        </span>
      </div>

      {/* Header */}
      <div className="shrink-0 border-b bg-card px-3 py-2 md:px-6 md:py-3">
        {/* ── Mobile connected header: Q | Timer | End ── */}
        {(sessionConnected || preview) && isMobile ? (
          <div className="flex items-center gap-2">
            {/* Q badge */}
            {sortedQuestions.length > 0 && sessionQuestionIndex !== undefined && (
              <Badge variant="secondary" className="shrink-0 px-3 py-1 text-sm font-extrabold bg-slate-100 text-slate-800 border shadow-sm">
                Q{sessionQuestionIndex + 1}/{sortedQuestions.length}
              </Badge>
            )}
            {/* Timer — grows to fill remaining space */}
            {remainingSeconds !== null && (
              <div className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums shadow-sm border ${isTimeLow ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-primary/10 text-primary border-primary/20"}`}>
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{formatTime(remainingSeconds)} left</span>
              </div>
            )}
            {/* End button — always rightmost */}
            <Button
              size="icon"
              variant="destructive"
              className="shrink-0 h-8 w-8 rounded-full"
              onClick={() => setShowEndDialog(true)}
              title="End interview"
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          /* ── Desktop / pre-connect header ── */
          <div className="flex items-center justify-between relative">
            <div className="mr-2 min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold md:text-base">{interviewTitle}</h1>
              <p className="hidden text-xs text-muted-foreground md:block">
                {(useZoomLayout || useSimliZoom) ? `Interview with ${aiName}` : `Voice Interview with ${aiName}`}
              </p>
            </div>

            {/* Centered Bold Timer and Question Badge */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
              {remainingSeconds !== null && (
                <div className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold tabular-nums shadow-sm border ${isTimeLow ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-primary/10 text-primary border-primary/20"}`}>
                  <Clock className="h-4 w-4" />
                  <span>{formatTime(remainingSeconds)} left</span>
                </div>
              )}
              {sortedQuestions.length > 0 && sessionQuestionIndex !== undefined && (
                <Badge variant="secondary" className="px-4 py-1.5 text-sm font-extrabold bg-slate-100 text-slate-800 border shadow-sm">
                  Q{sessionQuestionIndex + 1} / {sortedQuestions.length}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 z-10">
              <Badge
                variant={preview ? "outline" : sessionConnected ? "default" : "secondary"}
              >
                {preview ? "Preview" : sessionConnected ? "Connected" : "Disconnected"}
              </Badge>
              {avatarMode !== "none" && (
                <Button
                  size="sm"
                  variant={theaterMode ? "default" : "outline"}
                  onClick={() => setTheaterMode((v) => !v)}
                  title="Theater mode"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}
              {/* End interview button — moved to top bar */}
              {(sessionConnected || preview) && (
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setShowEndDialog(true)}
                  title="End interview"
                >
                  <PhoneOff className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-6 mt-2 flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Main content: left (voice / whiteboard) + draggable divider + right (transcript) */}
      <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel — voice visualization or whiteboard */}
        <div className="flex min-h-0 flex-1 flex-col" style={isMobile ? undefined : { minWidth: MIN_PANEL_WIDTH }}>
          {(whiteboardActive || codeEditorActive) ? (
            /* ── Whiteboard or Code Editor main view ────────────── */
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* Minimized voice status bar */}
              <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
                {sessionSpeaking && (
                  <div className="flex items-center gap-1.5 text-primary">
                    <Volume2 className="h-4 w-4 animate-pulse" />
                    <span className="text-xs font-medium">{aiName} speaking</span>
                  </div>
                )}
                {sessionListening && (
                  <div className="flex items-center gap-1.5 text-secondary-500">
                    <div className="relative h-4 w-4">
                      <Mic className="absolute inset-0 h-full w-full text-muted-foreground/30" />
                      <div
                        className="absolute inset-0 overflow-hidden transition-[clip-path] duration-150 ease-out"
                        style={{ clipPath: `inset(${(1 - voice.audioLevel) * 100}% 0 0 0)` }}
                      >
                        <Mic className="h-full w-full text-secondary-400" />
                      </div>
                    </div>
                    <span className="text-xs font-medium">Listening</span>
                  </div>
                )}
                {sessionProcessing && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-medium">Thinking</span>
                  </div>
                )}
                {sessionTransitioning && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-medium">
                      {voice.transitionDirection === "previous" ? "Previous question..." : "Next question..."}
                    </span>
                  </div>
                )}
                {!sessionSpeaking && !sessionListening && !sessionProcessing && !sessionTransitioning && (
                  <span className="text-xs text-muted-foreground">
                    {sessionConnected
                      ? `Voice active — ${whiteboardActive ? "draw" : "code"} freely`
                      : "Voice disconnected"}
                  </span>
                )}
                {/* Live STT interim caption hidden; ASR still runs and saves to transcript */}
              </div>
              {/* Tabs — conditional on whiteboard or code editor */}
              {whiteboardActive ? (
              <div className="flex items-center gap-1 border-b bg-card px-3 py-1.5">
                {drawings.map((d, i) => (
                  <div
                    key={d.id}
                    className={`group flex items-center gap-0.5 rounded-md text-xs font-medium transition-colors ${
                      i === activeDrawingIdx
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {editingDrawingId === d.id ? (
                      <input
                        autoFocus
                        defaultValue={d.label}
                        className="w-20 rounded bg-transparent px-2 py-1 text-xs outline-none ring-1 ring-primary"
                        onBlur={(e) => renameDrawing(d.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameDrawing(d.id, e.currentTarget.value);
                          if (e.key === "Escape") setEditingDrawingId(null);
                        }}
                      />
                    ) : (
                      <button
                        className="px-2.5 py-1"
                        onClick={() => switchDrawing(i)}
                        onDoubleClick={() => setEditingDrawingId(d.id)}
                        title="Double-click to rename"
                      >
                        {d.label}
                      </button>
                    )}
                    {drawings.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteDrawing(i); }}
                        className={`mr-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                          i === activeDrawingIdx
                            ? "hover:bg-primary-foreground/20"
                            : "hover:bg-muted-foreground/20"
                        }`}
                        title="Delete drawing"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addNewDrawing}
                  className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                  title="New drawing"
                >
                  <Plus className="h-3 w-3" />
                  New
                </button>
                <div className="ml-auto">
                  <button
                    onClick={handleManualSave}
                    disabled={saveStatus === "saving"}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      saveStatus === "saved"
                        ? "text-secondary-600 dark:text-secondary-400"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    title="Save drawing"
                  >
                    {saveStatus === "saving" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : saveStatus === "saved" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    {saveStatus === "saved" ? "Saved" : "Save"}
                  </button>
                </div>
              </div>
              ) : (
              <div className="flex items-center gap-1 border-b bg-card px-3 py-1.5">
                {codeSnippets.map((s, i) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-0.5 rounded-md text-xs font-medium transition-colors ${
                      i === activeSnippetIdx
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {editingSnippetId === s.id ? (
                      <input
                        autoFocus
                        defaultValue={s.label}
                        className="w-20 rounded bg-transparent px-2 py-1 text-xs outline-none ring-1 ring-primary"
                        onBlur={(e) => renameCodeSnippet(s.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameCodeSnippet(s.id, e.currentTarget.value);
                          if (e.key === "Escape") setEditingSnippetId(null);
                        }}
                      />
                    ) : (
                      <button
                        className="px-2.5 py-1"
                        onClick={() => switchCodeSnippet(i)}
                        onDoubleClick={() => setEditingSnippetId(s.id)}
                        title="Double-click to rename"
                      >
                        {s.label}
                      </button>
                    )}
                    {codeSnippets.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCodeSnippet(i); }}
                        className={`mr-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                          i === activeSnippetIdx
                            ? "hover:bg-primary-foreground/20"
                            : "hover:bg-muted-foreground/20"
                        }`}
                        title="Delete snippet"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addNewCodeSnippet}
                  className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                  title="New snippet"
                >
                  <Plus className="h-3 w-3" />
                  New
                </button>
                <div className="ml-auto">
                  <button
                    onClick={handleCodeManualSave}
                    disabled={codeSaveStatus === "saving"}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      codeSaveStatus === "saved"
                        ? "text-secondary-600 dark:text-secondary-400"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    title="Save snippet"
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
              </div>
              )}
              {/* Canvas — fills remaining space */}
              <div className="flex-1 min-h-0">
                {whiteboardActive && currentQVoice ? (
                  /* Side-by-side on desktop, stacked on mobile */
                  <div ref={splitContainerRef} className={isMobile ? "flex h-full flex-col" : "flex h-full"}>
                    {/* Problem panel */}
                    <div
                      className={`min-w-0 shrink-0 overflow-y-auto overflow-x-hidden p-4 code-scrollbar flex flex-col ${isMobile ? "border-b" : ""}`}
                      style={isMobile ? { height: `${splitPercent}%`, minHeight: 80 } : { width: `${splitPercent}%`, minWidth: 180 }}
                    >
                      {useZoomLayout ? (
                        <div className="mb-4 shrink-0 border-b border-white/5 pb-4">
                          {renderVoiceZoomTiles(true)}
                        </div>
                      ) : useSimliZoom ? (
                        <div className="mb-4 shrink-0 border-b border-white/5 pb-4">
                          {renderSimliZoomTiles(true, false, "avatar-target-split")}
                        </div>
                      ) : (
                        <div className="mb-4 shrink-0 border-b border-white/5 pb-4">
                          {renderSimliAvatarPlaceholder("avatar-target-split")}
                        </div>
                      )}
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Problem</span>
                        </div>
                      <p className="mb-3 text-sm font-medium leading-snug">{currentQVoice.text}</p>
                      {currentQVoice.description && (
                        <p className="mb-3 text-xs text-muted-foreground whitespace-pre-wrap">{currentQVoice.description}</p>
                      )}
                      </div>
                    </div>
                    {/* Draggable divider */}
                    <div
                      className={`group flex items-center justify-center border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20 ${isMobile ? "h-1 cursor-row-resize border-t border-b touch-none" : "w-1 cursor-col-resize border-l border-r touch-none"}`}
                      onPointerDown={handleSplitDividerDown}
                    />
                    {/* Whiteboard */}
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                      <WhiteboardCanvas
                        ref={whiteboardRef}
                        fillParent
                        dark={isDark}
                        onAutoSave={handleWhiteboardAutoSave}
                        autoSaveInterval={5000}
                        onDirty={handleWhiteboardDirty}
                      />
                    </div>
                  </div>
                ) : whiteboardActive ? (
                  <WhiteboardCanvas
                    ref={whiteboardRef}
                    fillParent
                    dark={isDark}
                    onAutoSave={handleWhiteboardAutoSave}
                    autoSaveInterval={5000}
                    onDirty={handleWhiteboardDirty}
                  />
                ) : codeEditorActive && currentQVoice ? (
                  /* Side-by-side on desktop, stacked on mobile */
                  <div ref={splitContainerRef} className={isMobile ? "flex h-full flex-col" : "flex h-full"}>
                    {/* Problem panel */}
                    <div
                      className={`min-w-0 shrink-0 overflow-y-auto overflow-x-hidden p-4 code-scrollbar flex flex-col ${isMobile ? "border-b" : ""}`}
                      style={isMobile ? { height: `${splitPercent}%`, minHeight: 80 } : { width: `${splitPercent}%`, minWidth: 180 }}
                    >
                      {useZoomLayout ? (
                        <div className="mb-4 shrink-0 border-b border-white/5 pb-4">
                          {renderVoiceZoomTiles(true, true)}
                        </div>
                      ) : useSimliZoom ? (
                        <div className="mb-4 shrink-0 border-b border-white/5 pb-4">
                          {renderSimliZoomTiles(true, true, "avatar-target-split")}
                        </div>
                      ) : (
                        <div className="mb-4 shrink-0 border-b border-white/5 pb-4">
                          {renderSimliAvatarPlaceholder("avatar-target-split")}
                        </div>
                      )}
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Problem</span>
                        </div>
                      <p className="mb-3 text-sm font-medium leading-snug">{currentQVoice.text}</p>
                      {currentQVoice.description && (
                        <p className="mb-3 text-xs text-muted-foreground">{currentQVoice.description}</p>
                      )}
                      {/* Candidate webcam — replaces duplicate starter-code panel (editor has starter on the right) */}
                      <div
                        className={cn(
                          "relative mt-auto aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10 transition-all duration-300",
                          sessionListening && "ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
                        )}
                      >
                        {displayCameraStream ? (
                          <video
                            ref={bindZoomCameraVideo}
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
                          </div>
                        )}
                        {faceProctoringActive && displayCameraStream && (
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
                          {sessionListening ? (
                            <Mic className="h-3 w-3 animate-pulse text-green-400" />
                          ) : (
                            <Video className="h-3 w-3 text-zinc-400" />
                          )}
                        </div>
                      </div>
                      </div>
                    </div>
                    {/* Draggable divider */}
                    <div
                      className={`group flex items-center justify-center border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20 ${isMobile ? "h-1 cursor-row-resize border-t border-b touch-none" : "w-1 cursor-col-resize border-l border-r touch-none"}`}
                      onPointerDown={handleSplitDividerDown}
                    />
                    {/* Code editor */}
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                      <CodeEditorCanvas
                        key={`code-${sessionQuestionIndex}`}
                        ref={codeEditorRef}
                        fillParent
                        dark={isDark}
                        initialData={codeEditorInitialData}
                        templates={currentQVoice?.starterCode?.templates}
                        onAutoSave={handleCodeAutoSave}
                        autoSaveInterval={5000}
                        onDirty={handleCodeDirty}
                      />
                    </div>
                  </div>
                ) : (
                   <CodeEditorCanvas
                    key={`code-${sessionQuestionIndex}`}
                    ref={codeEditorRef}
                    fillParent
                    dark={isDark}
                    initialData={codeEditorInitialData}
                    templates={currentQVoice?.starterCode?.templates}
                    onAutoSave={handleCodeAutoSave}
                    autoSaveInterval={5000}
                    onDirty={handleCodeDirty}
                  />
                )}
              </div>
            </div>
          ) : useZoomLayout ? (
            <div
              ref={voiceSplitContainerRef}
              data-tour="voice-status"
              className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-3 md:gap-3 md:p-6"
            >
              {sessionConnected && currentQuestionText && (
                <div className="w-full max-w-5xl shrink-0">
                  <div className="relative rounded-2xl border border-primary/10 bg-gradient-to-b from-card/50 to-card p-4 shadow-xl backdrop-blur-md md:p-5">
                    <div className="absolute -top-3 left-6 flex items-center gap-2 rounded-full bg-primary px-3 py-1 shadow-lg">
                      <FileText className="h-3.5 w-3.5 text-primary-foreground" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                        Current Question
                      </span>
                    </div>
                    <p className="pt-2 text-center text-base font-medium leading-relaxed md:text-xl">
                      {formatTranscriptText(currentQuestionText || "")}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex w-full max-w-5xl shrink-0 items-center justify-center">
                {renderVoiceZoomTiles(false)}
              </div>
              {!sessionConnected && (
                <Button
                  size="lg"
                  disabled={isStartingInterview}
                  onClick={() => { void handleStartInterview(); }}
                  className="mt-2 gap-2 rounded-full px-8"
                >
                  {isStartingInterview ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                  {isStartingInterview ? "Connecting..." : "Start Voice Interview"}
                </Button>
              )}
              {!sessionConnected && isStartingInterview && (
                <p className="text-sm text-muted-foreground">
                  Connecting to the interview. This can take a few seconds.
                </p>
              )}
              {sessionConnected && !sessionListening && !sessionSpeaking && (
                <p className="text-sm text-muted-foreground">
                  Click the mic to start speaking
                </p>
              )}
              {sessionConnected && sessionListening && !sessionSpeaking && (
                <p className="text-sm text-muted-foreground">
                  Speak naturally — AI will respond automatically
                </p>
              )}
            </div>
          ) : useSimliZoom ? (
            /* ── Simli real-time: zoom-style side-by-side tile layout ── */
            <div
              ref={voiceSplitContainerRef}
              data-tour="voice-status"
              className={
                isMobile
                  ? "flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-0"
                  : "flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-3 md:gap-3 md:p-6"
              }
            >
              {sessionConnected && currentQuestionText && (
                <div className={isMobile ? "w-full max-w-5xl shrink-0 px-3 pt-5" : "w-full max-w-5xl shrink-0 px-3"}>
                  <div className="relative rounded-2xl border border-primary/10 bg-gradient-to-b from-card/50 to-card p-4 shadow-xl backdrop-blur-md md:p-5">
                    <div className="absolute -top-3 left-6 flex items-center gap-2 rounded-full bg-primary px-3 py-1 shadow-lg">
                      <FileText className="h-3.5 w-3.5 text-primary-foreground" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                        Current Question
                      </span>
                    </div>
                    <p className="pt-2 text-center text-base font-medium leading-relaxed md:text-xl">
                      {formatTranscriptText(currentQuestionText || "")}
                    </p>
                  </div>
                </div>
              )}
              <div className={isMobile ? "flex h-full w-full flex-1 items-center justify-center" : "flex w-full max-w-5xl shrink-0 items-center justify-center"}>
                {/* Mobile / theater mode: single full-stage avatar tile — candidate
                    camera renders as the tappable mini/big DraggablePip below,
                    matching Vidu/static's big/mini swap layout. */}
                {renderSimliZoomTiles(false, swapEnabled)}
              </div>
              {!sessionConnected && (
                <Button
                  size="lg"
                  disabled={isStartingInterview}
                  onClick={() => { void handleStartInterview(); }}
                  className="mt-2 gap-2 rounded-full px-8"
                >
                  {isStartingInterview ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                  {isStartingInterview ? "Connecting..." : "Start Interview"}
                </Button>
              )}
              {!sessionConnected && isStartingInterview && (
                <p className="text-sm text-muted-foreground">
                  Connecting to the interview. This can take a few seconds.
                </p>
              )}
              {sessionConnected && !sessionListening && !sessionSpeaking && (
                <p className="text-sm text-muted-foreground">
                  Click Unmute, answer, then click Submit when you&apos;re done
                </p>
              )}
              {sessionConnected && sessionListening && !sessionSpeaking && (
                <p className="text-sm text-muted-foreground">
                  Speak your answer, then click Submit
                </p>
              )}
            </div>
          ) : (
            /* ── Vidu / static: center avatar placeholder ── */
            <div
              ref={voiceSplitContainerRef}
              data-tour="voice-status"
              className={`flex flex-1 flex-col ${isMobile ? "min-h-0" : ""}`}
            >
              <div
                className={`flex flex-col items-center justify-center gap-4 ${
                  isMobile
                    ? mobileTranscriptCollapsed
                      ? "min-h-0 flex-1 py-0"
                      : "min-h-0 shrink-0 py-0"
                    : "flex-1"
                }`}
                style={
                  isMobile
                    ? mobileTranscriptCollapsed
                      ? { minHeight: 80 }
                      : { height: `${splitPercent}%`, minHeight: 80 }
                    : undefined
                }
              >
                {sessionConnected && currentQuestionText && (
                  <div className={`mb-4 w-full max-w-5xl px-6 animate-fade-in animate-slide-in-bottom ${isMobile ? "pt-5" : ""}`}>
                    <div className="relative rounded-2xl border border-primary/10 bg-gradient-to-b from-card/50 to-card p-6 shadow-2xl backdrop-blur-md">
                      <div className="absolute -top-3 left-6 flex items-center gap-2 rounded-full bg-primary px-3 py-1 shadow-lg">
                        <FileText className="h-3.5 w-3.5 text-primary-foreground" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                          Current Question
                        </span>
                      </div>
                      <p className="text-center text-lg font-medium leading-relaxed text-foreground md:text-xl pt-2">
                        {formatTranscriptText(currentQuestionText || "")}
                      </p>
                    </div>
                  </div>
                )}
                <div className={isMobile ? "flex h-full w-full flex-1 justify-center" : "w-full max-w-5xl px-4 flex justify-center"}>
                  {renderSimliAvatarPlaceholder("avatar-target-center")}
                </div>

              {!sessionConnected && (
                <Button
                  size="lg"
                  disabled={isStartingInterview}
                  onClick={() => { void handleStartInterview(); }}
                  className="gap-2 rounded-full px-8"
                >
                  {isStartingInterview ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                  {isStartingInterview
                    ? "Connecting..."
                    : isPremiumVidu
                      ? "Start Premium Interview"
                      : "Start Voice Interview"}
                </Button>
              )}

              {!sessionConnected && isStartingInterview && (
                <p className="text-sm text-muted-foreground">
                  Connecting to the interview. This can take a few seconds.
                </p>
              )}
              {sessionConnected && !sessionListening && !isCodingQuestion && (
                <p className="text-sm text-muted-foreground">
                  Click Unmute, answer, then click Submit when you&apos;re done
                </p>
              )}
              {sessionConnected && !sessionListening && isCodingQuestion && (
                <p className="text-sm text-muted-foreground">
                  Solve the problem in the editor, then click Submit to continue
                </p>
              )}
              {sessionConnected && sessionListening && !sessionSpeaking && (
                <p className="text-sm text-muted-foreground">
                  Speak your answer, then click Submit
                </p>
              )}
              </div>


            </div>
          )}
        </div>

        {/* ── Draggable divider (desktop only, legacy transcript layout) ── */}
        {false && (
          <div
            className="group flex w-1 cursor-col-resize touch-none items-center justify-center border-l border-r border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20"
            onPointerDown={onDragStart}
          />
        )}

        {false && (
        <div
          ref={rightPanelRef}
          className="flex min-h-0 shrink-0 flex-col border-l bg-card"
          style={{ width: desktopTranscriptCollapsed ? COLLAPSED_RIGHT_DOCK_WIDTH : rightWidth }}
        >
          {desktopTranscriptCollapsed ? (
            <button
              type="button"
              className="flex h-full w-full flex-col items-center justify-start gap-3 px-2 py-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              onClick={() => setDesktopTranscriptCollapsed(false)}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span
                className="text-[11px] font-medium uppercase tracking-[0.2em]"
                style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
              >
                Transcript
              </span>
            </button>
          ) : (
            <>
              {/* Transcript section */}
              <div
                data-tour="voice-transcript"
                className="flex min-h-0 flex-col overflow-hidden"
                style={
                  chatOpen && chatEnabled
                    ? { height: `${chatSplitPercent}%` }
                    : { flex: 1 }
                }
              >
                <button
                  type="button"
                  className="flex items-center justify-between border-b px-4 py-2 text-left"
                  onClick={() => setDesktopTranscriptCollapsed(true)}
                >
                  <p className="text-xs font-medium text-muted-foreground">Transcript</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-3 p-4">
                    {preview ? (
                      <>
                        <div className="flex items-start gap-1.5 text-sm">
                          <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                          <div>
                            <span className="font-medium text-primary">{aiName}:</span>{" "}
                            Welcome! Let&apos;s begin the interview. Could you start by telling me about yourself?
                          </div>
                        </div>
                        <div className="flex items-start gap-1.5 text-sm">
                          <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          <div>
                            <span className="font-medium text-secondary-600 dark:text-secondary-400">You:</span>{" "}
                            Sure, I have been working as a software engineer for...
                          </div>
                        </div>
                        <p className="text-center text-xs text-muted-foreground italic">(sample transcript)</p>
                      </>
                    ) : messages.length === 0 && !sessionAiText && !voice.userTranscript ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center animate-pulse">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                          <Volume2 className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-sm font-medium">Starting conversation...</p>
                        <p className="mt-1 text-xs text-muted-foreground px-6">
                          {aiName} is preparing to introduce themselves. 
                          Please make sure your volume is up.
                        </p>
                      </div>
                    ) : (
                      <>
                        {messages.map((msg) => (
                          <div key={msg.id} className="flex items-start gap-1.5 text-sm">
                            {msg.role === "user" ? (
                              msg.source === "chat"
                                ? <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                : <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            ) : (
                              <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            )}
                            <div>
                              <span
                                className={`font-medium ${
                                  msg.role === "user"
                                    ? "text-secondary-600 dark:text-secondary-400"
                                    : "text-primary"
                                }`}
                              >
                                {msg.role === "user" ? "You" : aiName}:
                              </span>{" "}
                              {formatTranscriptText(msg.content)}
                            </div>
                          </div>
                        ))}
                        {/* Live interim candidate STT hidden from take UI */}
                        {sessionProcessing && !sessionAiText && (
                          <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                            <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary/60" />
                            <span className="text-xs italic">Thinking...</span>
                          </div>
                        )}
                        {sessionAiText && (() => {
                          const alreadyInMessages = hasRecentAssistantTranscript(messages, sessionAiText);
                          if (alreadyInMessages) return null;
                          return (
                            <div className="flex items-start gap-1.5 text-sm">
                              <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                              <div>
                                <span className="font-medium text-primary">{aiName}:</span>{" "}
                                <span className="text-muted-foreground">{sessionAiText}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                </ScrollArea>
              </div>

              {/* Draggable horizontal divider */}
              {chatOpen && chatEnabled && (
                <div
                  className="group flex h-1 cursor-row-resize touch-none items-center justify-center border-t border-b border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20"
                  onPointerDown={onChatDragStart}
                />
              )}

              {/* Chat section (toggled via control bar) */}
              {chatOpen && chatEnabled && (
                <div
                  className="flex min-h-0 flex-col overflow-hidden"
                  style={{ height: `${100 - chatSplitPercent}%` }}
                >
                  <div className="flex items-center border-b px-4 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Chat</p>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-3 p-4">
                      {chatMessages.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          Send a message to start chatting.
                        </p>
                      ) : (
                        chatMessages.map((msg) => (
                          <div key={msg.id} className="flex items-start gap-1.5 text-sm">
                            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            <p className="text-foreground">{msg.content}</p>
                          </div>
                        ))
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  </ScrollArea>
                  <div className="flex items-center gap-2 border-t px-3 py-2">
                    <Input
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      className="h-8 flex-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) {
                          e.preventDefault();
                          handleSendChat(chatInput);
                          setChatInput("");
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      disabled={!chatInput.trim()}
                      onClick={() => {
                        handleSendChat(chatInput);
                        setChatInput("");
                        chatInputRef.current?.focus();
                      }}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        )}

      </div>

      {/* ── Bottom control bar ─────────────────────────────── */}
      {sessionListening && (
        <div className="absolute bottom-[124px] left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-background/95 px-4 py-2 shadow-lg backdrop-blur-md border border-primary/20 animate-in fade-in slide-in-from-bottom-2">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
          <span className="text-sm font-bold tracking-wide text-foreground">
            Recording {formatRecordingTime(recordingSeconds)}
          </span>
          
          {/* Waveform animation next to recording */}
          <div className="flex items-center gap-0.5 h-4 w-20 overflow-hidden ml-1 border-l pl-2 border-border">
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="inline-block w-[2.5px] rounded-full bg-primary"
                style={{
                  height: `${20 + (voice.audioLevel ?? 0) * 100 * (0.4 + 0.6 * Math.sin((i / 14) * Math.PI))}%`,
                  animation: `waveBar 0.8s ease-in-out infinite`,
                  animationDelay: `${(i * 0.05).toFixed(2)}s`,
                  minHeight: "3px",
                  maxHeight: "100%",
                  opacity: 0.7 + 0.3 * ((i % 3) / 3),
                }}
              />
            ))}
          </div>
        </div>
      )}
      {(sessionConnected || preview) && (
        <div className={`relative flex items-center justify-between border-t bg-card px-4 pt-14 pb-8 min-h-[152px] ${preview ? " pointer-events-none" : ""}`}>
          
          {/* Left section: empty spacer to keep layout balanced */}
          <div className="flex items-center gap-3 min-w-[120px]">
          </div>

          {/* Center section: Unified Controls */}
          <div className="absolute left-1/2 top-[calc(50%-0.25rem)] -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center gap-2 md:gap-4">
            {whiteboardEnabled && (
              <button
                onClick={handleToggleWhiteboard}
                className={`group flex flex-col items-center justify-start pt-1 gap-1 w-16 h-16 transition-colors ${whiteboardActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <div className={`flex shrink-0 items-center justify-center h-12 w-12 rounded-full transition-all duration-300 ${whiteboardActive ? "bg-primary/20" : "bg-muted group-hover:bg-muted/80"}`}>
                  <PenLine className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium leading-none">Whiteboard</span>
              </button>
            )}

            <button
                data-tour="voice-send"
                type="button"
                disabled={
                  sessionProcessing ||
                  sessionTransitioning ||
                  sentFlash ||
                  avatarSpeakingForUnmute ||
                  // Simli: prevent unmuting until avatar finishes reading the question.
                  (isSimliLiveInterview &&
                    !sessionListening &&
                    !isCodingQuestion &&
                    !simliQuestionFinished) ||
                  // Simli: first question needs an explicit "Unmute to speak" acknowledgement.
                  (isSimliLiveInterview &&
                    !sessionListening &&
                    !isCodingQuestion &&
                    sessionQuestionIndex === 0 &&
                    !firstUnmutePromptAcknowledged)
                }
                onClick={() => {
                  if (sentFlash) return;
                  // Coding questions: Submit advances to the next question (no unmute/speak).
                  if (isCodingQuestion && !sessionListening) {
                    void handleNextQuestion();
                    setSentFlash(true);
                    setTimeout(() => setSentFlash(false), 1800);
                    return;
                  }
                  if (isPremiumVidu) {
                    premiumLog.info("unmute/submit click", {
                      action: sessionListening ? "submit" : "unmute",
                      viduStatus: vidu.status,
                      sessionConnected,
                      sessionSpeaking,
                      sessionListening,
                      disabledWouldHaveBeenSpeaking: sessionSpeaking,
                    });
                    if (sessionListening) {
                      void submitViduTurn();
                      setSentFlash(true);
                      setTimeout(() => setSentFlash(false), 1800);
                    } else {
                      void startViduMicCapture();
                    }
                    return;
                  }
                  if (sessionListening) {
                    voice.stopListening();
                    void voice.commitTurn?.();
                    setSentFlash(true);
                    setTimeout(() => setSentFlash(false), 1800);
                  } else {
                    voice.startListening();
                  }
                }}
                className={cn(
                  "group relative flex items-center justify-center gap-3 h-14 px-8 sm:px-10 rounded-full transition-all duration-300 shadow-md",
                  "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
                  sentFlash
                    ? "bg-green-500 text-white scale-105"
                    : sessionListening
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : avatarSpeakingForUnmute ||
                          (isSimliLiveInterview &&
                            !isCodingQuestion &&
                            !simliQuestionFinished) ||
                          (isSimliLiveInterview &&
                            !isCodingQuestion &&
                            sessionQuestionIndex === 0 &&
                            !firstUnmutePromptAcknowledged)
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                  {sentFlash && (
                    <span className="absolute inset-0 rounded-full animate-[sendRipple_0.6s_ease-out_forwards] bg-green-400/50" />
                  )}
                  {sentFlash ? (
                    <Check className="h-6 w-6" />
                  ) : sessionListening ? (
                    <Send className="h-6 w-6" />
                  ) : isCodingQuestion ? (
                    <Send className="h-6 w-6" />
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                  <span className="text-sm sm:text-base font-semibold whitespace-nowrap">
                    {sentFlash
                      ? "Submitted"
                      : sessionListening
                        ? "Submit Response"
                        : isCodingQuestion
                          ? "Submit"
                          : avatarSpeakingForUnmute
                            ? "Please wait…"
                            : "Unmute to Speak"}
                  </span>
            </button>

            {codeEnabled && (
              <button
                onClick={handleToggleCodeEditor}
                className={`group flex flex-col items-center justify-start pt-1 gap-1 w-16 h-16 transition-colors ${codeEditorActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <div className={`flex shrink-0 items-center justify-center h-12 w-12 rounded-full transition-all duration-300 ${codeEditorActive ? "bg-primary/20" : "bg-muted group-hover:bg-muted/80"}`}>
                  <Code2 className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium leading-none">Code</span>
              </button>
            )}
          </div>

          {/* Right section: empty spacer to match left flex align */}
          <div className="min-w-[120px] h-9" />

        </div>
      )}


      {/* ── Camera PIP: interactive non-simli (non-coding) + voice-only whiteboard, plus
           Simli on mobile/theater mode (big/mini swap layout). Desktop Simli (swap
           disabled) keeps the camera embedded in the zoom tile instead. ────── */}
      {displayCameraStream && !codeEditorActive && (!useSimliZoom && isInteractiveVideoAvatar || (useSimliZoom && swapEnabled) || (useZoomLayout && whiteboardActive)) && (
        <DraggablePip
          onTap={swapEnabled ? () => setSwapped((v) => !v) : undefined}
          swapStyle={swapEnabled ? miniPipSwapStyle : undefined}
        >
          <video
            ref={bindCameraPipVideo}
            autoPlay
            playsInline
            muted
            className="h-28 w-36 object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
            <Video className="h-2.5 w-2.5 text-white" />
            <span className="text-[9px] text-white">Camera</span>
          </div>
          
          {/* Eye Contact Indicator */}
          {faceProctoringActive && (
          <div className="absolute top-1 right-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
            <div className={`h-1.5 w-1.5 rounded-full ${faceAnalysis.latestResult?.eyeContact ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-red-500'}`} />
            <span className="text-[9px] text-white">Eye Contact</span>
          </div>
          )}

          {/* Emotion Indicator (if available) */}
          {faceProctoringActive && faceAnalysis.latestResult?.dominantEmotion && (
            <div className="absolute top-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
              <span className="text-[9px] text-white capitalize">{faceAnalysis.latestResult.dominantEmotion}</span>
            </div>
          )}

          {/* Multiple Faces Indicator */}
          {faceProctoringActive && faceAnalysis.latestResult?.multipleFacesDetected && (
            <div className="absolute top-6 right-1 flex items-center gap-1 rounded bg-red-900/80 px-1.5 py-0.5 border border-red-500/50">
              <AlertCircle className="h-2.5 w-2.5 text-white" />
              <span className="text-[9px] font-medium text-white">Multiple Faces</span>
            </div>
          )}
        </DraggablePip>
      )}

      {/* ── End interview confirmation dialog ─────────────── */}
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
              onClick={handleEndInterview}
            >
              End Interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Simli first-question prompt */}
      <AlertDialog
        open={showFirstUnmutePrompt}
        onOpenChange={(open) => {
          setShowFirstUnmutePrompt(open);
          if (!open) setFirstUnmutePromptAcknowledged(true);
        }}
      >
        <AlertDialogContent className="z-[10000]">
          <AlertDialogHeader>
            <AlertDialogTitle>Unmute to speak</AlertDialogTitle>
            <AlertDialogDescription>
              When the avatar finishes the question, click <span className="font-semibold">Unmute</span> to answer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setFirstUnmutePromptAcknowledged(true);
                setShowFirstUnmutePrompt(false);
              }}
            >
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Mobile transcript + chat sheet (replaces separate transcript button) ── */}
      {isMobile && chatEnabled && (
        <Sheet open={chatOpen} onOpenChange={setChatOpen}>
          <SheetContent
            side="bottom"
            className="flex h-[60vh] flex-col p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader className="shrink-0 border-b px-4 py-3">
              <SheetTitle className="text-sm">Chat</SheetTitle>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-4">
                {messages.length === 0 && !sessionAiText && !voice.userTranscript ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Transcript will appear here once the conversation starts.
                  </p>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div key={msg.id} className="flex items-start gap-1.5 text-sm">
                        {msg.role === "user" ? (
                          msg.source === "chat"
                            ? <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            : <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <div>
                          <span
                            className={`font-medium ${
                              msg.role === "user"
                                ? "text-secondary-600 dark:text-secondary-400"
                                : "text-primary"
                            }`}
                          >
                            {msg.role === "user" ? "You" : aiName}:
                          </span>{" "}
                          {formatTranscriptText(msg.content)}
                        </div>
                      </div>
                    ))}
                    {/* Live interim candidate STT hidden from take UI */}
                    {sessionAiText && (() => {
                      const alreadyInMessages = hasRecentAssistantTranscript(messages, sessionAiText);
                      if (alreadyInMessages) return null;
                      return (
                        <div className="flex items-start gap-1.5 text-sm">
                          <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                          <div>
                            <span className="font-medium text-primary">{aiName}:</span>{" "}
                            <span className="text-muted-foreground">{formatTranscriptText(sessionAiText)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
              <Input
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="h-8 flex-1 text-base md:text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) {
                    e.preventDefault();
                    handleSendChat(chatInput);
                    setChatInput("");
                  }
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                disabled={!chatInput.trim()}
                onClick={() => {
                  handleSendChat(chatInput);
                  setChatInput("");
                  chatInputRef.current?.focus();
                }}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
