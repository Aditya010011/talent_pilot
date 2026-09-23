"use client";

import { AIGenerator } from "@/components/interview/ai-generator";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";
import { DEFAULT_CREDIT_RATES, type InterviewCreditType } from "@/lib/interview-credits";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
  Check,
  Search,
  Sparkles,
  Video,
  ArrowRight,
  Briefcase,
  User,
  Coins,
  ChevronLeft,
  ChevronDown,
  X,
  PenLine,
  FileText,
  Plus,
  Code2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardPhase = "language" | "mode" | "template" | "format" | "generator";
type InterviewMode = "ai" | "template" | "manual" | "coding";
type InterviewFormat = /* "premium" | */ "video" | "voice" | "noninteractive";
type AvatarMode = "none" | "static" | "simli" | "vidu";

interface FormatOption {
  id: InterviewFormat;
  icon: React.ReactNode;
  label: string;
  description: string;
  features: string[];
  goodFitFor?: string;
  creditCost: number;
  chatEnabled: boolean;
  voiceEnabled: boolean;
  videoEnabled: boolean;
  avatarMode: AvatarMode;
  isVoiceOnly?: boolean;
}

export interface SelectedJobTemplate {
  id: string;
  title: string;
  jobType: string;
  jobDescription: string;
  scoringRubric?: unknown;
}

const FORMAT_OPTIONS: FormatOption[] = [
  // Premium / Vidu S1 Live temporarily disabled (boss request).
  // {
  //   id: "premium",
  //   icon: <Sparkles className="h-6 w-6" />,
  //   label: "Premium (Vidu S1)",
  //   description: "Highest-quality real-time AI video interviewer powered by Vidu S1",
  //   features: ["Vidu S1 realtime avatar", "Live conversation", "Candidate recording", "Face emotion analysis"],
  //   creditCost: 10,
  //   chatEnabled: true,
  //   voiceEnabled: true,
  //   videoEnabled: true,
  //   avatarMode: "vidu",
  //   isVoiceOnly: false,
  // },
  // Default 5 credits / 15 minutes per type (SYSTEM_ADMIN can change in Project Settings).
  {
    id: "video",
    icon: <Video className="h-6 w-6" />,
    label: "Real Time",
    description: "Fully interactive video AI that engages candidates naturally in real time",
    features: [
      "Real time speaking avatar",
      "Automated follow up questions",
      "Candidate video recording",
      "Risk assessment"
    ],
    goodFitFor: "Best experience with Real Time",
    creditCost: 5,
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    avatarMode: "simli",
    isVoiceOnly: false,
  },
  {
    id: "noninteractive",
    icon: <Briefcase className="h-6 w-6" />,
    label: "Non-Interactive",
    description: "A structured interview using pre-recorded videos without dynamic follow-ups.",
    features: [
      "Pre-generated video clips",
      "Fixed question sequence",
      "Strictly follows the script",
      "No follow-up questions",
      "Candidate video recording",
      "Risk assessment"
    ],
    goodFitFor: "Pre-recorded Avatar video with longer duration",
    creditCost: 5,
    chatEnabled: false,
    voiceEnabled: true,
    videoEnabled: true,
    avatarMode: "simli",
    isVoiceOnly: true,
  },
  {
    id: "voice",
    icon: <User className="h-6 w-6" />,
    label: "Voice Only",
    description: "Conduct natural voice-based interviews with real-time AI guidance, and a static avatar photo",
    features: [
      "Live conversational voice AI",
      "Standard scripted question format",
      "Candidate video recording",
      "Economical pricing at a lower credit cost",
      "Risk assessment"
    ],
    goodFitFor: "High volume, longer duration",
    creditCost: 5,
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    avatarMode: "none",
    isVoiceOnly: false,
  },
];

const PHASE_ORDER_DEFAULT: WizardPhase[] = ["language", "mode", "format", "generator"];
const PHASE_ORDER_TEMPLATE: WizardPhase[] = ["language", "mode", "template", "format", "generator"];

function creditTypeForFormat(id: InterviewFormat): InterviewCreditType {
  if (id === "video") return "realtime_avatar";
  if (id === "voice") return "voice_only";
  return "non_interactive";
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function getFlagIcon(code: string): JSX.Element {
  const map: Record<string, boolean> = {
    ar: true, bg: true, yue: true, zh: true, hr: true, cs: true,
    da: true, nl: true, en: true, fil: true, fi: true, fr: true,
    de: true, el: true, hi: true, hu: true, id: true, it: true,
    ja: true, ko: true, ms: true, nb: true, pl: true, pt: true,
    "pt-BR": true, ro: true, ru: true, sk: true, es: true, sv: true,
    ta: true, th: true, tr: true, uk: true, vi: true,
  };
  const file = map[code] ? code : "fallback";
  return <img src={`/flags/${file}.svg`} alt={`${code} flag`} className="h-8 w-11 object-cover rounded shadow-sm shrink-0" />;
}

// ─── Main Dialog Component ─────────────────────────────────────────────────────

interface NewInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
}

export function NewInterviewDialog({ open, onOpenChange, projectId }: NewInterviewDialogProps) {
  const [phase, setPhase] = useState<WizardPhase>("language");
  const [selectedLang, setSelectedLang] = useState("en");
  const [langSearch, setLangSearch] = useState("");
  const [selectedMode, setSelectedMode] = useState<InterviewMode | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<FormatOption | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedJobTemplate | null>(null);
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [openAccordion, setOpenAccordion] = useState<"jd" | "rubric" | "questions" | null>(null);

  const phaseOrder = selectedMode === "template" ? PHASE_ORDER_TEMPLATE : PHASE_ORDER_DEFAULT;
  const phaseIndex = Math.max(0, phaseOrder.indexOf(phase));
  const totalSteps = 8;
  // Progress before generator maps across language/mode/(template)/format
  const preGeneratorCount = phaseOrder.length - 1;
  const progressStep = phase === "generator" ? preGeneratorCount : phaseIndex + 1;

  const { data: dbTemplates } = trpc.jobTemplate.list.useQuery(undefined, {
    enabled: open && selectedMode === "template",
  });
  const { data: creditRates } = trpc.creditRates.list.useQuery(undefined, {
    enabled: open,
  });

  const filteredTemplates = useMemo(() => {
    if (!dbTemplates) return [];
    if (!templateSearchQuery.trim()) return dbTemplates;
    const query = templateSearchQuery.toLowerCase();
    return dbTemplates.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.jobType.toLowerCase().includes(query) ||
        t.jobDescription.toLowerCase().includes(query),
    );
  }, [dbTemplates, templateSearchQuery]);

  const resetWizard = useCallback(() => {
    setPhase("language");
    setSelectedLang("en");
    setLangSearch("");
    setSelectedMode(null);
    setSelectedFormat(null);
    setSelectedTemplate(null);
    setTemplateSearchQuery("");
    setOpenAccordion(null);
  }, []);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) resetWizard();
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetWizard],
  );

  const goNext = useCallback(() => {
    const idx = phaseOrder.indexOf(phase);
    if (idx < 0 || idx >= phaseOrder.length - 1) return;
    setPhase(phaseOrder[idx + 1]);
  }, [phase, phaseOrder]);

  const goBack = useCallback(() => {
    const idx = phaseOrder.indexOf(phase);
    if (idx <= 0) {
      handleClose(false);
      return;
    }
    setPhase(phaseOrder[idx - 1]);
  }, [phase, phaseOrder, handleClose]);

  const filteredLanguages = useMemo(() => {
    const q = langSearch.toLowerCase().trim();
    if (!q) return SUPPORTED_LANGUAGES;
    return SUPPORTED_LANGUAGES.filter(
      (l) => l.label.toLowerCase().includes(q) || l.nativeLabel.toLowerCase().includes(q),
    );
  }, [langSearch]);

  const canContinue =
    phase === "language"
      ? !!selectedLang
      : phase === "mode"
        ? !!selectedMode
        : phase === "template"
          ? !!selectedTemplate
          : phase === "format"
            ? !!selectedFormat
            : false;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[1400px] w-[95vw] h-[95vh] max-h-[1000px] p-0 gap-0 overflow-hidden flex flex-col [&>button]:hidden bg-background">
        <DialogTitle className="sr-only">Create New Interview</DialogTitle>
        <DialogDescription className="sr-only">Follow the wizard steps to set up a new interview.</DialogDescription>

        {phase !== "generator" && (
          <div className="absolute top-0 left-0 z-50 h-1 w-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${(progressStep / totalSteps) * 100}%` }}
            />
          </div>
        )}

        <div className="z-20 flex h-16 shrink-0 items-center justify-between px-4">
          {phase !== "generator" ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={goBack}
              className="rounded-full hover:bg-muted"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : (
            <div className="w-9" />
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleClose(false)}
            className="ml-auto rounded-full transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative flex w-full flex-1 flex-col overflow-hidden">
          {phase !== "generator" ? (
            <>
              {/* ── Language ── */}
              {phase === "language" && (
                <div className="absolute inset-0 flex flex-col overflow-hidden px-10 pb-24 pt-4">
                  <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col space-y-2.5">
                    <div className="shrink-0 text-center">
                      <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                        Select Interview Language
                      </h2>
                      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground sm:text-sm">
                        Choose the primary language for this interview. The AI will speak, understand, and evaluate in this language.
                      </p>
                    </div>
                    <div className="relative mx-auto w-full max-w-sm shrink-0">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search languages..."
                        value={langSearch}
                        onChange={(e) => setLangSearch(e.target.value)}
                        className="h-9 rounded-xl border-border/80 bg-muted/30 pl-9"
                      />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col text-left">
                      <p className="mb-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {filteredLanguages.length} language{filteredLanguages.length !== 1 ? "s" : ""} available
                      </p>
                      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-0.5">
                        <div className="grid h-full min-h-0 grid-cols-2 gap-2.5 p-1 sm:grid-cols-3 md:grid-cols-7 md:[grid-template-rows:repeat(5,minmax(0,1fr))]">
                          {filteredLanguages.map((lang) => (
                            <button
                              key={lang.code}
                              type="button"
                              onClick={() => setSelectedLang(lang.code)}
                              className={`relative flex h-full min-h-[4.75rem] flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all duration-200 ${
                                selectedLang === lang.code
                                  ? "border-primary bg-primary/10 shadow-sm ring-2 ring-inset ring-primary/20"
                                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/50"
                              }`}
                            >
                              <div className="shrink-0 flex items-center justify-center">{getFlagIcon(lang.code)}</div>
                              <div className="w-full min-w-0 px-0.5">
                                <p className="truncate text-sm font-bold leading-tight text-foreground">{lang.label}</p>
                                <p className="truncate text-xs leading-tight text-muted-foreground">{lang.nativeLabel}</p>
                              </div>
                              {selectedLang === lang.code && (
                                <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary shadow-sm">
                                  <Check className="h-3 w-3 stroke-[3] text-primary-foreground" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Mode ── */}
              {phase === "mode" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-scroll px-10 pb-24 pt-10">
                  <div className="w-full max-w-4xl space-y-8 text-center">
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                        How would you like to build it?
                      </h2>
                      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        Generate questions dynamically using AI, use a template, or build manually.
                      </p>
                    </div>
                    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 max-w-4xl mx-auto">
                      {(["ai", "template", "manual", "coding"] as const).map((m) => {
                        const isSelected = selectedMode === m;
                        const colors = {
                          ai: {
                            border: isSelected
                              ? "border-blue-500 bg-blue-500/5 shadow-blue-500/10 ring-2 ring-blue-500/20"
                              : "border-border bg-card hover:border-blue-500/40 hover:bg-blue-50/50 dark:hover:bg-blue-950/20",
                            iconBg: isSelected
                              ? "bg-gradient-to-br from-blue-500/20 to-indigo-500/20"
                              : "bg-muted group-hover:bg-gradient-to-br group-hover:from-blue-500/10 group-hover:to-indigo-500/10",
                            iconColor: isSelected
                              ? "text-blue-600 scale-110"
                              : "text-muted-foreground group-hover:text-blue-500",
                          },
                          template: {
                            border: isSelected
                              ? "border-emerald-500 bg-emerald-500/5 shadow-emerald-500/10 ring-2 ring-emerald-500/20"
                              : "border-border bg-card hover:border-emerald-500/40 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
                            iconBg: isSelected
                              ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/20"
                              : "bg-muted group-hover:bg-gradient-to-br group-hover:from-emerald-500/10 group-hover:to-teal-500/10",
                            iconColor: isSelected
                              ? "text-emerald-600 scale-110"
                              : "text-muted-foreground group-hover:text-emerald-500",
                          },
                          manual: {
                            border: isSelected
                              ? "border-amber-500 bg-amber-500/5 shadow-amber-500/10 ring-2 ring-amber-500/20"
                              : "border-border bg-card hover:border-amber-500/40 hover:bg-amber-50/50 dark:hover:bg-amber-950/20",
                            iconBg: isSelected
                              ? "bg-gradient-to-br from-amber-500/20 to-orange-500/20"
                              : "bg-muted group-hover:bg-gradient-to-br group-hover:from-amber-500/10 group-hover:to-orange-500/10",
                            iconColor: isSelected
                              ? "text-amber-600 scale-110"
                              : "text-muted-foreground group-hover:text-amber-500",
                          },
                          coding: {
                            border: isSelected
                              ? "border-purple-500 bg-purple-500/5 shadow-purple-500/10 ring-2 ring-purple-500/20"
                              : "border-border bg-card hover:border-purple-500/40 hover:bg-purple-50/50 dark:hover:bg-purple-950/20",
                            iconBg: isSelected
                              ? "bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20"
                              : "bg-muted group-hover:bg-gradient-to-br group-hover:from-purple-500/10 group-hover:to-fuchsia-500/10",
                            iconColor: isSelected
                              ? "text-purple-600 scale-110"
                              : "text-muted-foreground group-hover:text-purple-500",
                          },
                        };
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setSelectedMode(m);
                              if (m !== "template") setSelectedTemplate(null);
                            }}
                            className={`group flex flex-col items-center gap-5 rounded-2xl border-2 p-8 text-center transition-all duration-300 ${colors[m].border} ${
                              isSelected ? "scale-[1.02]" : "hover:scale-[1.01]"
                            }`}
                          >
                            <div
                              className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all ${colors[m].iconBg}`}
                            >
                              {m === "ai" && <Sparkles className={`h-8 w-8 transition-all ${colors[m].iconColor}`} />}
                              {m === "template" && (
                                <Briefcase className={`h-8 w-8 transition-all ${colors[m].iconColor}`} />
                              )}
                              {m === "manual" && (
                                <PenLine className={`h-8 w-8 transition-all ${colors[m].iconColor}`} />
                              )}
                              {m === "coding" && (
                                <Code2 className={`h-8 w-8 transition-all ${colors[m].iconColor}`} />
                              )}
                            </div>
                            <div className="mt-2 space-y-3">
                              <h3 className="text-xl font-bold text-foreground">
                                {m === "ai"
                                  ? "AI Assisted Generator"
                                  : m === "template"
                                    ? "Job Templates"
                                    : m === "manual"
                                      ? "Manual Creation"
                                      : "Coding Interview"}
                              </h3>
                              <p className="text-sm leading-relaxed text-muted-foreground">
                                {m === "ai" &&
                                  "Provide a job description or prompt and let our advanced LLMs craft structured questions and grading rubrics instantly."}
                                {m === "template" &&
                                  "Select from pre-defined job types. The AI will customize questions specifically for the selected role."}
                                {m === "manual" &&
                                  "Build from the ground up. Write your own questions, define custom evaluation parameters, and configure tools yourself."}
                                {m === "coding" &&
                                  "Design a customized technical assessment. Specify target coding and behavioral question counts and sandbox parameters."}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Template (immediately after mode when Job Templates selected) ── */}
              {phase === "template" && (
                <div className="absolute inset-0 overflow-y-scroll px-10 pb-24 pt-6">
                  <div className="mx-auto flex w-full max-w-4xl flex-col">
                    <div className="sticky top-0 z-10 space-y-6 bg-background/95 pb-6 backdrop-blur">
                      <div className="space-y-2 text-center">
                        <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                          Select Job Template
                        </h2>
                        <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground">
                          Choose a job template below. The AI will customize structured questions and assessment
                          criteria for the selected role.
                        </p>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search templates..."
                          value={templateSearchQuery}
                          onChange={(e) => setTemplateSearchQuery(e.target.value)}
                          className="rounded-xl border-border/80 bg-muted/20 pl-9"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 items-start gap-4 p-1 pb-10 text-left">
                      {filteredTemplates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center space-y-2 py-12 text-center text-muted-foreground">
                          <FileText className="h-8 w-8 text-muted-foreground/40" />
                          <p className="text-xs">No matching templates found.</p>
                        </div>
                      ) : (
                        filteredTemplates.map((t) => {
                          const isSelected = selectedTemplate?.id === t.id;
                          return (
                            <div
                              key={t.id}
                              className={cn(
                                "cursor-pointer rounded-2xl border bg-card p-4 transition-all hover:border-primary/50",
                                isSelected
                                  ? "border-green-600 bg-green-500/[0.02] ring-2 ring-inset ring-green-600/30"
                                  : "border-border/80",
                              )}
                              onClick={() => {
                                setSelectedTemplate({
                                  id: t.id,
                                  title: t.title,
                                  jobType: t.jobType,
                                  jobDescription: t.jobDescription,
                                  scoringRubric: Array.isArray(t.scoringRubric)
                                    ? structuredClone(t.scoringRubric)
                                    : [],
                                });
                                setOpenAccordion(null);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3.5">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60">
                                    <FileText className="h-5 w-5 text-muted-foreground/80" />
                                  </div>
                                  <div>
                                    <h4
                                      className={cn(
                                        "text-lg font-bold transition-colors",
                                        isSelected ? "text-green-700 dark:text-green-400" : "text-foreground",
                                      )}
                                    >
                                      {t.title}
                                    </h4>
                                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                      {t.jobType}
                                    </p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white">
                                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                                  </div>
                                )}
                              </div>

                              {isSelected && selectedTemplate && (
                                <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                                  <div>
                                    <h5 className="mb-2 text-xs font-bold text-foreground">Description</h5>
                                    <Textarea
                                      className="min-h-[80px] text-xs leading-relaxed text-muted-foreground"
                                      value={selectedTemplate.jobDescription}
                                      onChange={(e) =>
                                        setSelectedTemplate((prev) =>
                                          prev ? { ...prev, jobDescription: e.target.value } : prev,
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>

                                  <div className="mt-4 w-full space-y-2 text-left">
                                    <div className="overflow-hidden rounded-xl border bg-background/50">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenAccordion(openAccordion === "rubric" ? null : "rubric");
                                        }}
                                        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-muted/30"
                                      >
                                        <span>Scoring rubric</span>
                                        <ChevronDown
                                          className={cn(
                                            "h-4 w-4 text-muted-foreground transition-transform",
                                            openAccordion === "rubric" && "rotate-180",
                                          )}
                                        />
                                      </button>
                                      {openAccordion === "rubric" && (
                                        <div className="space-y-2 border-t bg-muted/10 px-4 pb-3.5 pt-3 text-xs leading-relaxed text-muted-foreground">
                                          {Array.isArray(selectedTemplate.scoringRubric) &&
                                          selectedTemplate.scoringRubric.length > 0 ? (
                                            <div className="space-y-3">
                                              {(
                                                selectedTemplate.scoringRubric as {
                                                  name: string;
                                                  description: string;
                                                }[]
                                              ).map((r, i) => (
                                                <div key={i} className="flex flex-col gap-1">
                                                  <Input
                                                    className="h-7 bg-background text-xs font-bold"
                                                    value={r.name}
                                                    onChange={(e) => {
                                                      setSelectedTemplate((prev) => {
                                                        if (!prev || !Array.isArray(prev.scoringRubric)) return prev;
                                                        const next = structuredClone(
                                                          prev.scoringRubric,
                                                        ) as { name: string; description: string }[];
                                                        next[i] = { ...next[i], name: e.target.value };
                                                        return { ...prev, scoringRubric: next };
                                                      });
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                  />
                                                  <Textarea
                                                    className="h-14 bg-background text-xs"
                                                    value={r.description}
                                                    onChange={(e) => {
                                                      setSelectedTemplate((prev) => {
                                                        if (!prev || !Array.isArray(prev.scoringRubric)) return prev;
                                                        const next = structuredClone(
                                                          prev.scoringRubric,
                                                        ) as { name: string; description: string }[];
                                                        next[i] = {
                                                          ...next[i],
                                                          description: e.target.value,
                                                        };
                                                        return { ...prev, scoringRubric: next };
                                                      });
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                  />
                                                </div>
                                              ))}
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 w-full border-dashed text-[10px]"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedTemplate((prev) => {
                                                    if (!prev) return prev;
                                                    const current = Array.isArray(prev.scoringRubric)
                                                      ? ([...prev.scoringRubric] as {
                                                          name: string;
                                                          description: string;
                                                        }[])
                                                      : [];
                                                    return {
                                                      ...prev,
                                                      scoringRubric: [
                                                        ...current,
                                                        { name: "", description: "" },
                                                      ],
                                                    };
                                                  });
                                                }}
                                              >
                                                <Plus className="mr-1 h-3 w-3" /> Add Criterion
                                              </Button>
                                            </div>
                                          ) : (
                                            "A custom evaluation rubric will be generated automatically by AI based on the job requirements."
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div className="overflow-hidden rounded-xl border bg-background/50">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenAccordion(
                                            openAccordion === "questions" ? null : "questions",
                                          );
                                        }}
                                        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-muted/30"
                                      >
                                        <span>Interview questions (AI Generated)</span>
                                        <ChevronDown
                                          className={cn(
                                            "h-4 w-4 text-muted-foreground transition-transform",
                                            openAccordion === "questions" && "rotate-180",
                                          )}
                                        />
                                      </button>
                                      {openAccordion === "questions" && (
                                        <div className="space-y-2 border-t bg-muted/10 px-4 pb-3.5 pt-3 text-xs leading-relaxed text-muted-foreground">
                                          AI will compose structural behavioral and technical questions
                                          dynamically matching the selected duration and job description.
                                        </div>
                                      )}
                                    </div>

                                    <div className="overflow-hidden rounded-xl border bg-background/50">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenAccordion(openAccordion === "jd" ? null : "jd");
                                        }}
                                        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-muted/30"
                                      >
                                        <span>Job description</span>
                                        <ChevronDown
                                          className={cn(
                                            "h-4 w-4 text-muted-foreground transition-transform",
                                            openAccordion === "jd" && "rotate-180",
                                          )}
                                        />
                                      </button>
                                      {openAccordion === "jd" && (
                                        <div className="border-t bg-muted/10 px-4 pb-3.5 pt-3 text-xs leading-relaxed text-muted-foreground">
                                          <textarea
                                            className="min-h-[120px] w-full resize-y rounded-md border border-input bg-transparent p-2 focus:outline-none focus:ring-1 focus:ring-primary"
                                            value={selectedTemplate.jobDescription}
                                            onChange={(e) =>
                                              setSelectedTemplate((prev) =>
                                                prev
                                                  ? { ...prev, jobDescription: e.target.value }
                                                  : prev,
                                              )
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="Edit job description to add specific years of experience or requirements..."
                                          />
                                          <p className="mt-2 text-[10px] text-muted-foreground">
                                            Feel free to append years of experience or specific requirements
                                            before proceeding.
                                          </p>
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
                </div>
              )}

              {/* ── Format ── */}
              {phase === "format" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-scroll px-10 pb-24 pt-10">
                  <div className="w-full max-w-7xl space-y-8 text-center">
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                        Select Interview Format
                      </h2>
                      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        Choose the experience you want candidates to have. Each format is billed in duration blocks, rounded up.
                      </p>
                    </div>
                    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
                      {FORMAT_OPTIONS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setSelectedFormat(f)}
                          className={`group flex h-full flex-col overflow-hidden rounded-2xl border-2 transition-all duration-300 ${
                            selectedFormat?.id === f.id
                              ? "scale-[1.02] border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20"
                              : "border-border bg-card hover:scale-[1.01] hover:border-primary/40 hover:bg-muted/50"
                          }`}
                        >
                          <div className="relative aspect-[16/10] w-full overflow-hidden border-b bg-muted">
                            <img
                              src={
                                f.id === "voice"
                                  ? "/voice.png"
                                  : f.id === "noninteractive"
                                  ? "/noninteractive.png"
                                  : "/video.png"
                              }
                              alt={f.label}
                              className="absolute inset-0 h-full w-full object-contain opacity-90 transition-all duration-700 group-hover:scale-[1.03] group-hover:opacity-100"
                            />
                          </div>
                          <div className="flex w-full flex-1 flex-col p-5 text-left">
                            {/* Top block grows so Good-fit section aligns across equal-height cards */}
                            <div className="flex flex-1 flex-col">
                              <div className="mb-4 flex items-start justify-between">
                                <div
                                  className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border transition-all ${
                                    selectedFormat?.id === f.id
                                      ? "border-primary/30 bg-primary/10"
                                      : "border-border bg-muted/50 group-hover:border-primary/20"
                                  }`}
                                >
                                  <div
                                    className={`transition-all ${
                                      selectedFormat?.id === f.id
                                        ? "scale-110 text-primary"
                                        : "text-muted-foreground group-hover:text-primary"
                                    }`}
                                  >
                                    {f.icon}
                                  </div>
                                </div>
                                <div
                                  className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold border-blue-500/30 bg-blue-500/10 text-blue-600 whitespace-nowrap"
                                >
                                  <Coins className="h-3 w-3 shrink-0" />
                                  <span>
                                    {(() => {
                                      const rate =
                                        creditRates?.[creditTypeForFormat(f.id)] ??
                                        DEFAULT_CREDIT_RATES[creditTypeForFormat(f.id)];
                                      if (rate.credits <= 0) return "Free";
                                      return `${rate.credits} credits / ${rate.minutes} mins`;
                                    })()}
                                  </span>
                                </div>
                              </div>
                              <h3 className="mb-2 text-lg font-bold text-foreground">{f.label}</h3>
                              <div className="mb-6 h-[80px] overflow-hidden">
                                <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
                              </div>
                              <ul className="w-full space-y-3 border-t border-dashed pt-4">
                                {f.features.map((feature, i) => (
                                  <li
                                    key={i}
                                    className="flex items-center text-xs font-medium text-muted-foreground/90"
                                  >
                                    <Check className="mr-2.5 h-4 w-4 shrink-0 text-primary" />
                                    {feature}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            {f.goodFitFor && (
                              <div className="mt-4 w-full border-t border-dashed pt-3 text-left">
                                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                                  Good fit for
                                </span>
                                <span className="text-xs font-semibold text-foreground">
                                  {f.goodFitFor}
                                </span>
                              </div>
                            )}
                            {selectedFormat?.id === f.id && (
                              <div className="mt-3 w-full border-t border-primary/20 pt-3">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                                  Selected ✓
                                </span>
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 z-20 mt-auto flex shrink-0 items-center justify-between border-t bg-card px-8 py-5 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
                {phase !== "language" ? (
                  <Button
                    variant="ghost"
                    size="lg"
                    className="font-bold"
                    onClick={goBack}
                  >
                    Back
                  </Button>
                ) : (
                  <div />
                )}
                <Button
                  size="lg"
                  className="rounded-full px-8 font-bold"
                  onClick={goNext}
                  disabled={!canContinue}
                >
                  Next <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </>
          ) : (
            <AIGenerator
              projectId={projectId}
              defaultLanguage={selectedLang}
              mode={selectedMode!}
              format={selectedFormat!.id as "video" | "voice" | "noninteractive"}
              avatarMode={selectedFormat!.avatarMode}
              isVoiceOnly={selectedFormat!.isVoiceOnly || false}
              initialTemplate={selectedTemplate ?? undefined}
              wizardOffset={preGeneratorCount}
              open={true}
              onOpenChange={handleClose}
              onBack={() => setPhase("format")}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
