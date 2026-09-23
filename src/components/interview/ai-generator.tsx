"use client";

import { QUESTION_TYPE_STYLES, QuestionCard } from "@/components/interview/question-card";
import { useOrg } from "@/components/org-provider";
import { useAuth } from "@/components/auth-provider";
import { AiButton } from "@/components/ui/ai-button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { AssessmentCriterion, GeneratedInterview, GeneratedQuestion } from "@/lib/ai/types";
import { normalizeCvCriteria, type CvCriterion } from "@/lib/cv-criteria";
import { AI_TONES, LANGUAGES } from "@/lib/constants";
import {
  formatDurationOption,
  INTERVIEW_DURATION_MINUTES,
} from "@/lib/interview-duration";
import { getPregenerateInitialCreditCost } from "@/lib/interview-credits";
import { trpc } from "@/lib/trpc/client";
import { SUPPORTED_LANGUAGES } from "@/components/code-editor/code-editor-canvas";
import { cn } from "@/lib/utils";

const INTERVIEWER_NAME = "Inluwa";

function withInterviewerName(data: GeneratedInterview): GeneratedInterview {
  return {
    ...data,
    recommendedSettings: {
      ...data.recommendedSettings,
      aiName: INTERVIEWER_NAME,
    },
  };
}
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    ArrowRight,
    BrainCircuit,
    Briefcase,
    Check,
    Code2,
    Copy,
    FileText,
    Globe,
    ListOrdered,
    Loader2,
    MessageSquareText,
    Mic,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Sparkles,
    Target,
    Trash2,
    Upload,
    Users,
    Video,
    PenLine,
    Clock,
    X,
    ChevronDown,
    UserCheck,
    Languages,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AVATAR_PRESETS,
  AVATAR_VOICES,
  DEFAULT_AVATAR_VOICE,
  absoluteAvatarImageUrl,
  findMatchingAvatarPreset,
  getAvatarVoiceAudioPath,
  type AvatarVoice,
} from "@/lib/avatar-voices";
import { AvatarPresetTile } from "@/components/interview/avatar-preset-tile";

type PromptSegment = string | { text: string; highlight: true };

interface PromptTemplate {
  label: string;
  icon: React.ElementType;
  segments: PromptSegment[];
}

interface HLRange {
  start: number;
  end: number;
}

function templateToText(segments: PromptSegment[]): string {
  return segments.map((s) => (typeof s === "string" ? s : s.text)).join("");
}

function rangesFromSegments(segments: PromptSegment[]): HLRange[] {
  const ranges: HLRange[] = [];
  let pos = 0;
  for (const seg of segments) {
    const text = typeof seg === "string" ? seg : seg.text;
    if (typeof seg !== "string") ranges.push({ start: pos, end: pos + text.length });
    pos += text.length;
  }
  return ranges;
}

function adjustRanges(ranges: HLRange[], oldText: string, newText: string): HLRange[] {
  if (!ranges.length) return ranges;
  let s = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (s < minLen && oldText[s] === newText[s]) s++;
  let oe = oldText.length;
  let ne = newText.length;
  while (oe > s && ne > s && oldText[oe - 1] === newText[ne - 1]) {
    oe--;
    ne--;
  }
  const delta = (ne - s) - (oe - s);
  return ranges
    .map(({ start: rs, end: re }) => {
      if (re <= s) return { start: rs, end: re };
      if (rs >= oe) return { start: rs + delta, end: re + delta };
      if (rs <= s && re >= oe) return { start: rs, end: re + delta };
      if (rs >= s && re <= oe) return { start: s, end: ne };
      if (rs >= s && rs < oe) return { start: ne, end: re + delta };
      if (re > s && re <= oe) return { start: rs, end: s };
      return { start: rs, end: re };
    })
    .filter((r) => r.start < r.end);
}

function segmentsFromRanges(text: string, ranges: HLRange[]): PromptSegment[] {
  if (!ranges.length || !text) return text ? [text] : [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const result: PromptSegment[] = [];
  let pos = 0;
  for (const { start, end } of sorted) {
    if (start > pos) result.push(text.slice(pos, start));
    if (end > start) result.push({ text: text.slice(start, end), highlight: true });
    pos = end;
  }
  if (pos < text.length) result.push(text.slice(pos));
  return result;
}

const h = (text: string): { text: string; highlight: true } => ({
  text,
  highlight: true,
});

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    label: "Tech Hiring",
    icon: Code2,
    segments: [
      "Assess ",
      h("Senior Software Engineer"),
      " candidates with ",
      h("8"),
      " questions covering ",
      h("open-ended and coding"),
      " types, focusing on ",
      h("practical problem-solving and technical depth"),
      ".",
    ],
  },
  {
    label: "Behavioral",
    icon: Users,
    segments: [
      "Conduct a ",
      h("behavioral interview"),
      " with ",
      h("6"),
      " questions in ",
      h("open-ended"),
      " format to evaluate ",
      h("leadership, teamwork, and conflict resolution"),
      ".",
    ],
  },
  {
    label: "User Research",
    icon: Search,
    segments: [
      "Conduct ",
      h("user research interviews"),
      " with ",
      h("6"),
      " ",
      h("open-ended"),
      " questions to understand ",
      h("product usage patterns, pain points, and unmet user needs"),
      ".",
    ],
  },
  {
    label: "Screening Call",
    icon: Briefcase,
    segments: [
      "Design a ",
      h("screening call"),
      " with ",
      h("5"),
      " questions mixing ",
      h("open-ended and coding"),
      " to quickly evaluate ",
      h("technical fundamentals and communication skills"),
      ".",
    ],
  },
  {
    label: "Case Study",
    icon: BrainCircuit,
    segments: [
      "Design a ",
      h("case study interview"),
      " with ",
      h("4"),
      " questions including ",
      h("coding and open-ended"),
      " problem analysis.",
    ],
  },
  {
    label: "Expert Interview",
    icon: MessageSquareText,
    segments: [
      "Conduct an ",
      h("expert interview"),
      " with ",
      h("5"),
      " ",
      h("open-ended"),
      " questions to explore ",
      h("domain expertise, industry trends, and strategic recommendations"),
      " for the ",
      h("AI industry"),
      ".",
    ],
  },
];

export function AIGenerator({ 
  projectId, 
  defaultLanguage,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  mode,
  format,
  avatarMode = "none",
  isVoiceOnly,
  initialTemplate,
  wizardOffset = 3,
  onBack,
}: { 
  projectId?: string;
  defaultLanguage?: string;
  defaultFormat?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  mode: "ai" | "manual" | "template" | "coding";
  format: "video" | "voice" | "noninteractive";
  avatarMode?: "none" | "static" | "simli" | "vidu";
  isVoiceOnly?: boolean;
  /** When set (template already picked in outer wizard), skip template selection. */
  initialTemplate?: {
    id: string;
    title: string;
    jobType: string;
    jobDescription: string;
    scoringRubric?: unknown;
  };
  /** How many outer wizard steps come before this component (for progress %). */
  wizardOffset?: number;
  onBack: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { data: creditRates } = trpc.creditRates.list.useQuery();
  
  const [title, setTitle] = useState(initialTemplate?.title ?? "");
  const [objective, setObjective] = useState(
    initialTemplate ? `Assess candidates for the ${initialTemplate.title} role.` : "",
  );
  const [description, setDescription] = useState(initialTemplate?.jobDescription ?? "");
  const [introText, setIntroText] = useState(
    "Welcome to your non-interactive interview. Please note that for each question, you should click Unmute, answer your question clearly, and click Submit when you are finished to proceed to the next question. If there are coding questions, please keep the total number of questions and total time in mind as you work. Good luck!"
  );
  const [outroText, setOutroText] = useState(
    "You have reached the end of the interview. Thank you for your responses. If the interview session does not complete automatically in a moment, you can click the red end button in the top right to complete your session."
  );
  
  // Job templates queries and states
  const { data: dbTemplates, refetch: refetchDbTemplates } = trpc.jobTemplate.list.useQuery(
    undefined,
    { enabled: mode === "template" && !initialTemplate }
  );
  const createTemplateMutation = trpc.jobTemplate.create.useMutation();
  const [selectedJobType, setSelectedJobType] = useState<string>(initialTemplate?.jobType ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplate?.id ?? "");
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [openAccordion, setOpenAccordion] = useState<"jd" | "rubric" | "questions" | "intro" | "outro" | null>(null);
  
  // Template creation modal (for system admins)
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [newTemplateType, setNewTemplateType] = useState("");
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateJd, setNewTemplateJd] = useState("");
  
  const [newTemplateRubricList, setNewTemplateRubricList] = useState<{ name: string; description: string }[]>([]);
  const [newTemplateQuestionsList, setNewTemplateQuestionsList] = useState<{ order: number; text: string; type: "OPEN_ENDED"; isRequired: boolean }[]>([]);
  const [newCriterionName, setNewCriterionName] = useState("");
  const [newCriterionDesc, setNewCriterionDesc] = useState("");
  const [newQuestionText, setNewQuestionText] = useState("");
  
  const { data: isSystemAdmin = false } = trpc.user.isSystemAdmin.useQuery(undefined, {
    enabled: !!user,
  });

  // Filter templates dynamically by query string
  const filteredTemplates = useMemo(() => {
    if (!dbTemplates) return [];
    if (!templateSearchQuery.trim()) return dbTemplates;
    const query = templateSearchQuery.toLowerCase();
    return dbTemplates.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.jobType.toLowerCase().includes(query) ||
        t.jobDescription.toLowerCase().includes(query)
    );
  }, [dbTemplates, templateSearchQuery]);
  const [activeTemplate, setActiveTemplate] = useState<number | null>(null);
  const [hlRanges, setHlRanges] = useState<HLRange[]>([]);
  const prevDescRef = useRef("");
  const [duration, setDuration] = useState("20");
  const [numQuestions, setNumQuestions] = useState("");
  // Default interactive tools to off
  const [whiteboardEnabled, setWhiteboardEnabled] = useState(false);
  const [codeEnabled, setCodeEnabled] = useState(false);
  const [codingEnabledCheck, setCodingEnabledCheck] = useState(mode === "coding");
  const [numCodingQuestions, setNumCodingQuestions] = useState("1");
  const [codingLanguage, setCodingLanguage] = useState("python");
  const [behavioralEnabledCheck, setBehavioralEnabledCheck] = useState(mode === "coding");
  const [numBehavioralQuestions, setNumBehavioralQuestions] = useState("1");
  const getCapacity = useCallback(() => {
    const min = Number(duration) || 15;
    return Math.max(1, Math.floor(min * 0.4));
  }, [duration]);

  // When Coding is toggled on:
  const handleCodingToggle = useCallback((checked: boolean) => {
    setCodingEnabledCheck(checked);
    if (checked) {
      const capacity = getCapacity();
      const currentNb = behavioralEnabledCheck ? Number(numBehavioralQuestions) : 0;
      let nc = 1;
      if (nc + currentNb > capacity) {
        const nextNb = Math.max(0, capacity - nc);
        if (nextNb > 0) {
          setNumBehavioralQuestions(String(nextNb));
        } else {
          setBehavioralEnabledCheck(false);
        }
      }
      setNumCodingQuestions(String(nc));
    }
  }, [behavioralEnabledCheck, numBehavioralQuestions, getCapacity]);

  // When Behavioral is toggled on:
  const handleBehavioralToggle = useCallback((checked: boolean) => {
    setBehavioralEnabledCheck(checked);
    if (checked) {
      const capacity = getCapacity();
      const currentNc = codingEnabledCheck ? Number(numCodingQuestions) : 0;
      let nb = 1;
      if (currentNc + nb > capacity) {
        const nextNc = Math.max(0, capacity - nb);
        if (nextNc > 0) {
          setNumCodingQuestions(String(nextNc));
        } else {
          setCodingEnabledCheck(false);
        }
      }
      setNumBehavioralQuestions(String(nb));
    }
  }, [codingEnabledCheck, numCodingQuestions, getCapacity]);

  const handleCodingQuestionsChange = useCallback((value: string) => {
    const nc = Number(value);
    setNumCodingQuestions(value);
    if (behavioralEnabledCheck) {
      const capacity = getCapacity();
      const currentNb = Number(numBehavioralQuestions);
      if (nc + currentNb > capacity) {
        const nextNb = Math.max(0, capacity - nc);
        if (nextNb > 0) {
          setNumBehavioralQuestions(String(nextNb));
        } else {
          setBehavioralEnabledCheck(false);
        }
      }
    }
  }, [behavioralEnabledCheck, numBehavioralQuestions, getCapacity]);

  const handleBehavioralQuestionsChange = useCallback((value: string) => {
    const nb = Number(value);
    setNumBehavioralQuestions(value);
    if (codingEnabledCheck) {
      const capacity = getCapacity();
      const currentNc = Number(numCodingQuestions);
      if (currentNc + nb > capacity) {
        const nextNc = Math.max(0, capacity - nb);
        if (nextNc > 0) {
          setNumCodingQuestions(String(nextNc));
        } else {
          setCodingEnabledCheck(false);
        }
      }
    }
  }, [codingEnabledCheck, numCodingQuestions, getCapacity]);

  // Sync / validate on duration change
  useEffect(() => {
    const capacity = getCapacity();
    let nc = codingEnabledCheck ? Number(numCodingQuestions) : 0;
    let nb = behavioralEnabledCheck ? Number(numBehavioralQuestions) : 0;

    if (nc + nb > capacity) {
      if (codingEnabledCheck && behavioralEnabledCheck) {
        // Exceeds capacity: shrink behavioral first
        const nextNb = Math.max(0, capacity - nc);
        if (nextNb > 0) {
          setNumBehavioralQuestions(String(nextNb));
        } else {
          setBehavioralEnabledCheck(false);
          // If still exceeds, shrink coding
          if (nc > capacity) {
            setNumCodingQuestions(String(capacity));
          }
        }
      } else if (codingEnabledCheck && nc > capacity) {
        setNumCodingQuestions(String(capacity));
      } else if (behavioralEnabledCheck && nb > capacity) {
        setNumBehavioralQuestions(String(capacity));
      }
    }
  }, [duration, codingEnabledCheck, behavioralEnabledCheck, numCodingQuestions, numBehavioralQuestions, getCapacity]);

  const [aiTone, setAiTone] = useState<"CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY">("FRIENDLY");
  const [followUpDepth] = useState<"LIGHT" | "MODERATE" | "DEEP">("LIGHT");
  const [language, setLanguage] = useState(defaultLanguage ?? "en");
  const [antiCheatingEnabled, setAntiCheatingEnabled] = useState(false);
  const [multilingualEnabled, setMultilingualEnabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [streamPhase, setStreamPhase] = useState<"idle" | "thinking" | "writing">("idle");
  const [thinkingText, setThinkingText] = useState("");
  const [contentText, setContentText] = useState("");
  const thinkingRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<GeneratedInterview | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable state (separate from result so edits don't mutate original)
  const [editableJobDescription, setEditableJobDescription] = useState<string>(
    initialTemplate?.jobDescription ?? "",
  );
  const [editableCriteria, setEditableCriteria] = useState<AssessmentCriterion[]>(() => {
    if (initialTemplate?.scoringRubric && Array.isArray(initialTemplate.scoringRubric)) {
      return initialTemplate.scoringRubric as AssessmentCriterion[];
    }
    return [];
  });
  const [editableCvAssessmentCriteria, setEditableCvAssessmentCriteria] = useState<CvCriterion[]>([]);
  const [editableCvJdAlignmentCriteria, setEditableCvJdAlignmentCriteria] = useState<CvCriterion[]>([]);
  const [editableQuestions, setEditableQuestions] = useState<GeneratedQuestion[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingCriterionIndex, setEditingCriterionIndex] = useState<number | null>(null);
  const criterionSnapshotRef = useRef<AssessmentCriterion | null>(null);

  // Context documents (JD / Resume)
  const [jdText, setJdText] = useState("");
  const [jdSource, setJdSource] = useState("");
  const [jdLoading, setJdLoading] = useState(false);
  const [jdError, setJdError] = useState("");
  const [jdUrlInput, setJdUrlInput] = useState("");
  const [jdPopoverOpen, setJdPopoverOpen] = useState(false);
  const jdFileRef = useRef<HTMLInputElement>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeSource, setResumeSource] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const resumeFileRef = useRef<HTMLInputElement>(null);

  // AI feedback refinement
  const [feedback, setFeedback] = useState("");
  const [refining, setRefining] = useState(false);

  // Non-interactive avatar (Pruna) settings
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null);
  const [avatarVoice, setAvatarVoice] = useState<AvatarVoice>(DEFAULT_AVATAR_VOICE);
  const [selectedAvatarPresetId, setSelectedAvatarPresetId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null);

  // Wizard step indices — swapped order:
  // Step 1: Configure (Duration, Tone)
  // Step 2: Features & Security (Whiteboard, Code, Anti-cheat)
  // Step 3: Describe / Select Template / Manual details
  const showAvatarStep = !!isVoiceOnly;
  // Real Time Avatar + Voice Only; hidden for non-interactive (pregenerated clips).
  const showMultilingualToggle = format !== "noninteractive";
  const STEP_CONFIGURE = 1;
  const STEP_INPUT = 2;
  const STEP_AVATAR = 3;
  const STEP_GENERATE = showAvatarStep ? 4 : 3;
  const STEP_REVIEW = showAvatarStep ? 5 : 4;
  const innerStepCount = showAvatarStep ? 5 : 4;

  // Auto-scroll streaming panels to bottom and keep card in viewport
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [thinkingText]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [contentText]);

  const createMutation = trpc.interview.create.useMutation();
  const createQuestionMutation = trpc.question.create.useMutation();

  /** Consume an SSE stream from generate/refine and return parsed data. */
  const consumeStream = async (response: Response): Promise<GeneratedInterview> => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: GeneratedInterview | null = null;
    let eventCount = 0;

    console.log("[consumeStream] Starting stream read");

    const processBuffer = () => {
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw);
        } catch (e) {
          console.error("[consumeStream] JSON.parse failed on line:", raw.slice(0, 200), e);
          continue;
        }
        eventCount++;
        console.log(`[consumeStream] event #${eventCount} type=${payload.type}`);
        if (payload.type === "thinking") {
          setStreamPhase("thinking");
          if (payload.text) setThinkingText((prev) => prev + (payload.text as string));
        } else if (payload.type === "content") {
          setStreamPhase("writing");
          if (payload.text) setContentText((prev) => prev + (payload.text as string));
        } else if (payload.type === "done") {
          console.log("[consumeStream] 'done' event received, data keys:", Object.keys(payload.data as object));
          result = payload.data as GeneratedInterview;
        } else if (payload.type === "error") {
          console.error("[consumeStream] error event:", payload.message);
          throw new Error(payload.message as string);
        } else {
          console.warn("[consumeStream] unknown event type:", payload.type);
        }
      }
    };

    let chunkCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log(`[consumeStream] Reader done after ${chunkCount} chunks. buffer remaining: ${JSON.stringify(buffer.slice(0, 100))}`);
        // Flush any remaining bytes from the TextDecoder
        const flushed = decoder.decode();
        if (flushed) {
          console.log("[consumeStream] Flushed decoder bytes:", flushed.slice(0, 100));
          buffer += flushed;
        }
        // Process any leftover lines still sitting in buffer (no trailing newline case)
        if (buffer.trim()) {
          console.log("[consumeStream] Processing leftover buffer:", buffer.slice(0, 200));
          buffer += "\n";
          processBuffer();
        }
        break;
      }
      chunkCount++;
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
    }

    console.log(`[consumeStream] Finished. result=${result ? 'RECEIVED' : 'NULL'}, events=${eventCount}`);
    if (!result) throw new Error("No result received from generation stream");
    return withInterviewerName(result);
  };

  const extractText = useCallback(async (source: { file?: File; url?: string }) => {
    const formData = new FormData();
    if (source.file) formData.append("file", source.file);
    if (source.url) formData.append("url", source.url);
    const res = await fetch("/api/ai/extract-text", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Extraction failed");
    return data.text as string;
  }, []);

  const handleJdFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJdLoading(true);
    setJdError("");
    setJdPopoverOpen(false);
    try {
      const text = await extractText({ file });
      setJdText(text);
      setJdSource(file.name);
    } catch (err) {
      setJdError(err instanceof Error ? err.message : "Failed to extract text");
    } finally {
      setJdLoading(false);
      if (jdFileRef.current) jdFileRef.current.value = "";
    }
  }, [extractText]);

  const handleJdUrl = useCallback(async (pastedUrl?: string) => {
    const url = (pastedUrl ?? jdUrlInput).trim();
    if (!url) return;
    setJdLoading(true);
    setJdError("");
    setJdPopoverOpen(false);
    setJdUrlInput("");
    try {
      const text = await extractText({ url });
      setJdText(text);
      setJdSource(url);
    } catch (err) {
      setJdError(err instanceof Error ? err.message : "Failed to extract text");
    } finally {
      setJdLoading(false);
    }
  }, [jdUrlInput, extractText]);

  const handleResumeFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeLoading(true);
    setResumeError("");
    try {
      const text = await extractText({ file });
      setResumeText(text);
      setResumeSource(file.name);
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Failed to extract text");
    } finally {
      setResumeLoading(false);
      if (resumeFileRef.current) resumeFileRef.current.value = "";
    }
  }, [extractText]);

  const handleGenerate = async () => {
    if (!description.trim()) return;

    setGenerating(true);
    setStreamPhase("idle");
    setThinkingText("");
    setContentText("");
    setResult(null);
    if (mode !== "template") {
      setEditableJobDescription("");
      setEditableCriteria([]);
    }
    setEditableQuestions([]);
    setEditingIndex(null);
    setEditingCriterionIndex(null);
    setFeedback("");

    try {
      console.log("[handleGenerate] Sending fetch to /api/ai/generate");
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          durationMinutes: Number(duration) || 20,
          language: LANGUAGES.find((l) => l.value === language)?.label ?? language,
          organizationId: currentOrg?.id,
          projectId,
          isVoiceOnly: isVoiceOnly || false,
          ...(jdText && { jobDescription: jdText }),
          ...(resumeText && { resumeText }),
          ...(mode === "template" && editableCriteria.length > 0 && { existingCriteria: editableCriteria }),
          ...(mode === "coding" && {
            codingQuestions: codingEnabledCheck ? Number(numCodingQuestions) : 0,
            behavioralQuestions: behavioralEnabledCheck ? Number(numBehavioralQuestions) : 0,
            codingLanguage,
          }),
          ...(mode !== "coding" && numQuestions && { numQuestions: Number(numQuestions) }),
        }),
      });

      console.log("[handleGenerate] Response status:", response.status);
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || "Generation failed");
      }

      console.log("[handleGenerate] Calling consumeStream");
      const data = await consumeStream(response);
      console.log("[handleGenerate] consumeStream returned. questions:", data?.questions?.length, "criteria:", data?.assessmentCriteria?.length);
      
      // *** Advance to review step FIRST, before any further processing ***
      setResult(data);
      setCurrentStep(STEP_REVIEW);
      console.log(`[handleGenerate] setCurrentStep(${STEP_REVIEW}) called`);

      // Now populate editable fields (non-blocking)
      if (mode !== "template" || !editableJobDescription) {
        setEditableJobDescription(data.jobDescription || jdText || description);
      }
      if (mode !== "template" || editableCriteria.length === 0) {
        setEditableCriteria(data.assessmentCriteria ?? []);
      }
      if (Array.isArray(data.cvAssessmentCriteria)) {
        setEditableCvAssessmentCriteria(normalizeCvCriteria(data.cvAssessmentCriteria));
      }
      if (Array.isArray(data.cvJdAlignmentCriteria)) {
        setEditableCvJdAlignmentCriteria(normalizeCvCriteria(data.cvJdAlignmentCriteria));
      }
      
      try {
        const questions = data.questions.map((q, i) => ({
          ...q,
          order: i + 1,
          starterCode: q.starterCode
            ? { ...q.starterCode, language: q.starterCode.language.toLowerCase() }
            : undefined,
        }));
        setEditableQuestions(questions);
        console.log("[handleGenerate] Questions mapped:", questions.length);
        // Auto-enable whiteboard based on generated content. Code Editor is
        // intentionally NOT auto-enabled here — the user is asked to confirm
        // via a dialog at Accept & Create time (see handleAccept).
        if (questions.some(q => q.type === 'WHITEBOARD')) setWhiteboardEnabled(true);
      } catch (mapErr) {
        console.error("[handleGenerate] Error mapping questions (non-fatal):", mapErr);
        // Still set raw questions so user can see them
        setEditableQuestions(Array.isArray(data.questions) ? data.questions as typeof editableQuestions : []);
      }
    } catch (err) {
      console.error("[handleGenerate] CAUGHT ERROR:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
      console.log("[handleGenerate] finally: generating=false");
      setStreamPhase("idle");
    }
  };

  const handleRefine = async () => {
    if (!result || !feedback.trim()) return;

    setRefining(true);
    setStreamPhase("idle");
    setThinkingText("");
    setContentText("");
    try {
      const response = await fetch("/api/ai/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview: {
            title: (mode === "ai" || mode === "coding") ? result?.title : title,
            description: result.description,
            objective: (mode === "ai" || mode === "coding") ? result?.objective : objective,
            jobDescription: editableJobDescription,
            assessmentCriteria: editableCriteria,
            questions: editableQuestions.map((q) => ({ text: q.text, type: q.type })),
          },
          feedback,
          language: LANGUAGES.find((l) => l.value === language)?.label ?? language,
          organizationId: currentOrg?.id,
          projectId,
          isVoiceOnly: isVoiceOnly || false,
          ...(jdText && { jobDescription: jdText }),
          ...(resumeText && { resumeText }),
          codingLanguage,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || "Refinement failed");
      }

      const data = await consumeStream(response);
      setResult(data);
      setEditableJobDescription(data.jobDescription || editableJobDescription || jdText || description);
      setEditableCriteria(data.assessmentCriteria ?? []);
      if (Array.isArray(data.cvAssessmentCriteria)) {
        setEditableCvAssessmentCriteria(normalizeCvCriteria(data.cvAssessmentCriteria));
      }
      if (Array.isArray(data.cvJdAlignmentCriteria)) {
        setEditableCvJdAlignmentCriteria(normalizeCvCriteria(data.cvJdAlignmentCriteria));
      }
      const questions = data.questions.map((q, i) => ({
        ...q,
        order: i + 1,
        starterCode: q.starterCode
          ? { ...q.starterCode, language: q.starterCode.language.toLowerCase() }
          : undefined,
      }));
      setEditableQuestions(questions);
      
      // Auto-enable whiteboard based on refined content. Code Editor is
      // intentionally NOT auto-enabled here — the user is asked to confirm
      // via a dialog at Accept & Create time (see handleAccept).
      if (questions.some(q => q.type === 'WHITEBOARD')) setWhiteboardEnabled(true);
      
      setFeedback("");
      setEditingIndex(null);
      setEditingCriterionIndex(null);
      toast({ title: "Interview refined based on your feedback!" });
    } catch {
      toast({ title: "Refinement failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setRefining(false);
      setStreamPhase("idle");
    }
  };


  const playVoicePreview = (voice: AvatarVoice) => {
    const path = getAvatarVoiceAudioPath(voice);
    if (!path) return;
    if (!voicePreviewRef.current) {
      voicePreviewRef.current = new Audio();
    }
    const audio = voicePreviewRef.current;
    audio.pause();
    audio.src = path;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* ignore autoplay / missing file */
    });
  };

  const handleSelectAvatarPreset = (presetId: string) => {
    const preset = AVATAR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    voicePreviewRef.current?.pause();
    setSelectedAvatarPresetId(preset.id);
    setAvatarImageUrl(absoluteAvatarImageUrl(preset.imagePath));
    setAvatarVoice(preset.voice);
  };

  const handleAvatarVoiceChange = (voice: AvatarVoice) => {
    setAvatarVoice(voice);
    setSelectedAvatarPresetId((prev) => {
      const matched = AVATAR_PRESETS.find((p) => p.voice === voice);
      if (prev && matched && prev === matched.id) return prev;
      return null;
    });
    playVoicePreview(voice);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Avatar image must be less than 5MB");
      }
      if (!file.type.startsWith("image/")) {
        throw new Error("Please upload an image file");
      }
      const supabase = createClient();
      const fileExt = file.name.split(".").pop() || "png";
      const filePath = `avatars/interview_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("public-assets")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("public-assets").getPublicUrl(filePath);
      setSelectedAvatarPresetId(null);
      setAvatarImageUrl(publicUrl);
      toast({ title: "Avatar image uploaded" });
    } catch (err: unknown) {
      toast({
        title: "Failed to upload avatar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };

  const [showCodeEditorConfirm, setShowCodeEditorConfirm] = useState(false);

  const handleAccept = async () => {
    if (mode === "manual" && !title.trim()) {
       toast({ title: "Please provide a title" });
       return;
    }
    if ((mode === "ai" || mode === "template" || mode === "coding") && (!result || editableQuestions.length === 0)) return;

    const hasCodingQuestionCheck = editableQuestions.some((q) => q.type === "CODING");
    if (hasCodingQuestionCheck && !codeEnabled) {
      setShowCodeEditorConfirm(true);
      return;
    }

    await proceedWithAccept();
  };

  const proceedWithAccept = async () => {
    setSaving(true);
    try {
      const hasCodingQuestion = editableQuestions.some((q) => q.type === "CODING");
      const hasWhiteboardQuestion = editableQuestions.some((q) => q.type === "WHITEBOARD");
      
      const interview = await createMutation.mutateAsync({
        projectId,
        title: (mode === "ai" || mode === "template" || mode === "coding") ? result!.title : title.trim(),
        description: (mode === "ai" || mode === "template" || mode === "coding") ? result!.description : undefined,
        objective: (mode === "ai" || mode === "template" || mode === "coding") ? result!.objective : objective.trim(),
        assessmentCriteria: editableCriteria.length > 0 ? editableCriteria : undefined,
        cvAssessmentCriteria:
          editableCvAssessmentCriteria.length > 0
            ? normalizeCvCriteria(editableCvAssessmentCriteria)
            : undefined,
        cvJdAlignmentCriteria:
          editableCvJdAlignmentCriteria.length > 0
            ? normalizeCvCriteria(editableCvJdAlignmentCriteria)
            : undefined,
        jobDescription: editableJobDescription || undefined,
        chatEnabled: format === "video" || format === "voice" || format === "noninteractive",
        voiceEnabled: format === "video" || format === "voice" || format === "noninteractive",
        videoEnabled: format === "video" || format === "noninteractive",
        avatarMode,
        whiteboardEnabled: whiteboardEnabled || hasWhiteboardQuestion,
        codeEnabled: codeEnabled || hasCodingQuestion,
        language,
        aiTone,
        aiName: INTERVIEWER_NAME,
        followUpDepth,
        antiCheatingEnabled,
        multilingualEnabled: showMultilingualToggle ? multilingualEnabled : false,
        timeLimitMinutes: Number(duration) || undefined,
        isVoiceOnly: isVoiceOnly || false,
        avatarImageUrl: isVoiceOnly ? avatarImageUrl : undefined,
        avatarVoice: isVoiceOnly ? avatarVoice : undefined,
      });

      if (editableQuestions.length > 0) {
        const createdQuestions = await Promise.all(
          editableQuestions.map((q, i) =>
            createQuestionMutation.mutateAsync({
              interviewId: interview.id,
              order: i + 1,
              text: q.text,
              type: q.type as "OPEN_ENDED" | "CODING",
              description: q.description ?? undefined,
              timeLimitSeconds: q.timeLimitSeconds ?? undefined,
              isRequired: q.isRequired ?? true,
              options: q.options ?? undefined,
              followUpPrompts: q.followUpPrompts ?? undefined,
              starterCode: q.type === "CODING" && q.starterCode ? q.starterCode : undefined,
            })
          )
        );

        if (isVoiceOnly) {
          const creditCost = getPregenerateInitialCreditCost(Number(duration) || null, creditRates);
          try {
            const res = await fetch("/api/ai/pregenerate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                interviewId: interview.id,
                // Server resolves avatarImageUrl / default woman-v1 when omitted
                questions: createdQuestions.map((q, i) => ({
                  id: q.id,
                  text: q.text,
                  order: q.order ?? i + 1,
                })),
                target: "all",
                introText: format === "noninteractive" ? introText : undefined,
                outroText: format === "noninteractive" ? outroText : undefined,
              }),
            });
            const body = await res.json().catch(() => ({} as { error?: string }));
            if (!res.ok) {
              toast({
                title: "Interview created, but avatar videos were not generated",
                description:
                  (typeof body.error === "string" && body.error) ||
                  `Pregeneration failed (HTTP ${res.status}).`,
                variant: "destructive",
              });
            } else {
              toast({
                title: `Interview created! Generating avatar videos (${creditCost} credits)…`,
              });
            }
          } catch (err) {
            console.error("Failed to start avatar pregeneration:", err);
            toast({
              title: "Interview created, but avatar videos were not generated",
              description: err instanceof Error ? err.message : String(err),
              variant: "destructive",
            });
          }
        }
      } else if (isVoiceOnly) {
        // No questions yet — skip pregeneration
        toast({ title: "Interview created!" });
      }

      if (!isVoiceOnly) {
        toast({ title: "Interview created!" });
      }
      controlledOnOpenChange?.(false);
      router.push(`/interviews/${interview.id}/edit/content`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error saving interview", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };


  // Question editing helpers
  const updateQuestion = useCallback(
    (index: number, updates: Partial<GeneratedQuestion>) => {
      setEditableQuestions((prev) =>
        prev.map((q, i) => (i === index ? { ...q, ...updates } : q))
      );
    },
    []
  );

  const deleteQuestion = useCallback((index: number) => {
    setEditableQuestions((prev) =>
      prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i + 1 }))
    );
    setEditingIndex(null);
  }, []);

  const [importOpen, setImportOpen] = useState(false);

  const addQuestion = useCallback(() => {
    const newQ: GeneratedQuestion = {
      order: editableQuestions.length + 1,
      text: "",
      type: "OPEN_ENDED",
      description: "",
      isRequired: true,
      timeLimitSeconds: undefined,
      followUpPrompts: [],
    };
    setEditableQuestions((prev) => [...prev, newQ]);
    setEditingIndex(editableQuestions.length);
  }, [editableQuestions.length]);

  // Drag-and-drop state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      return;
    }
    setEditableQuestions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(dropIndex, 0, moved);
      return next.map((q, i) => ({ ...q, order: i + 1 }));
    });
    setEditingIndex((prev) => {
      if (prev === null) return null;
      if (prev === fromIndex) return dropIndex;
      // Shift editing index if it was between from and drop
      if (fromIndex < dropIndex && prev > fromIndex && prev <= dropIndex) return prev - 1;
      if (fromIndex > dropIndex && prev >= dropIndex && prev < fromIndex) return prev + 1;
      return prev;
    });
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  // Wizard state - may be controlled externally
  const [wizardOpen, setWizardOpen] = useState(controlledOpen ?? false);
  // Template already chosen in outer wizard → start at configure (step 2)
  const [currentStep, setCurrentStep] = useState(1);

  // Sync with external open prop
  useEffect(() => {
    if (controlledOpen !== undefined) {
      setWizardOpen(controlledOpen);
      if (controlledOpen) {
        // Reset & open when controlled externally
        setCurrentStep(1);
        setTitle(initialTemplate?.title ?? "");
        setObjective(
          initialTemplate ? `Assess candidates for the ${initialTemplate.title} role.` : "",
        );
        setDescription(initialTemplate?.jobDescription ?? "");
        setHlRanges([]);
        prevDescRef.current = "";
        setActiveTemplate(null);
        setDuration("20");
        setLanguage(defaultLanguage ?? "en");
        setAiTone("FRIENDLY");
        setWhiteboardEnabled(false);
        setCodeEnabled(false);
        setNumQuestions("");
        setCodingEnabledCheck(mode === "coding");
        setNumCodingQuestions("1");
        setBehavioralEnabledCheck(mode === "coding");
        setNumBehavioralQuestions("1");
        setAntiCheatingEnabled(false);
        setMultilingualEnabled(false);
        setAvatarImageUrl(null);
        setAvatarVoice(DEFAULT_AVATAR_VOICE);
        setJdText(""); setJdSource(""); setJdError(""); setJdUrlInput("");
        setResumeText(""); setResumeSource(""); setResumeError("");
        setResult(null);
        setEditableJobDescription(initialTemplate?.jobDescription ?? "");
        setEditableCriteria(
          initialTemplate?.scoringRubric && Array.isArray(initialTemplate.scoringRubric)
            ? (initialTemplate.scoringRubric as AssessmentCriterion[])
            : mode === "manual"
            ? [{ name: "Communication Skills", description: "Clear articulation, vocabulary and tone." }]
            : [],
        );
        setEditableQuestions(
          mode === "manual"
            ? [{ order: 1, text: "Click edit to type your manual question here...", type: "OPEN_ENDED", description: "", isRequired: true }]
            : [],
        );
        setEditingIndex(null);
        setEditingCriterionIndex(null);
        setFeedback("");
        setThinkingText("");
        setContentText("");
        setStreamPhase("idle");
        setSelectedJobType(initialTemplate?.jobType ?? "");
        setSelectedTemplateId(initialTemplate?.id ?? "");
        setNewTemplateType("");
        setNewTemplateTitle("");
        setNewTemplateJd("");
        setNewTemplateRubricList([]);
        setNewTemplateQuestionsList([]);
        setNewCriterionName("");
        setNewCriterionDesc("");
        setNewQuestionText("");
        setCreateTemplateOpen(false);
        setTemplateSearchQuery("");
        setOpenAccordion(null);
      }
    }
  }, [controlledOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset wizard state when closing
  const handleWizardClose = (open: boolean) => {
    if (!open && !generating && !saving) {
      setWizardOpen(false);
      controlledOnOpenChange?.(false);
      if (!result) setCurrentStep(1);
    } else if (open) {
      setWizardOpen(true);
      controlledOnOpenChange?.(true);
    }
  };

  const openWizard = () => {
    setCurrentStep(1);
    setDescription("");
    setHlRanges([]);
    prevDescRef.current = "";
    setActiveTemplate(null);
    setDuration("20");
    setLanguage(defaultLanguage ?? "en");
    setAiTone("FRIENDLY");
    setWhiteboardEnabled(false);
    setCodeEnabled(false);
    setNumQuestions("");
    setCodingEnabledCheck(mode === "coding");
    setNumCodingQuestions("1");
    setBehavioralEnabledCheck(mode === "coding");
    setNumBehavioralQuestions("1");
    setAntiCheatingEnabled(false);
    setAvatarImageUrl(null);
    setAvatarVoice(DEFAULT_AVATAR_VOICE);
    setJdText(""); setJdSource(""); setJdError(""); setJdUrlInput("");
    setResumeText(""); setResumeSource(""); setResumeError("");
    setResult(null);
    setEditableJobDescription("");
    setEditableCriteria([]);
    setEditableQuestions([]);
    setEditingIndex(null);
    setEditingCriterionIndex(null);
    setFeedback("");
    setThinkingText("");
    setContentText("");
    setStreamPhase("idle");
    setSelectedJobType("");
    setSelectedTemplateId("");
    setNewTemplateType("");
    setNewTemplateTitle("");
    setNewTemplateJd("");
    setNewTemplateRubricList([]);
    setNewTemplateQuestionsList([]);
    setNewCriterionName("");
    setNewCriterionDesc("");
    setNewQuestionText("");
    setCreateTemplateOpen(false);
    setTemplateSearchQuery("");
    setOpenAccordion(null);
    setWizardOpen(true);
  };

  // Step definitions
  const STEPS = [
    { id: 1, label: "Describe" },
    { id: 2, label: "Configure" },
    { id: 3, label: "Features" },
    ...(showAvatarStep ? [{ id: STEP_AVATAR, label: "Avatar" }] : []),
    { id: STEP_GENERATE, label: "Generate" },
    { id: STEP_REVIEW, label: "Review" },
  ];

  // Prompt area renderer
  const renderPromptArea = () => {
    const segments = hlRanges.length ? segmentsFromRanges(description, hlRanges) : null;
    const hasHL = segments?.some((s) => typeof s !== "string") ?? false;
    return (
      <>
        <div className="rounded-md border border-zinc-400 dark:border-zinc-600 bg-background focus-within:border-zinc-600 dark:focus-within:border-zinc-400 transition-colors">
          <input ref={jdFileRef} type="file" accept=".pdf" className="hidden" onChange={handleJdFile} />
          <input ref={resumeFileRef} type="file" accept=".pdf" className="hidden" onChange={handleResumeFile} />

          {(jdText || resumeText || jdLoading || resumeLoading || jdError || resumeError) && (
            <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5 pb-1">
              {jdLoading && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Extracting JD...
                </span>
              )}
              {jdText && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
                  {jdSource.startsWith("http") ? <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="max-w-[180px] truncate">{jdSource}</span>
                  <button type="button" className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setJdText(""); setJdSource(""); setJdUrlInput(""); setJdError(""); }}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {jdError && <span className="text-xs text-destructive">{jdError}</span>}
              {resumeLoading && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Extracting resume...
                </span>
              )}
              {resumeText && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="max-w-[180px] truncate">{resumeSource}</span>
                  <button type="button" className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setResumeText(""); setResumeSource(""); setResumeError(""); }}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {resumeError && <span className="text-xs text-destructive">{resumeError}</span>}
            </div>
          )}

          <div className="relative">
            <Textarea
              id="ai-description"
              placeholder="e.g. I want to assess senior React developers for our fintech startup, focusing on system design and problem-solving skills..."
              value={description}
              onChange={(e) => {
                const next = e.target.value;
                setHlRanges((prev) => adjustRanges(prev, prevDescRef.current, next));
                prevDescRef.current = next;
                setDescription(next);
                setActiveTemplate(null);
              }}
              rows={5}
              className={cn(
                "border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none min-h-[180px] text-lg bg-transparent",
                hasHL && "text-transparent caret-foreground selection:bg-primary/20",
              )}
            />
            {hasHL && segments && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border border-transparent px-3 py-2 text-sm leading-normal"
              >
                {segments.map((seg, j) =>
                  typeof seg === "string" ? (
                    <span key={j}>{seg}</span>
                  ) : (
                    <mark
                      key={j}
                      style={{ backgroundColor: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))", borderRadius: "3px", boxShadow: "-3px 0 0 hsl(var(--primary) / 0.12), 3px 0 0 hsl(var(--primary) / 0.12)", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}
                    >
                      {seg.text}
                    </mark>
                  ),
                )}
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center justify-end gap-1.5 px-3 pb-2">
            <Popover open={jdPopoverOpen} onOpenChange={(open) => { setJdPopoverOpen(open); if (!open) setJdUrlInput(""); }}>
              <PopoverTrigger asChild>
                <button type="button" className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  jdText ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}>
                  {jdLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Briefcase className="h-3.5 w-3.5" />}
                  JD
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                {jdText ? (
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-muted transition-colors"
                    onClick={() => { setJdText(""); setJdSource(""); setJdUrlInput(""); setJdError(""); setJdPopoverOpen(false); }}>
                    <X className="h-4 w-4" />
                    Remove JD
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block px-1 text-xs font-medium text-muted-foreground">Paste JD link</label>
                    <div className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1.5">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="https://..."
                        value={jdUrlInput}
                        onChange={(e) => setJdUrlInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleJdUrl(); } }}
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                        autoFocus
                      />
                      {jdUrlInput.trim() && (
                        <button type="button" className="shrink-0 rounded p-0.5 text-primary hover:text-primary/80 transition-colors" onClick={() => handleJdUrl()}>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                      <div className="relative flex justify-center"><span className="bg-popover px-2 text-xs text-muted-foreground">or</span></div>
                    </div>
                    <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      onClick={() => { jdFileRef.current?.click(); setJdPopoverOpen(false); }}>
                      <FileText className="h-4 w-4" />
                      Upload PDF
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  resumeText ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}>
                  {resumeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  Resume
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {resumeText ? (
                  <DropdownMenuItem onClick={() => { setResumeText(""); setResumeSource(""); setResumeError(""); }}>
                    <X className="mr-2 h-4 w-4" />
                    Remove Resume
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => resumeFileRef.current?.click()}>
                    <FileText className="mr-2 h-4 w-4" />
                    Upload PDF
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Template chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {PROMPT_TEMPLATES.map((t, i) => (
            <button
              key={t.label}
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                activeTemplate === i
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-zinc-400 dark:border-zinc-600 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
              onClick={() => {
                const text = templateToText(t.segments);
                setDescription(text);
                prevDescRef.current = text;
                setActiveTemplate(i);
                setHlRanges(rangesFromSegments(t.segments));
              }}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      {/* Progress bar (shared across the unified flow) */}
      <div className="absolute top-0 left-0 h-1 bg-muted w-full z-10">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${((wizardOffset + currentStep) / (wizardOffset + innerStepCount)) * 100}%` }}
        />
      </div>

          {/* Step panels — sliding container */}
          <div className="relative overflow-hidden flex-1" style={{ minHeight: "420px" }}>
            {/* ── Step 2: Describe / Select / Details ── */}
            <div
              className="absolute inset-0 overflow-y-auto transition-transform duration-500 ease-in-out px-10 pb-32 flex flex-col"
              style={{ transform: `translateX(${(STEP_INPUT - currentStep) * 100}%)` }}
            >
              {(mode === "ai" || mode === "coding") && (
                <div className="max-w-4xl mx-auto w-full space-y-8 flex flex-col pt-14 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="text-center space-y-3 mb-6">
                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-2">
                      <Sparkles className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Describe the Role or Goal</h3>
                    <p className="text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
                      Provide a brief prompt, paste a Job Description, or upload a candidate resume to generate the interview's parameters.
                    </p>
                  </div>
                  <div className="animate-in fade-in zoom-in-95 duration-1000 delay-150 fill-mode-both">
                    {renderPromptArea()}
                  </div>
                </div>
              )}

              {mode === "template" && (
                <div className="w-full flex flex-col justify-center">
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur pt-10 pb-6 space-y-6">
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Select Job Template</h3>
                      <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
                        Choose a job template below. The AI will customize structured questions and assessment criteria for the selected role.
                      </p>
                    </div>

                    {/* Search Bar */}
                    <div className="flex gap-2.5 mt-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search templates..."
                          value={templateSearchQuery}
                          onChange={(e) => setTemplateSearchQuery(e.target.value)}
                          className="pl-9 rounded-xl border-border/80 bg-muted/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Template Card List */}
                  <div className="grid grid-cols-1 gap-4 p-1 pb-10 text-left items-start">
                    {filteredTemplates.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                        <FileText className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-xs">No matching templates found.</p>
                      </div>
                    ) : (
                      filteredTemplates.map((t) => {
                        const isSelected = selectedTemplateId === t.id;
                        return (
                          <div
                            key={t.id}
                            className={cn(
                              "border rounded-2xl p-4 bg-card transition-all cursor-pointer hover:border-primary/50",
                              isSelected ? "border-green-600 ring-2 ring-inset ring-green-600/30 bg-green-500/[0.02]" : "border-border/80"
                            )}
                            onClick={() => {
                              setSelectedTemplateId(t.id);
                              setDescription(t.jobDescription);
                              setTitle(t.title);
                              setObjective(`Assess candidates for the ${t.title} role.`);
                              // Pre-populate rubric and questions directly to bypass AI step
                              if (t.scoringRubric && Array.isArray(t.scoringRubric)) {
                                setEditableCriteria(t.scoringRubric as any[]);
                              } else {
                                setEditableCriteria([]);
                              }
                              // Force AI to generate questions dynamically based on interview duration
                              setEditableQuestions([]);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3.5">
                                <div className="h-10 w-10 rounded-xl bg-muted/60 flex items-center justify-center">
                                  <FileText className="h-5 w-5 text-muted-foreground/80" />
                                </div>
                                <div>
                                  <h4 className={cn("text-lg font-bold transition-colors", isSelected ? "text-green-700 dark:text-green-400" : "text-foreground")}>
                                    {t.title}
                                  </h4>
                                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                                    {t.jobType}
                                  </span>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="h-5 w-5 rounded-full bg-green-600 flex items-center justify-center text-white">
                                  <Check className="h-3 w-3 stroke-[3]" />
                                </div>
                              )}
                            </div>

                            {isSelected && (
                              <div className="mt-4 border-t pt-4 space-y-3">
                                <div>
                                  <h5 className="text-xs font-bold text-foreground mb-2">Description</h5>
                                  <Textarea 
                                    className="text-xs text-muted-foreground leading-relaxed min-h-[80px]"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>

                                <div className="w-full space-y-2 mt-4 text-left">
                                  {/* Scoring rubric Accordion */}
                                  <div className="border rounded-xl bg-background/50 overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenAccordion(openAccordion === "rubric" ? null : "rubric");
                                      }}
                                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold hover:bg-muted/30 transition-colors"
                                    >
                                      <span>Scoring rubric</span>
                                      <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", openAccordion === "rubric" && "rotate-180")} />
                                    </button>
                                    {openAccordion === "rubric" && (
                                      <div className="px-4 pb-3.5 pt-3 text-xs text-muted-foreground leading-relaxed border-t bg-muted/10 space-y-2">
                                        {editableCriteria.length > 0 ? (
                                          <div className="space-y-3">
                                            {editableCriteria.map((r, i) => (
                                              <div key={i} className="flex flex-col gap-1">
                                                <Input 
                                                  className="h-7 text-xs font-bold bg-background" 
                                                  value={r.name} 
                                                  onChange={(e) => {
                                                    const newCr = [...editableCriteria];
                                                    newCr[i].name = e.target.value;
                                                    setEditableCriteria(newCr);
                                                  }} 
                                                  onClick={(e) => e.stopPropagation()}
                                                />
                                                <Textarea 
                                                  className="text-xs h-14 bg-background" 
                                                  value={r.description} 
                                                  onChange={(e) => {
                                                    const newCr = [...editableCriteria];
                                                    newCr[i].description = e.target.value;
                                                    setEditableCriteria(newCr);
                                                  }}
                                                  onClick={(e) => e.stopPropagation()}
                                                />
                                              </div>
                                            ))}
                                            <Button size="sm" variant="outline" className="w-full text-[10px] h-7 border-dashed" onClick={(e) => {
                                              e.stopPropagation();
                                              setEditableCriteria([...editableCriteria, { name: "", description: "" }]);
                                            }}>
                                              <Plus className="h-3 w-3 mr-1" /> Add Criterion
                                            </Button>
                                          </div>
                                        ) : (
                                          "A custom evaluation rubric will be generated automatically by AI based on the job requirements."
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Interview questions Accordion */}
                                  <div className="border rounded-xl bg-background/50 overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenAccordion(openAccordion === "questions" ? null : "questions");
                                      }}
                                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold hover:bg-muted/30 transition-colors"
                                    >
                                      <span>Interview questions (AI Generated)</span>
                                      <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", openAccordion === "questions" && "rotate-180")} />
                                    </button>
                                    {openAccordion === "questions" && (
                                      <div className="px-4 pb-3.5 pt-3 text-xs text-muted-foreground leading-relaxed border-t bg-muted/10 space-y-2">
                                        AI will compose structural behavioral and technical questions dynamically matching the selected duration and job description.
                                      </div>
                                    )}
                                  </div>

                                  {/* Intro Text Accordion (Non-Interactive only) */}
                                  {format === "noninteractive" && (
                                    <div className="border rounded-xl bg-background/50 overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenAccordion(openAccordion === "intro" ? null : "intro");
                                        }}
                                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold hover:bg-muted/30 transition-colors"
                                      >
                                        <span>Intro video text</span>
                                        <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", openAccordion === "intro" && "rotate-180")} />
                                      </button>
                                      {openAccordion === "intro" && (
                                        <div className="px-4 pb-3.5 pt-3 text-xs text-muted-foreground leading-relaxed border-t bg-muted/10">
                                          <textarea
                                            className="w-full bg-transparent border border-input rounded-md p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary min-h-[100px]"
                                            value={introText}
                                            onChange={(e) => setIntroText(e.target.value)}
                                            placeholder="Type custom intro video speech text..."
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Outro Text Accordion (Non-Interactive only) */}
                                  {format === "noninteractive" && (
                                    <div className="border rounded-xl bg-background/50 overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenAccordion(openAccordion === "outro" ? null : "outro");
                                        }}
                                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold hover:bg-muted/30 transition-colors"
                                      >
                                        <span>Outro video text</span>
                                        <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", openAccordion === "outro" && "rotate-180")} />
                                      </button>
                                      {openAccordion === "outro" && (
                                        <div className="px-4 pb-3.5 pt-3 text-xs text-muted-foreground leading-relaxed border-t bg-muted/10">
                                          <textarea
                                            className="w-full bg-transparent border border-input rounded-md p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary min-h-[100px]"
                                            value={outroText}
                                            onChange={(e) => setOutroText(e.target.value)}
                                            placeholder="Type custom outro video speech text..."
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Job description Accordion */}
                                  <div className="border rounded-xl bg-background/50 overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenAccordion(openAccordion === "jd" ? null : "jd");
                                      }}
                                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold hover:bg-muted/30 transition-colors"
                                    >
                                      <span>Job description</span>
                                      <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", openAccordion === "jd" && "rotate-180")} />
                                    </button>
                                    {openAccordion === "jd" && (
                                      <div className="px-4 pb-3.5 pt-3 text-xs text-muted-foreground leading-relaxed border-t bg-muted/10">
                                        <textarea
                                          className="w-full bg-transparent border border-input rounded-md p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary min-h-[120px]"
                                          value={description}
                                          onChange={(e) => setDescription(e.target.value)}
                                          placeholder="Edit job description to add specific years of experience or requirements..."
                                        />
                                        <p className="mt-2 text-[10px] text-muted-foreground">Feel free to append years of experience or specific requirements before proceeding.</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {mode === "manual" && (
                <div className="max-w-2xl mx-auto w-full space-y-6 flex flex-col justify-center">
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Set Interview Details</h3>
                    <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
                      Build your interview structure. Input the title, objective, and description for this manual session.
                    </p>
                  </div>

                  <div className="space-y-4 text-left bg-card border rounded-2xl p-6 shadow-sm">
                    <div className="space-y-2">
                      <Label htmlFor="manual-title">Interview Title <span className="text-destructive">*</span></Label>
                      <Input
                        id="manual-title"
                        placeholder="e.g. Senior Frontend Engineer Interview"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="rounded-xl border-border/80 bg-background"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-objective">Objective</Label>
                      <Input
                        id="manual-objective"
                        placeholder="e.g. Assess React performance optimization and teamwork abilities."
                        value={objective}
                        onChange={(e) => setObjective(e.target.value)}
                        className="rounded-xl border-border/80 bg-background"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-description">Job Description (Optional, for CV Scoring)</Label>
                      <Textarea
                        id="manual-description"
                        placeholder="Paste the job description here. If provided, candidate CVs will be matched against this criteria."
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          setEditableJobDescription(e.target.value);
                        }}
                        rows={4}
                        className="rounded-xl border-border/80 bg-background resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Step 1: Configure ── */}
            <div
              className="absolute inset-0 overflow-y-auto transition-transform duration-500 ease-in-out px-10 pt-4 pb-32 flex flex-col"
              style={{ transform: `translateX(${(1 - currentStep) * 100}%)` }}
            >
              <div className={cn(
                "mx-auto w-full space-y-6 flex flex-col my-auto pt-2 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700",
                mode === "coding" ? "max-w-[1360px]" : "max-w-[900px]"
              )}>
                <div className="text-center space-y-2">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-1">
                    <Target className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Configure Interview Settings</h3>
                  <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                    Adjust session parameters to best suit your team's evaluation requirements.
                  </p>
                </div>

                <div className={cn(
                  "grid gap-6",
                  "grid-cols-1 md:grid-cols-3"
                )}>
                  {/* Duration */}
                  <div className="flex flex-col bg-card border rounded-2xl p-5 shadow-sm space-y-3 hover:border-primary/45 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <Label htmlFor="wiz-duration" className="text-base font-bold text-foreground">Duration</Label>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Session length</p>
                      </div>
                    </div>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger id="wiz-duration" className="h-10 rounded-xl border-border/80 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERVIEW_DURATION_MINUTES.map((minutes) => (
                          <SelectItem key={minutes} value={String(minutes)}>
                            {formatDurationOption(minutes)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tone */}
                  <div className="flex flex-col bg-card border rounded-2xl p-5 shadow-sm space-y-3 hover:border-primary/45 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <MessageSquareText className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <Label className="text-base font-bold text-foreground">AI Voice Tone</Label>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Avatar personality</p>
                      </div>
                    </div>
                    <Select value={aiTone} onValueChange={(v) => setAiTone(v as typeof aiTone)}>
                      <SelectTrigger className="h-10 rounded-xl border-border/80 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_TONES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Anti-Cheating Security toggle — always visible */}
                  <div className="flex flex-col bg-card border rounded-2xl p-5 shadow-sm space-y-3 hover:border-primary/45 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center",
                          antiCheatingEnabled ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary"
                        )}>
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                          <Label className="text-base font-bold text-foreground">Anti-Cheating</Label>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Camera/mic and tab tracking</p>
                        </div>
                      </div>
                      <Switch checked={antiCheatingEnabled} onCheckedChange={setAntiCheatingEnabled} />
                    </div>
                    {antiCheatingEnabled && (
                      <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-[10px] text-amber-800 dark:text-amber-300 space-y-1 text-left animate-in fade-in slide-in-from-top-2 duration-300">
                        <p className="font-bold">Required candidate constraints:</p>
                        <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                          <li>Camera and microphone must be enabled</li>
                          <li>Screen sharing must be running</li>
                          <li>Tab switches and focus loss are flagged</li>
                        </ul>
                      </div>
                    )}
                  </div>

                  {showMultilingualToggle && (
                    <div className="flex flex-col bg-card border rounded-2xl p-5 shadow-sm space-y-3 hover:border-primary/45 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <Languages className="h-5 w-5" />
                          </div>
                          <div className="text-left">
                            <Label className="text-base font-bold text-foreground">Multilingual</Label>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Candidate chooses language</p>
                          </div>
                        </div>
                        <Switch checked={multilingualEnabled} onCheckedChange={setMultilingualEnabled} />
                      </div>
                    </div>
                  )}

                  {/* Whiteboard toggle — always visible */}
                  <div className="flex flex-col bg-card border rounded-2xl p-5 shadow-sm space-y-3 hover:border-primary/45 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <PenLine className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                          <Label className="text-base font-bold text-foreground">Whiteboard</Label>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Freehand drawing canvas</p>
                        </div>
                      </div>
                      <Switch checked={whiteboardEnabled} onCheckedChange={setWhiteboardEnabled} />
                    </div>
                  </div>

                  {/* Code Editor toggle — always visible */}
                  <div className="flex flex-col bg-card border rounded-2xl p-5 shadow-sm space-y-3 hover:border-primary/45 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <Code2 className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                          <Label className="text-base font-bold text-foreground">Code Editor</Label>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Sandbox for coding tasks</p>
                        </div>
                      </div>
                      <Switch checked={codeEnabled} onCheckedChange={setCodeEnabled} />
                    </div>
                  </div>

                  {mode === "coding" ? (
                    <>
                      {/* Behavioral Questions */}
                      <div className="flex flex-col bg-card border rounded-2xl p-5 shadow-sm space-y-3 hover:border-primary/45 transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                              <UserCheck className="h-5 w-5" />
                            </div>
                            <div className="text-left">
                              <Label className="text-base font-bold text-foreground">Behavioral</Label>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Add scenario & character questions</p>
                            </div>
                          </div>
                          <Switch checked={behavioralEnabledCheck} onCheckedChange={handleBehavioralToggle} />
                        </div>
                        {behavioralEnabledCheck && (
                          <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
                            <Label htmlFor="wiz-behavioral-questions-count" className="text-xs font-semibold text-muted-foreground">Number of questions</Label>
                            <Select value={numBehavioralQuestions} onValueChange={handleBehavioralQuestionsChange}>
                              <SelectTrigger id="wiz-behavioral-questions-count" className="h-10 rounded-xl border-border/80 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: Math.max(1, getCapacity() - (codingEnabledCheck ? Number(numCodingQuestions) : 0)) }, (_, i) => i + 1).map((num) => (
                                  <SelectItem key={num} value={String(num)}>
                                    {num} {num === 1 ? "question" : "questions"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      {/* Coding Questions */}
                      <div className="flex flex-col bg-card border rounded-2xl p-5 shadow-sm space-y-3 hover:border-primary/45 transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                              <Code2 className="h-5 w-5" />
                            </div>
                            <div className="text-left">
                              <Label className="text-base font-bold text-foreground">Coding</Label>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Add coding sandbox tasks</p>
                            </div>
                          </div>
                          <Switch checked={codingEnabledCheck} onCheckedChange={handleCodingToggle} />
                        </div>
                        {codingEnabledCheck && (
                          <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="space-y-1">
                              <Label htmlFor="wiz-coding-questions-count" className="text-xs font-semibold text-muted-foreground">Number of questions</Label>
                              <Select value={numCodingQuestions} onValueChange={handleCodingQuestionsChange}>
                                <SelectTrigger id="wiz-coding-questions-count" className="h-10 rounded-xl border-border/80 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: Math.max(1, getCapacity() - (behavioralEnabledCheck ? Number(numBehavioralQuestions) : 0)) }, (_, i) => i + 1).map((num) => (
                                    <SelectItem key={num} value={String(num)}>
                                      {num} {num === 1 ? "question" : "questions"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col bg-card border rounded-2xl p-5 shadow-sm space-y-3 hover:border-primary/45 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <ListOrdered className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                          <Label htmlFor="wiz-num-questions" className="text-base font-bold text-foreground">Questions</Label>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Number to generate</p>
                        </div>
                      </div>
                      <Select value={numQuestions || "auto"} onValueChange={(v) => setNumQuestions(v === "auto" ? "" : v)}>
                        <SelectTrigger id="wiz-num-questions" className="h-10 rounded-xl border-border/80 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (based on duration)</SelectItem>
                          {Array.from({ length: 14 }, (_, i) => i + 2).map((num) => (
                            <SelectItem key={num} value={String(num)}>
                              {num} questions
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </div>



            {/* ── Step: Avatar & Voice (non-interactive only) ── */}
            {showAvatarStep && (
              <div
                className="absolute inset-0 overflow-y-auto transition-transform duration-500 ease-in-out px-10 pt-10 pb-32 flex flex-col"
                style={{ transform: `translateX(${(STEP_AVATAR - currentStep) * 100}%)` }}
              >
                <div className="max-w-4xl mx-auto w-full space-y-10 flex flex-col my-auto pt-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="text-center space-y-3">
                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-2">
                      <Video className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Avatar & Voice</h3>
                    <p className="text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
                      Choose the portrait still and voice used for pregenerated interview clips.
                    </p>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="text-center sm:text-left">
                        <h4 className="text-lg font-bold text-foreground">Choose a preset</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Each clip is paired with a matching voice. Select a tile to play a preview; click again to replay. You can still change the voice below.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {AVATAR_PRESETS.map((preset) => {
                          const selected =
                            selectedAvatarPresetId === preset.id ||
                            (!selectedAvatarPresetId &&
                              findMatchingAvatarPreset(avatarImageUrl, avatarVoice)
                                ?.id === preset.id);
                          return (
                            <AvatarPresetTile
                              key={preset.id}
                              preset={preset}
                              selected={selected}
                              onSelect={() => handleSelectAvatarPreset(preset.id)}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div className="relative flex items-center gap-4">
                      <div className="h-px flex-1 bg-border" />
                      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        — or generate your own —
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
                      <div className="bg-card border rounded-2xl p-8 shadow-sm space-y-6 hover:border-primary/45 transition-all flex flex-col">
                        <div>
                          <h4 className="text-lg font-bold text-foreground">Avatar image</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Upload a clear portrait photo. A default image is used if you skip this.
                          </p>
                        </div>
                        <div className="flex flex-col items-center gap-4 flex-1">
                          <div className="h-40 w-40 overflow-hidden rounded-2xl border bg-muted shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={avatarImageUrl || "/avatars/woman-v1.png"}
                              alt="Avatar preview"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <input
                            ref={avatarFileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarUpload}
                          />
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={uploadingAvatar}
                              onClick={() => avatarFileRef.current?.click()}
                            >
                              {uploadingAvatar ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="mr-2 h-4 w-4" />
                              )}
                              {avatarImageUrl ? "Change image" : "Upload image"}
                            </Button>
                            {avatarImageUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                className="text-muted-foreground"
                                onClick={() => {
                                  setSelectedAvatarPresetId(null);
                                  setAvatarImageUrl(null);
                                }}
                              >
                                Use default
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-card border rounded-2xl p-8 shadow-sm space-y-6 hover:border-primary/45 transition-all flex flex-col">
                        <div>
                          <h4 className="text-lg font-bold text-foreground">Voice</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Select the speaking voice for all scripted avatar clips.
                          </p>
                        </div>
                        <div className="space-y-4 flex-1 flex flex-col justify-center">
                          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/40">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                              <Mic className="h-6 w-6" />
                            </div>
                            <div className="flex-1 space-y-2 text-left">
                              <Label htmlFor="avatar-voice">Speaking voice</Label>
                              <Select
                                value={avatarVoice}
                                onValueChange={(v) => handleAvatarVoiceChange(v as AvatarVoice)}
                              >
                                <SelectTrigger id="avatar-voice">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {AVATAR_VOICES.map((v) => (
                                    <SelectItem key={v} value={v}>
                                      {v}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step: Generate ── */}
            <div
              className="absolute inset-0 overflow-y-auto transition-transform duration-500 ease-in-out px-10 pt-10 pb-32 flex flex-col"
              style={{ transform: `translateX(${(STEP_GENERATE - currentStep) * 100}%)` }}
            >
              <div className="max-w-4xl mx-auto w-full flex flex-col items-center justify-center space-y-8 text-center my-auto animate-in fade-in zoom-in-95 duration-700">
              {!generating && !thinkingText && !contentText ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[340px] gap-8 text-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 shadow-xl shadow-primary/10">
                    <Sparkles className="h-12 w-12 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-foreground">Ready to generate</h3>
                    <p className="text-base text-muted-foreground mt-2 max-w-md mx-auto">
                      The AI will create a complete interview structure with questions, criteria, and a job description based on your input.
                    </p>
                  </div>
                  {/* Summary of settings */}
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    <Badge variant="secondary" className="px-3 py-1 text-xs">{formatDurationOption(Number(duration))} min</Badge>
                    <Badge variant="secondary" className="px-3 py-1 text-xs">{LANGUAGES.find(l => l.value === language)?.label ?? language}</Badge>
                    <Badge variant="secondary" className="px-3 py-1 text-xs">{AI_TONES.find(t => t.value === aiTone)?.label ?? aiTone}</Badge>
                    {whiteboardEnabled && <Badge variant="outline" className="px-3 py-1 text-xs">Whiteboard</Badge>}
                    {codeEnabled && <Badge variant="outline" className="px-3 py-1 text-xs">Code Editor</Badge>}
                    {antiCheatingEnabled && <Badge variant="outline" className="px-3 py-1 text-xs border-amber-500 text-amber-600">Anti-Cheat</Badge>}
                    {multilingualEnabled && showMultilingualToggle && <Badge variant="outline" className="px-3 py-1 text-xs">Multilingual</Badge>}
                  </div>
                  <Button
                    className="px-10 py-8 text-xl font-bold rounded-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                    onClick={handleGenerate}
                    disabled={!description.trim()}
                  >
                    <Sparkles className="mr-3 h-6 w-6" />
                    Generate Interview
                  </Button>
                </div>
              ) : (
                <div className="w-full max-w-2xl mx-auto space-y-8 py-8 text-center">
                  <div className="relative flex flex-col items-center justify-center">
                    <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full w-32 h-32 mx-auto animate-pulse" />
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 border border-primary/20 shadow-xl shadow-primary/20 animate-bounce">
                      <BrainCircuit className="h-12 w-12 text-primary" />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <h3 className="text-3xl font-extrabold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent animate-pulse">
                      {streamPhase === "thinking" ? "Analyzing Requirements..." : streamPhase === "writing" ? "Crafting Interview..." : "Finalizing..."}
                    </h3>
                    <p className="text-base text-muted-foreground">This takes a few seconds. We are using advanced AI models to generate a highly tailored interview.</p>
                  </div>
                  
                  <div className="relative mt-12 rounded-3xl bg-card p-10 shadow-sm border text-center overflow-hidden h-[240px] max-w-xl mx-auto flex flex-col justify-center">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/10 via-primary to-primary/10 animate-pulse" />
                    <div className="flex flex-col items-center justify-center h-full gap-5 relative z-10">
                       <Loader2 className="h-10 w-10 text-primary animate-spin" />
                       <div className="space-y-3 w-full max-w-sm mx-auto">
                          <p className="text-sm font-semibold text-foreground">
                            {streamPhase === "thinking" ? "Analyzing role requirements..." : streamPhase === "writing" ? "Finalizing questions and grading rubric..." : "Initializing..."}
                          </p>
                          <div className="h-2 w-full bg-muted/80 rounded-full overflow-hidden">
                             <div className="h-full bg-primary transition-all duration-1000 ease-in-out" style={{ width: streamPhase === "thinking" ? "40%" : streamPhase === "writing" ? "80%" : "10%" }} />
                          </div>
                       </div>
                       <div className="h-[40px] w-full max-w-md mx-auto overflow-hidden opacity-50 mt-2 text-xs text-muted-foreground mask-image-fade text-center">
                          {thinkingText && <p className="truncate">{thinkingText.slice(-80)}</p>}
                          {contentText && <p className="truncate">{contentText.slice(-80)}</p>}
                       </div>
                    </div>
                  </div>
                  
                  <div ref={streamEndRef} />
                </div>
              )}
              </div>
            </div>

            {/* ── Step: Review & Refine ── */}
            <div
              className="absolute inset-0 overflow-y-auto transition-transform duration-500 ease-in-out px-10 pt-10 pb-32 flex flex-col"
              style={{ transform: `translateX(${(STEP_REVIEW - currentStep) * 100}%)` }}
            >
              <div className="w-full flex flex-col my-auto pt-4">
              { (mode === "manual" || result) && (
                <>
                  {/* Interview header */}
                  <div className="flex items-start justify-between gap-4 border-b border-dashed pb-5 mb-5 text-left">
                    <div className="space-y-1">
                      <h3 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                        {(mode === "ai" || mode === "coding" || mode === "template") ? result?.title : title || "Review Interview Content"}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {(mode === "ai" || mode === "coding" || mode === "template") ? result?.objective : objective || "Verify and edit the generated questions and details below."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 shrink-0 pt-1">
                      {whiteboardEnabled && <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 font-bold">Whiteboard</Badge>}
                      {codeEnabled && <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 font-bold">Code Editor</Badge>}
                      {multilingualEnabled && showMultilingualToggle && (
                        <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 font-bold">Multilingual</Badge>
                      )}
                      {isVoiceOnly && (
                        <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 font-bold">
                          {avatarVoice}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="font-semibold bg-muted/60">~{duration} min</Badge>
                      <Badge variant="secondary" className="font-semibold bg-muted/60">{editableQuestions.length} questions</Badge>
                    </div>
                  </div>

                   {/* Intro/Outro Text (Non-Interactive only) */}
                   {format === "noninteractive" && (
                     <div className="space-y-4">
                       <div className="space-y-2">
                         <Label className="flex items-center gap-1.5 text-sm font-medium">
                           <span>Intro Video Text</span>
                         </Label>
                         <p className="text-xs text-muted-foreground">The script spoken by the AI avatar when starting the interview.</p>
                         <Textarea
                           value={introText}
                           onChange={(e) => setIntroText(e.target.value)}
                           placeholder="Type custom intro video speech text..."
                           rows={3}
                         />
                       </div>

                       <div className="space-y-2">
                         <Label className="flex items-center gap-1.5 text-sm font-medium">
                           <span>Outro Video Text</span>
                         </Label>
                         <p className="text-xs text-muted-foreground">The script spoken by the AI avatar when the interview is completed.</p>
                         <Textarea
                           value={outroText}
                           onChange={(e) => setOutroText(e.target.value)}
                           placeholder="Type custom outro video speech text..."
                           rows={3}
                         />
                       </div>
                     </div>
                   )}

                   {/* Job Description */}
                   <div className="space-y-2">
                     <Label className="flex items-center gap-1.5 text-sm font-medium">
                       <Briefcase className="h-4 w-4" />
                       Job Description
                     </Label>
                     <p className="text-xs text-muted-foreground">Used as the primary basis for scoring candidate CVs.</p>
                     <Textarea
                       value={editableJobDescription}
                       onChange={(e) => setEditableJobDescription(e.target.value)}
                       placeholder="Job Description..."
                       rows={4}
                       className="resize-none"
                     />
                   </div>

                  {/* Questions */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                      <ListOrdered className="h-4 w-4" />
                      Questions ({editableQuestions.length})
                    </Label>
                    <div className="space-y-1">
                      {editableQuestions.map((q, i) => (
                        <QuestionCard
                          key={`q-${i}`}
                          data={q}
                          index={i}
                          editing={editingIndex === i}
                          onStartEdit={() => setEditingIndex(i)}
                          onSave={(updated) => {
                            updateQuestion(i, updated as Partial<GeneratedQuestion>);
                            setEditingIndex(null);
                          }}
                          onCancel={() => setEditingIndex(null)}
                          onDelete={() => deleteQuestion(i)}
                          dragProps={{
                            draggable: editingIndex !== i,
                            onDragStart: (e) => handleDragStart(e, i),
                            onDragOver: (e) => handleDragOver(e, i),
                            onDragLeave: handleDragLeave,
                            onDrop: (e) => handleDrop(e, i),
                            onDragEnd: handleDragEnd,
                          }}
                          className={cn(
                            dragOverIndex === i && dragIndexRef.current !== i ? "border-primary bg-primary/5" : "",
                            dragIndexRef.current === i && "opacity-50",
                          )}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={addQuestion} className="flex-1 border-dashed">
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add New
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 border-dashed" onClick={() => setImportOpen(true)}>
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        Import Existing
                      </Button>
                    </div>
                  </div>

                  <ImportDialog
                    open={importOpen}
                    onOpenChange={setImportOpen}
                    onImport={(imported) => {
                      setEditableQuestions((prev) => [
                        ...prev,
                        ...imported.map((q, i) => ({ ...q, order: prev.length + i + 1 })),
                      ]);
                      toast({ title: `${imported.length} question${imported.length > 1 ? "s" : ""} imported` });
                    }}
                    existingTexts={editableQuestions.map((q) => q.text)}
                  />

                  <div className="border-t" />

                  {/* Assessment Criteria */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                      <Target className="h-4 w-4" />
                      Interview Assessment Criteria ({editableCriteria.length})
                    </Label>
                    <div className="space-y-1.5">
                      {editableCriteria.length === 0 ? (
                        <p className="py-2 text-sm text-muted-foreground">No assessment criteria defined yet.</p>
                      ) : (
                        editableCriteria.map((c, i) => (
                          <div key={i} className={`group flex items-start gap-2 rounded-md border px-3 py-2 transition-all ${editingCriterionIndex !== i ? "hover:border-primary/30" : ""}`}>
                            {editingCriterionIndex === i ? (
                              <div className="flex-1 space-y-2">
                                <Input
                                  value={c.name}
                                  onChange={(e) => setEditableCriteria((prev) => prev.map((cr, idx) => idx === i ? { ...cr, name: e.target.value } : cr))}
                                  placeholder="Criterion name..."
                                  className="h-8 text-sm font-medium"
                                  autoFocus
                                />
                                <Textarea
                                  value={c.description}
                                  onChange={(e) => setEditableCriteria((prev) => prev.map((cr, idx) => idx === i ? { ...cr, description: e.target.value } : cr))}
                                  placeholder="What this criterion measures..."
                                  rows={2}
                                  className="resize-y text-sm"
                                />
                                <div className="flex justify-end gap-2">
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="sm" variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive">
                                        <Trash2 className="mr-1 h-3 w-3" />Delete
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete criterion?</AlertDialogTitle>
                                        <AlertDialogDescription>This will permanently remove this assessment criterion.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          onClick={() => { setEditableCriteria((prev) => prev.filter((_, idx) => idx !== i)); setEditingCriterionIndex(null); criterionSnapshotRef.current = null; }}>
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                  <Button size="sm" variant="outline" onClick={() => {
                                    const snapshot = criterionSnapshotRef.current;
                                    criterionSnapshotRef.current = null;
                                    if (snapshot) { setEditableCriteria((prev) => prev.map((cr, idx) => idx === i ? snapshot : cr)); }
                                    else { setEditableCriteria((prev) => prev.filter((_, idx) => idx !== i)); }
                                    setEditingCriterionIndex(null);
                                  }}>
                                    <X className="mr-1 h-3 w-3" />Cancel
                                  </Button>
                                  <Button size="sm" onClick={() => { criterionSnapshotRef.current = null; setEditingCriterionIndex(null); }}>
                                    <Check className="mr-1 h-3 w-3" />Done
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1 cursor-pointer" onClick={() => { criterionSnapshotRef.current = structuredClone(editableCriteria[i]); setEditingCriterionIndex(i); }}>
                                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                                  <p className="text-xs text-muted-foreground">{c.description}</p>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button type="button" className="p-0.5 text-muted-foreground/80 hover:text-foreground transition-colors"
                                    onClick={(e) => { e.stopPropagation(); criterionSnapshotRef.current = structuredClone(editableCriteria[i]); setEditingCriterionIndex(i); }}>
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <button type="button" className="p-0.5 text-muted-foreground/80 hover:text-destructive transition-colors" onClick={(e) => e.stopPropagation()}>
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete criterion?</AlertDialogTitle>
                                        <AlertDialogDescription>This will permanently remove this assessment criterion.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          onClick={() => { setEditableCriteria((prev) => prev.filter((_, idx) => idx !== i)); setEditingCriterionIndex(null); criterionSnapshotRef.current = null; }}>
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    <Button variant="outline" size="sm" className="w-full border-dashed"
                      onClick={() => { setEditableCriteria((prev) => [...prev, { name: "", description: "" }]); setEditingCriterionIndex(editableCriteria.length); }}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add Criterion
                    </Button>
                  </div>

                  <div className="border-t" />

                  {/* Resume CV Assessment Criteria */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                      <Target className="h-4 w-4 text-blue-500" />
                      Resume Assessment Criteria ({editableCvAssessmentCriteria.length})
                      <span className="ml-1 rounded-sm bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">CV Scoring</span>
                    </Label>
                    <p className="text-xs text-muted-foreground -mt-1">Short 2-word labels for the radar graph, plus a one-sentence explanation for each.</p>
                    <div className="space-y-1.5">
                      {editableCvAssessmentCriteria.length === 0 ? (
                        <p className="py-2 text-sm text-muted-foreground">No resume assessment criteria defined yet.</p>
                      ) : (
                        editableCvAssessmentCriteria.map((c, i) => (
                          <div key={i} className="group space-y-1.5 rounded-md border px-3 py-2 transition-all hover:border-blue-300">
                            <div className="flex items-center gap-2">
                              <input
                                className="w-full bg-transparent text-sm font-semibold outline-none"
                                value={c.name}
                                onChange={(e) =>
                                  setEditableCvAssessmentCriteria((prev) =>
                                    prev.map((v, idx) =>
                                      idx === i ? { ...v, name: e.target.value } : v,
                                    ),
                                  )
                                }
                                placeholder="Max 2 words (e.g. SAP Skills)"
                              />
                              <button
                                type="button"
                                className="shrink-0 p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                onClick={() =>
                                  setEditableCvAssessmentCriteria((prev) =>
                                    prev.filter((_, idx) => idx !== i),
                                  )
                                }
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input
                              className="w-full bg-transparent text-xs text-muted-foreground outline-none"
                              value={c.description}
                              onChange={(e) =>
                                setEditableCvAssessmentCriteria((prev) =>
                                  prev.map((v, idx) =>
                                    idx === i ? { ...v, description: e.target.value } : v,
                                  ),
                                )
                              }
                              placeholder="One sentence explaining what this measures"
                            />
                          </div>
                        ))
                      )}
                    </div>
                    <Button variant="outline" size="sm" className="w-full border-dashed"
                      onClick={() => setEditableCvAssessmentCriteria(prev => [...prev, { name: "", description: "" }])}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add CV Criterion
                    </Button>
                  </div>

                  {/* JD Alignment Criteria */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                      <Target className="h-4 w-4 text-green-500" />
                      JD Alignment Criteria ({editableCvJdAlignmentCriteria.length})
                      <span className="ml-1 rounded-sm bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">JD Match</span>
                    </Label>
                    <p className="text-xs text-muted-foreground -mt-1">Short 2-word labels for the radar graph, plus a one-sentence JD explanation for each.</p>
                    <div className="space-y-1.5">
                      {editableCvJdAlignmentCriteria.length === 0 ? (
                        <p className="py-2 text-sm text-muted-foreground">No JD alignment criteria defined yet.</p>
                      ) : (
                        editableCvJdAlignmentCriteria.map((c, i) => (
                          <div key={i} className="group space-y-1.5 rounded-md border px-3 py-2 transition-all hover:border-green-300">
                            <div className="flex items-center gap-2">
                              <input
                                className="w-full bg-transparent text-sm font-semibold outline-none"
                                value={c.name}
                                onChange={(e) =>
                                  setEditableCvJdAlignmentCriteria((prev) =>
                                    prev.map((v, idx) =>
                                      idx === i ? { ...v, name: e.target.value } : v,
                                    ),
                                  )
                                }
                                placeholder="Max 2 words (e.g. B2B Sales)"
                              />
                              <button
                                type="button"
                                className="shrink-0 p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                onClick={() =>
                                  setEditableCvJdAlignmentCriteria((prev) =>
                                    prev.filter((_, idx) => idx !== i),
                                  )
                                }
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input
                              className="w-full bg-transparent text-xs text-muted-foreground outline-none"
                              value={c.description}
                              onChange={(e) =>
                                setEditableCvJdAlignmentCriteria((prev) =>
                                  prev.map((v, idx) =>
                                    idx === i ? { ...v, description: e.target.value } : v,
                                  ),
                                )
                              }
                              placeholder="One sentence explaining this JD requirement"
                            />
                          </div>
                        ))
                      )}
                    </div>
                    <Button variant="outline" size="sm" className="w-full border-dashed"
                      onClick={() => setEditableCvJdAlignmentCriteria(prev => [...prev, { name: "", description: "" }])}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add JD Criterion
                    </Button>
                  </div>

                  <div className="border-t" />

                  {/* AI Refinement box */}

                  {mode !== "manual" && (
                    <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
                      <Label className="flex items-center gap-1.5 text-sm font-medium">
                        <MessageSquareText className="h-4 w-4" />
                        Refine with AI
                      </Label>
                      <p className="text-xs text-muted-foreground">Describe what you&apos;d like to change and AI will update the questions.</p>
                      <Textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder='e.g. "Make the questions harder", "Add more behavioral questions", "Remove the ice-breaker"...'
                        rows={2}
                        className="resize-none bg-background"
                      />
                      <AiButton wrapperClassName="w-fit" size="sm" loading={refining} disabled={!feedback.trim()} onClick={handleRefine}>
                        {!refining && <Sparkles className="mr-2 h-3.5 w-3.5" />}
                        {refining ? (streamPhase === "thinking" ? "Thinking..." : streamPhase === "writing" ? "Writing..." : "Refining...") : "Refine Questions"}
                      </AiButton>
                      {/* Refine streaming display */}
                      {refining && (thinkingText || contentText) && (
                        <div className="space-y-2 mt-2">
                          {thinkingText && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">{streamPhase === "thinking" ? "Thinking..." : "Thinking complete"}</p>
                              <div ref={thinkingRef} className={cn("overflow-y-auto rounded-md bg-muted/50 px-3 py-2 code-scrollbar", streamPhase === "thinking" ? "max-h-32" : "max-h-16")}>
                                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{thinkingText}</p>
                              </div>
                            </div>
                          )}
                          {contentText && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">{streamPhase === "writing" ? "Writing..." : "Finalizing..."}</p>
                              <div ref={contentRef} className="max-h-32 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 code-scrollbar">
                                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{contentText}</p>
                              </div>
                            </div>
                          )}
                          <div ref={streamEndRef} />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

          {/* Footer navigation */}
          <div className="border-t bg-card px-8 py-5 flex items-center justify-between shrink-0 mt-auto absolute bottom-0 left-0 right-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
            {currentStep !== STEP_REVIEW ? (
              <Button
                variant="ghost"
                size="lg"
                className="font-bold"
                onClick={() => {
                  if (currentStep === 1) {
                    onBack();
                  } else if (currentStep === STEP_AVATAR) {
                    setCurrentStep(mode === "manual" ? STEP_CONFIGURE : STEP_INPUT);
                  } else if (currentStep === STEP_GENERATE) {
                    if (showAvatarStep) {
                      setCurrentStep(STEP_AVATAR);
                    } else {
                      setCurrentStep(STEP_INPUT);
                    }
                  } else {
                    setCurrentStep((s) => Math.max(1, s - 1));
                  }
                }}
                disabled={generating}
              >
                Back
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {currentStep < STEP_GENERATE && (
                <Button
                  onClick={() => {
                    if (currentStep === STEP_CONFIGURE) {
                      if (mode === "manual") {
                        if (!result) {
                          const isChat = format === "video";
                          const isVoice = format === "video" || format === "voice";
                          const isVideo = format === "video";
                          setResult({
                            title: title || "New Manual Interview",
                            description,
                            objective,
                            assessmentCriteria: editableCriteria.length ? editableCriteria : [{ name: "Communication Skills", description: "Measures clarity and vocabulary." }],
                            questions: editableQuestions.length ? editableQuestions : [{ order: 1, text: "Click edit to type your manual question here...", type: "OPEN_ENDED", description: "", isRequired: true }],
                            estimatedDurationMinutes: parseInt(duration) || 20,
                            recommendedSettings: {
                              mode: isChat && isVoice ? "HYBRID" : isVoice ? "VOICE" : "CHAT",
                              chatEnabled: isChat,
                              voiceEnabled: isVoice,
                              videoEnabled: isVideo,
                              followUpDepth,
                              aiTone,
                              aiName: INTERVIEWER_NAME,
                            }
                          });
                        }
                        setCurrentStep(showAvatarStep ? STEP_AVATAR : STEP_REVIEW);
                      } else {
                        setCurrentStep(STEP_INPUT);
                      }
                    } else if (currentStep === STEP_INPUT) {
                      setCurrentStep(showAvatarStep ? STEP_AVATAR : STEP_GENERATE);
                    } else if (currentStep === STEP_AVATAR) {
                      if (mode === "manual") {
                        setCurrentStep(STEP_REVIEW);
                      } else {
                        setCurrentStep(STEP_GENERATE);
                      }
                    } else {
                      setCurrentStep((s) => s + 1);
                    }
                  }}
                  disabled={
                    currentStep === STEP_INPUT && (
                      ((mode === "ai" || mode === "coding") && !description.trim()) ||
                      (mode === "template" && !selectedTemplateId) ||
                      (mode === "manual" && !title.trim())
                    )
                  }
                  className="bg-primary hover:bg-primary/90 rounded-full px-6 shadow-md shadow-primary/20"
                >
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              {currentStep === STEP_GENERATE && !generating && !result && (
                <Button
                  onClick={handleGenerate}
                  disabled={!description.trim()}
                  className="bg-primary hover:bg-primary/90 rounded-full px-6 shadow-md shadow-primary/20"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Interview
                </Button>
              )}
              {currentStep === STEP_GENERATE && generating && (
                <Button disabled className="rounded-full px-6">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </Button>
              )}
              {currentStep === STEP_REVIEW && (
                <Button
                  data-tour="accept-create"
                  onClick={handleAccept}
                  disabled={saving || (mode !== "manual" && mode !== "template" && editableQuestions.length === 0)}
                  className="bg-primary hover:bg-primary/90 rounded-full px-6 shadow-md shadow-primary/20"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  {saving ? "Saving..." : "Accept & Create"}
                </Button>
              )}
              <AlertDialog open={showCodeEditorConfirm} onOpenChange={setShowCodeEditorConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Enable Code Editor?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This interview includes one or more coding questions, but the Code Editor is currently turned off. Candidates won&apos;t be able to write code for those questions unless it&apos;s enabled. Do you want to enable the Code Editor before creating this interview?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      onClick={() => {
                        setShowCodeEditorConfirm(false);
                        void proceedWithAccept();
                      }}
                    >
                      Continue Without It
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setCodeEnabled(true);
                        setShowCodeEditorConfirm(false);
                        void proceedWithAccept();
                      }}
                    >
                      Enable Code Editor
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  Import Dialog (local-state variant for Create Interview)           */
/* ------------------------------------------------------------------ */

function ImportDialog({
  open,
  onOpenChange,
  onImport,
  existingTexts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (questions: GeneratedQuestion[]) => void;
  existingTexts: string[];
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allQuestions = trpc.question.listAll.useQuery(
    { limit: 200 },
    { enabled: open },
  );

  const existing = useMemo(
    () => new Set(existingTexts.map((t) => t.toLowerCase())),
    [existingTexts],
  );

  const filteredQuestions = useMemo(() => {
    let result = (allQuestions.data?.questions ?? []).filter(
      (q) => !existing.has(q.text.toLowerCase()),
    );
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (q) =>
          q.text.toLowerCase().includes(s) ||
          (q.description ?? "").toLowerCase().includes(s) ||
          q.interview.title.toLowerCase().includes(s),
      );
    }
    return result;
  }, [allQuestions.data, existing, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    const selected = filteredQuestions.filter((q) => selectedIds.has(q.id));
    const mapped: GeneratedQuestion[] = selected.map((q) => ({
      order: 0,
      text: q.text,
      type: q.type as GeneratedQuestion["type"],
      description: q.description ?? "",
      isRequired: true,
      options: q.options as GeneratedQuestion["options"],
      starterCode: q.starterCode as GeneratedQuestion["starterCode"],
    }));
    onImport(mapped);
    setSelectedIds(new Set());
    setSearch("");
    onOpenChange(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSelectedIds(new Set());
      setSearch("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Existing Questions</DialogTitle>
          <DialogDescription>
            Select questions from your existing interviews to add here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-lg border code-scrollbar">
            {allQuestions.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredQuestions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search.trim()
                  ? "No questions match your search."
                  : "No questions available to import."}
              </p>
            ) : (
              <div className="divide-y">
                {filteredQuestions.map((q) => {
                  const style =
                    QUESTION_TYPE_STYLES[q.type] ??
                    QUESTION_TYPE_STYLES.OPEN_ENDED;
                  const TypeIcon = style.icon;
                  return (
                    <label
                      key={q.id}
                      className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedIds.has(q.id)}
                        onCheckedChange={() => toggleSelect(q.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">
                          {q.text}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", style.badgeClass)}
                          >
                            <TypeIcon className="mr-0.5 h-2.5 w-2.5" />
                            {style.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {q.interview.title}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedIds.size === 0}
          >
            <Copy className="mr-2 h-4 w-4" />
            Import ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
