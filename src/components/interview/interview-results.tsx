/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { CodeBlock } from "@/components/code-editor/code-block";
import { useAuth } from "@/components/auth-provider";
import { useOrg } from "@/components/org-provider";
import { SessionRow, SessionsTable } from "@/components/session/sessions-table";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  formatSessionClock,
  normalizeQaTimeline,
  resolveDisplayDurationMinutes,
  sessionSpanCrossesLocalDay,
} from "@/lib/interview-qa-timeline";
import { getSessionOverallScore } from "@/lib/session-score";
import {
  coverageToRadarScore,
  mergeCvAssessmentRubrics,
  mergeJdAlignmentProfile,
  normalizeCvCriteria,
  getDynamicCvScore,
} from "@/lib/cv-criteria";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Download,
  FileDown,
  FileText,
  GitCompareArrows,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageCircle,
  MessageSquare,
  Mic,
  Monitor,
  PenLine,
  Search,
  SmilePlus,
  Sparkles,
  StopCircle,
  Tags,
  Target,
  Trophy,
  UserCheck,
  Users,
  Video,
  Volume2,
  Check,
  AlertCircle,
  X,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  aggregateEmotions,
  HireabilityGauge,
  SimpleScoreGauge,
  Big5RadarChart,
  CommunicationToneLineChart,
  translateSentimentLabel,
  CriteriaRadarChart,
  MultiCriteriaRadarChart,
  QuestionScoresBarChart,
  getVerdict,
  StarRating,
  CvRadarChart,
  CvScoreGauge,
} from "@/components/interview/report-charts";
import { InluwaLogo } from "@/components/ui/inluwa-logo";
import { HRStandardPDFReport } from "@/components/interview/pdf-report";
import { useAppLocale } from "@/components/app-locale-provider";

function getSessionStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "COMPLETED":
      return "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-900 dark:text-green-400";
    case "IN_PROGRESS":
      return "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400";
    default:
      return "border-slate-200 text-slate-700 bg-slate-50/50 dark:border-slate-700 dark:text-slate-300 dark:bg-slate-800/50";
  }
}

function getScoreBadgeClass(score: number | null): string {
  if (score === null) {
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200";
  }
  if (score >= 7) {
    return "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-900 dark:text-green-400";
  }
  if (score >= 4) {
    return "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400";
  }
  return "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400";
}

// ─── HR Sten Score Component ──────────────────────────────────────
function StenScoreScale({ score }: { score: number }) {
  const roundedScore = Math.round(score * 10) / 10;
  
  return (
    <div className="w-full space-y-4 py-8">
      <div className="flex justify-between px-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <span className="w-1/3 text-left">Challenged</span>
        <span className="w-1/3 text-center">Sound</span>
        <span className="w-1/3 text-right">Strong</span>
      </div>
      
      <div className="relative flex h-12 w-full items-stretch overflow-hidden rounded-md border border-slate-200 bg-slate-50 shadow-inner dark:border-slate-800 dark:bg-slate-900/50">
        {[...Array(10)].map((_, i) => {
          const step = i + 1;
          const isActive = Math.floor(score) >= step;
          const isExact = Math.round(score) === step;
          
          return (
            <div 
              key={i} 
              className={cn(
                "flex-1 border-r border-slate-200 last:border-0 flex items-center justify-center text-xs font-bold transition-all dark:border-slate-800",
                isActive ? "bg-blue-600/10 text-blue-800 dark:bg-blue-400/10 dark:text-blue-400" : "text-slate-300 dark:text-slate-700"
              )}
            >
              {step}
              {isExact && (
                <div className="absolute -bottom-1 h-1.5 w-full bg-blue-600 dark:bg-blue-400 shadow-[0_-2px_8px_rgba(37,99,235,0.4)]" />
              )}
            </div>
          );
        })}
        
        {/* Floating marker for exact decimal score */}
        <div 
          className="absolute top-0 bottom-0 flex flex-col items-center justify-center transition-all duration-500"
          style={{ left: `${(score / 10) * 100}%`, transform: "translateX(-50%)" }}
        >
          <div className="z-10 flex h-10 w-12 items-center justify-center rounded border-2 border-white bg-blue-600 text-sm font-black text-white shadow-lg ring-2 ring-blue-600/20 dark:border-slate-800 dark:bg-blue-500 dark:ring-blue-500/20">
            {roundedScore}
          </div>
          <div className="h-full w-0.5 bg-blue-600/30 dark:bg-blue-400/30" />
        </div>
      </div>
      
      <div className="grid grid-cols-10 px-2">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="text-center text-[9px] font-medium text-slate-400 dark:text-slate-500">{i + 1}</div>
        ))}
      </div>
    </div>
  );
}

interface QuestionEvaluation {
  question: string;
  score: number;
  evaluation: string;
  highlights?: string[];
  improvements?: string[];
}

interface ResearchFinding {
  question: string;
  summary: string;
  keyTopics?: { topic: string; details: string }[];
  dataPoints?: string[];
}

export function InterviewResults({
  interviewId,
  initialSessionId,
  initialCandidateId,
  onBack: externalOnBack,
}: {
  interviewId: string;
  initialSessionId?: string;
  initialCandidateId?: string;
  onBack?: () => void;
}) {
  const [selectedParticipant, setSelectedParticipant] = useState<{ id: string; type: "session" | "candidate" } | null>(
    initialSessionId
      ? { id: initialSessionId, type: "session" }
      : initialCandidateId
        ? { id: initialCandidateId, type: "candidate" }
        : null
  );
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const { t } = useAppLocale();
  const utils = trpc.useUtils();

  const sessions = trpc.session.listByInterview.useQuery({
    interviewId,
    limit: 100,
  });
  const insights = trpc.analysis.getInterviewInsights.useQuery({ interviewId });

  // Ranked candidates (sorted by score desc)
  const rankedCandidates = useMemo(() => {
    const allSessions = (sessions.data?.sessions ?? []) as SessionRow[];
    return allSessions
      .filter((s) => s.status === "COMPLETED")
      .map((s) => {
        const score = getSessionOverallScore(s.insights as any);
        return { ...s, score };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [sessions.data]);

  const toggleCompareId = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev; // max 4
      return [...prev, id];
    });
  };

  if (showCompare && compareIds.length >= 2) {
    return (
      <CandidateComparison
        candidates={rankedCandidates.filter((c) => compareIds.includes(c.id))}
        onBack={() => setShowCompare(false)}
        onViewDetail={(id) => {
          setShowCompare(false);
          setSelectedParticipant({ id, type: "session" });
        }}
      />
    );
  }

  if (selectedParticipant) {
    return (
      <SessionDetail
        sessionId={selectedParticipant.type === "session" ? selectedParticipant.id : undefined}
        candidateId={selectedParticipant.type === "candidate" ? selectedParticipant.id : undefined}
        onBack={() => {
          if (externalOnBack) {
            externalOnBack();
          } else {
            setSelectedParticipant(null);
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Total Sessions</p>
              <p className="text-2xl font-bold">
                {insights.data?.totalSessions ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <UserCheck className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Participants</p>
              <p className="text-2xl font-bold">
                {insights.data?.totalParticipants ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Clock className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Avg Duration</p>
              <p className="text-2xl font-bold">
                {insights.data?.avgDurationSeconds
                  ? `${Math.round(insights.data.avgDurationSeconds / 60)}m`
                  : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Target className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Avg Score</p>
              <p className="text-2xl font-bold">
                {insights.data?.avgScore != null
                  ? `${insights.data.avgScore}/10`
                  : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <BarChart3 className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Top Themes</p>
              <p className="text-lg font-bold">
                {insights.data?.topThemes?.length ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Candidate Ranking Leaderboard */}
      {rankedCandidates.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Candidate Ranking
              </CardTitle>
              <div className="flex items-center gap-2">
                {compareIds.length >= 2 && (
                  <Button
                    size="sm"
                    onClick={() => setShowCompare(true)}
                  >
                    <GitCompareArrows className="mr-2 h-4 w-4" />
                    Compare ({compareIds.length})
                  </Button>
                )}
                {compareIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCompareIds([])}
                  >
                    <X className="mr-1 h-3 w-3" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Select 2-4 candidates to compare side-by-side
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rankedCandidates.map((candidate, idx) => {
                const isSelected = compareIds.includes(candidate.id);
                const verdict = getVerdict(candidate.score);
                const rankIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
                return (
                  <div
                    key={candidate.id}
                    className={cn(
                      "flex items-center gap-4 rounded-lg border p-3 transition-all cursor-pointer hover:bg-accent/50",
                      isSelected && "border-primary bg-primary/5 ring-1 ring-primary/30",
                    )}
                    onClick={() => toggleCompareId(candidate.id)}
                  >
                    {/* Rank */}
                    <span className="w-8 text-center text-lg font-bold">
                      {rankIcon}
                    </span>
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {candidate.participantName || "Anonymous"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {candidate.participantEmail || "-"}
                      </p>
                    </div>
                    {/* Score */}
                    <div className="flex items-center gap-3">
                      {candidate.score !== null ? (
                        <>
                          <span className={cn(
                            "text-lg font-black",
                            candidate.score >= 7 ? "text-emerald-400" :
                            candidate.score >= 4 ? "text-amber-400" :
                            "text-red-400",
                          )}>
                            {candidate.score.toFixed(1)}
                          </span>
                          <span className="text-xs text-muted-foreground">/10</span>
                          {verdict && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                verdict === "pass" && "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                                verdict === "review" && "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                                verdict === "fail" && "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300",
                              )}
                            >
                              {verdict.toUpperCase()}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">No score</span>
                      )}
                    </div>
                    {/* View detail */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedParticipant({ id: candidate.id, type: "session" });
                      }}
                    >
                      View
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions Table */}
      <SessionsTable
        sessions={(sessions.data?.sessions ?? []) as SessionRow[]}
        isLoading={sessions.isLoading}
        onSessionClick={(s) => setSelectedParticipant({ id: s.id, type: "session" })}
        onDeleteSuccess={() => {
          utils.session.listByInterview.invalidate({ interviewId });
          utils.analysis.getInterviewInsights.invalidate({ interviewId });
        }}
        emptyMessage="No sessions yet. Share the interview link to start collecting responses."
      />

      {/* Themes */}
      {insights.data?.topThemes && insights.data.topThemes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Themes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {insights.data.topThemes.map(([theme, count]) => (
                <Badge key={theme} variant="outline" className="text-sm">
                  {theme} ({count})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Candidate Comparison Component ────────────────────────────── */

function CandidateComparison({
  candidates,
  onBack,
  onViewDetail,
}: {
  candidates: (SessionRow & { score: number | null })[];
  onBack: () => void;
  onViewDetail: (id: string) => void;
}) {
  // Load detailed summaries for each candidate
  const summaries = candidates.map((c) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    trpc.analysis.getSessionSummary.useQuery({ sessionId: c.id }),
  );
  const allLoaded = summaries.every((s) => !s.isLoading);

  // Extract criteria evaluations for radar comparison
  const criteriaNames = useMemo(() => {
    if (!allLoaded) return [];
    const names = new Set<string>();
    for (const s of summaries) {
      const ins = s.data?.insights as any;
      if (ins && !Array.isArray(ins) && ins.criteriaEvaluations) {
        for (const ce of ins.criteriaEvaluations) {
          names.add(ce.name);
        }
      }
    }
    return Array.from(names);
  }, [allLoaded, summaries]);

  const COMPARE_COLORS = [
    "#ef4444", // Red
    "#facc15", // Yellow
    "#22d3ee", // Cyan
    "#8b5cf6", // Violet
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h2 className="text-xl font-bold">Candidate Comparison</h2>
        </div>
        <Badge variant="secondary">{candidates.length} candidates</Badge>
      </div>

      {!allLoaded ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="mr-3 h-6 w-6 animate-spin text-primary" />
            <span>Loading candidate data...</span>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Competitive Radar Comparison */}
          {criteriaNames.length > 0 && (
            <Card className="overflow-hidden border-none shadow-xl bg-gradient-to-br from-indigo-50/30 to-white dark:from-indigo-950/10 dark:to-slate-900">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2">
                  <GitCompareArrows className="h-4 w-4 text-primary" />
                  Competency Benchmarking
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-4">
                <MultiCriteriaRadarChart
                  criteriaNames={criteriaNames}
                  candidatesData={candidates.map((c, i) => {
                    const s = summaries[i].data;
                    const ins = s?.insights as any;
                    const scores: Record<string, number> = {};
                    ins?.criteriaEvaluations?.forEach((ce: any) => {
                      scores[ce.name] = ce.score;
                    });
                    return {
                      name: (c.participantName || "Anonymous").split(" ")[0],
                      scores,
                      color: COMPARE_COLORS[i % COMPARE_COLORS.length],
                    };
                  })}
                />
              </CardContent>
            </Card>
          )}

          {/* Overall Scores Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Score Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "grid gap-6",
                candidates.length === 2 ? "md:grid-cols-2" :
                candidates.length === 3 ? "md:grid-cols-3" :
                "md:grid-cols-4",
              )}>
                {candidates.map((c, i) => (
                  <div key={c.id} className="group flex flex-col items-center gap-4 rounded-xl border border-slate-100 dark:border-slate-800 p-6 transition-all hover:shadow-lg hover:border-primary/20 bg-white dark:bg-slate-900/50">
                    <div
                      className="h-1.5 w-12 rounded-full mb-2"
                      style={{ backgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length] }}
                    />
                    <div className="text-center">
                      <p className="font-bold text-base truncate w-full">
                        {c.participantName || "Anonymous"}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{c.participantEmail?.split('@')[0]}</p>
                    </div>
                    {c.score !== null ? (
                      <SimpleScoreGauge
                        score={c.score}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground py-8">No score</p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs font-semibold group-hover:bg-primary group-hover:text-white"
                      onClick={() => onViewDetail(c.id)}
                    >
                      Full Report
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Criteria Comparison Table */}
          {criteriaNames.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Criteria</th>
                        {candidates.map((c, i) => (
                          <th key={c.id} className="py-2 px-4 text-center font-medium" style={{ color: COMPARE_COLORS[i] }}>
                            {(c.participantName || "Anonymous").split(" ")[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {criteriaNames.map((name) => (
                        <tr key={name} className="border-b last:border-0">
                          <td className="py-2.5 pr-4 font-medium">{name}</td>
                          {candidates.map((c, i) => {
                            const ins = summaries[i].data?.insights as any;
                            const ce = ins?.criteriaEvaluations?.find((e: any) => e.name === name);
                            const score = ce?.score ?? null;
                            return (
                              <td key={c.id} className="py-2.5 px-4 text-center">
                                {score !== null ? (
                                  <span className={cn(
                                    "font-black text-base",
                                    score >= 7 ? "text-emerald-400" :
                                    score >= 4 ? "text-amber-400" :
                                    "text-red-400",
                                  )}>
                                    {score}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {/* Total row */}
                      <tr className="border-t-2 font-bold">
                        <td className="py-2.5 pr-4">Overall</td>
                        {candidates.map((c) => (
                          <td key={c.id} className="py-2.5 px-4 text-center">
                            {c.score !== null ? (
                              <span className={cn(
                                "text-lg font-black",
                                c.score >= 7 ? "text-emerald-400" :
                                c.score >= 4 ? "text-amber-400" :
                                "text-red-400",
                              )}>
                                {c.score.toFixed(1)}
                              </span>
                            ) : "-"}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-question score comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4" />
                Per-Question Scores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                // Get max questions across candidates
                const maxQ = Math.max(
                  ...summaries.map((s) => {
                    const ins = s.data?.insights as any;
                    return ins?.questionEvaluations?.length ?? 0;
                  }),
                );
                if (maxQ === 0) return <p className="text-sm text-muted-foreground">No question evaluations available.</p>;
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Question</th>
                          {candidates.map((c, i) => (
                            <th key={c.id} className="py-2 px-4 text-center font-medium" style={{ color: COMPARE_COLORS[i] }}>
                              {(c.participantName || "Anonymous").split(" ")[0]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: maxQ }, (_, qIdx) => (
                          <tr key={qIdx} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 font-medium">Q{qIdx + 1}</td>
                            {candidates.map((c, i) => {
                              const ins = summaries[i].data?.insights as any;
                              const qe = ins?.questionEvaluations?.[qIdx];
                              const score = qe?.score ?? null;
                              return (
                                <td key={c.id} className="py-2.5 px-4 text-center">
                                  {score !== null ? (
                                    <span className={cn(
                                      "font-bold",
                                      score >= 7 ? "text-emerald-600 dark:text-emerald-400" :
                                      score >= 4 ? "text-amber-600 dark:text-amber-400" :
                                      "text-red-600 dark:text-red-400",
                                    )}>
                                      {score}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Summary Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Summary Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "grid gap-4",
                candidates.length === 2 ? "md:grid-cols-2" :
                candidates.length === 3 ? "md:grid-cols-3" :
                "md:grid-cols-2",
              )}>
                {candidates.map((c, i) => (
                  <div key={c.id} className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COMPARE_COLORS[i] }} />
                      <p className="font-semibold text-sm">{c.participantName || "Anonymous"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {summaries[i].data?.summary || "No summary available."}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ReportHeader() {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
      {/* Theme Thumbnail (Top-Left) */}
      <div className="h-10 w-10 bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center shadow-md">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="20" height="20" rx="4" fill="url(#header-theme-grad-rep)"/>
          <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <defs>
            <linearGradient id="header-theme-grad-rep" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3B82F6"/>
              <stop offset="1" stopColor="#8B5CF6"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      
      {/* Inluwa logo (Top-Right) */}
      <div className="flex items-center gap-1.5">
        <InluwaLogo size={24} className="h-6" />
        <span className="text-sm font-black tracking-tight text-slate-800 uppercase ml-1">
          Inluwa
        </span>
      </div>
    </div>
  );
}

function InterviewDataOverlay({
  children,
  sessionStatus,
  generating,
  summaryFailed,
  onRetry,
}: {
  children: React.ReactNode;
  sessionStatus?: string | null;
  generating?: boolean;
  summaryFailed?: boolean;
  onRetry?: () => void;
}) {
  const isCompleted = sessionStatus === "COMPLETED";
  const showGenerating = isCompleted && (generating || !summaryFailed);
  const showFailed = isCompleted && summaryFailed && !generating;

  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="text-center space-y-2 p-6">
          {showGenerating ? (
            <>
              <Loader2 className="h-8 w-8 text-muted-foreground mx-auto animate-spin" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Generating analysis...
              </p>
              <p className="text-xs text-muted-foreground">
                AI report is being generated for this completed interview
              </p>
            </>
          ) : showFailed ? (
            <>
              <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Summary failed — retry
              </p>
              <p className="text-xs text-muted-foreground">
                Analysis did not save. You can regenerate the report.
              </p>
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 pointer-events-auto"
                  onClick={onRetry}
                >
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Regenerate
                </Button>
              )}
            </>
          ) : (
            <>
              <Clock className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Results will appear after interview completes
              </p>
              <p className="text-xs text-muted-foreground">
                Complete the interview to see detailed analysis
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionDetail({
  sessionId,
  candidateId,
  onBack,
}: {
  sessionId?: string;
  candidateId?: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const { t } = useAppLocale();
  const { currentOrg } = useOrg();
  const isViewer = currentOrg?.role === "VIEWER";
  const { profile } = useAuth();
  const summary = trpc.analysis.getSessionSummary.useQuery(
    { sessionId, candidateId },
    { enabled: !!(sessionId || candidateId) },
  );
  const [activeTab, setActiveTab] = useState<"ai_result" | "transcript" | "cv_analysis" | "hr_comments">("ai_result");
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number | null>(0);
  const [expandedCompetency, setExpandedCompetency] = useState<string | null>(null);
  const [expandedTrait, setExpandedTrait] = useState<string | null>(null);
  const [hireabilityTab, setHireabilityTab] = useState<"recommendations" | "strengths" | "gaps">("recommendations");
  // HR Comments state
  const [hrCommentText, setHrCommentText] = useState("");
  const [hrCommentScore, setHrCommentScore] = useState("");
  const [savingComment, startSavingComment] = useTransition();
  const updateCandidate = trpc.candidate.update.useMutation();
  const createCandidate = trpc.candidate.create.useMutation();
  const getCvDownloadUrl = trpc.candidate.getCvDownloadUrl.useMutation();
  const updateStatus = trpc.session.updateEvaluationStatus.useMutation();
  const updateSessionMetadata = trpc.session.updateParticipantMetadata.useMutation();
  const utils = trpc.useUtils();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingCv, setIsAnalyzingCv] = useState(false);

  // Derive the candidate record ID from the summary response
  const candidateRecordId: string | null =
    (summary.data?.candidateProfile as any)?.id ?? (summary.data as any)?.candidateId ?? candidateId ?? null;

  const handleTryAnotherCvClick = () => {
    fileInputRef.current?.click();
  };

  const handleCvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be selected again
    e.target.value = "";

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "CV file size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzingCv(true);
    const parsingToast = toast({
      title: "Analyzing CV...",
      description: "Processing resume text and matching with job description. Please wait...",
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (summary.data?.interviewId) {
        formData.append("interviewId", summary.data.interviewId);
      }
      if (currentOrg?.id) {
        formData.append("organizationId", currentOrg.id);
      }

      const res = await fetch("/api/ai/parse-resume", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to parse resume");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;

          try {
            const { token, error } = JSON.parse(payload);
            if (error) throw new Error(error);
            if (token) {
              accumulated += token;
            }
          } catch {
            // skip malformed SSE
          }
        }
      }

      const cleaned = accumulated
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      const parsedCandidate = JSON.parse(cleaned);

      if (!parsedCandidate || typeof parsedCandidate !== "object") {
        throw new Error("Invalid response format from resume service");
      }

      // Sanitize fields helper
      const sanitize = (val: any) => {
        if (!val || val === "null" || val === "N/A" || val === "None") return undefined;
        return String(val).trim();
      };

      let validEmail = sanitize(parsedCandidate.email);
      if (validEmail && !validEmail.includes("@")) {
        validEmail = undefined;
      }

      const candidateFields = {
        name: parsedCandidate.name || "Parsed Candidate",
        email: validEmail,
        phone: sanitize(parsedCandidate.phone),
        gender: sanitize(parsedCandidate.gender),
        birthday: sanitize(parsedCandidate.birthday),
        education: sanitize(parsedCandidate.education),
        school: sanitize(parsedCandidate.school),
        major: sanitize(parsedCandidate.major),
        graduationYear: parsedCandidate.graduationYear && parsedCandidate.graduationYear.toString() !== "null"
          ? Number(parsedCandidate.graduationYear)
          : undefined,
        workExperience: sanitize(parsedCandidate.workExperience),
        notes: sanitize(parsedCandidate.notes),
        cvAnalysis: parsedCandidate.cvAnalysis || null,
        sessionId: sessionId || undefined,
      };

      if (candidateRecordId) {
        // Update existing candidate profile
        await updateCandidate.mutateAsync({
          id: candidateRecordId,
          ...candidateFields,
        });
      } else if (summary.data?.interviewId) {
        // Create new candidate profile linked to this session
        await createCandidate.mutateAsync({
          interviewId: summary.data.interviewId,
          ...candidateFields,
        });
      } else {
        throw new Error("No candidate or interview ID found to link candidate profile.");
      }

      // Invalidate getSessionSummary and parent Candidates list/insights queries
      const interviewId = summary.data?.interviewId;
      await Promise.all([
        utils.analysis.getSessionSummary.invalidate({ sessionId, candidateId }),
        ...(interviewId
          ? [
              utils.candidate.list.invalidate({ interviewId }),
              utils.analysis.getInterviewInsights.invalidate({ interviewId }),
            ]
          : []),
      ]);

      toast({
        title: "Success",
        description: "CV analyzed and candidate profile updated successfully!",
      });
    } catch (err: any) {
      console.error("Failed to analyze CV:", err);
      toast({
        title: "Analysis Failed",
        description: err.message || "Failed to parse and analyze CV.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingCv(false);
    }
  };

  // Existing HR comments come from metadata
  const existingHrComments: any[] =
    (summary.data?.metadata as any)?.hrComments ?? [];

  // Auto-build author display name from logged-in user's profile
  const authorName = profile?.name || profile?.email || "HR Manager";

  const handleAddHrComment = () => {
    if (!hrCommentText.trim()) return;
    startSavingComment(async () => {
      const overall = getSessionOverallScore({
        questionEvaluations,
        criteriaEvaluations,
      });
      const scoreNum = hrCommentScore ? parseFloat(hrCommentScore) : undefined;
      const baseScore = overall || 0;
      const modifier = scoreNum || 0;
      const calculatedScore = (!isNaN(modifier) && hrCommentScore) ? Math.max(0, Math.min(10, baseScore + modifier)) : undefined;
      
      const newComment = {
        id: crypto.randomUUID(),
        author: "HR Manager",
        text: hrCommentText.trim(),
        score: calculatedScore,
        createdAt: new Date().toISOString(),
      };
      const updated = [...existingHrComments, newComment];
      try {
        if (candidateRecordId) {
          await updateCandidate.mutateAsync({
            id: candidateRecordId,
            hrComments: updated,
          });
        } else if (sessionId) {
          await updateSessionMetadata.mutateAsync({
            sessionId: sessionId!,
            participantMetadata: { hrComments: updated },
          });
        }
        setHrCommentText("");
        setHrCommentScore("");
        await utils.analysis.getSessionSummary.invalidate();
        toast({ title: "Comment saved" });
      } catch {
        toast({ title: "Failed to save comment", variant: "destructive" });
      }
    });
  };
  const completeSession = trpc.session.complete.useMutation();
  const [generating, setGenerating] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfCapture, setPdfCapture] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const [audioCanPlay, setAudioCanPlay] = useState(false);
  const [videoCanPlay, setVideoCanPlay] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportPercent, setExportPercent] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipVideoRef = useRef<HTMLVideoElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const playbackSessionStartMs = useMemo(() => {
    const firstMessageTimestamp = summary.data?.messages?.[0]?.timestamp;
    if (firstMessageTimestamp) {
      const firstMessageMs = new Date(firstMessageTimestamp).getTime();
      if (Number.isFinite(firstMessageMs)) return firstMessageMs;
    }

    const fallbackMs = new Date(summary.data?.startedAt || summary.data?.createdAt || 0).getTime();
    return Number.isFinite(fallbackMs) ? fallbackMs : 0;
  }, [summary.data?.messages, summary.data?.startedAt, summary.data?.createdAt]);

  // Sync transcript scroll with video time
  useEffect(() => {
    if (!videoRef.current || !summary.data?.messages || pdfCapture) return;
    const currentTimeMs = playbackSessionStartMs + (videoTime * 1000);

    // Find the message that matches current playback time
    const msgs = summary.data.messages.filter(
      (m: any) => m.contentType !== "WHITEBOARD" && (m.contentType as string) !== "CODE"
    );
    const activeMsg = [...msgs]
      .reverse()
      .find((m: any) => new Date(m.timestamp).getTime() <= currentTimeMs + 500);

    if (activeMsg) {
      const el = document.getElementById(`msg-${activeMsg.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [videoTime, summary.data?.messages, playbackSessionStartMs, pdfCapture]);

  const [summaryGenFailed, setSummaryGenFailed] = useState(false);

  const handleGenerateSummary = useCallback(async () => {
    setGenerating(true);
    setSummaryGenFailed(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 110_000);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, organizationId: currentOrg?.id }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to generate summary");
      }
      await summary.refetch();
      setSummaryGenFailed(false);
    } catch (err) {
      setSummaryGenFailed(true);
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "Analysis timed out. Please retry."
          : err instanceof Error
            ? err.message
            : "Failed to generate summary";
      toast({
        title: "Summary generation failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      window.clearTimeout(timeout);
      setGenerating(false);
    }
  }, [sessionId, summary, currentOrg?.id, toast]);

  const handleRequestReport = useCallback(() => {
    if (summary.data?.status === "IN_PROGRESS") {
      setShowEndConfirm(true);
    } else {
      handleGenerateSummary();
    }
  }, [summary.data?.status, handleGenerateSummary]);

  const handleConfirmEndAndGenerate = useCallback(async () => {
    if (!sessionId) return;
    setShowEndConfirm(false);
    setGenerating(true);
    try {
      await completeSession.mutateAsync({ id: sessionId });
      await summary.refetch();
      await handleGenerateSummary();
      toast({
        title: "Interview ended",
        description: "The session was completed and the result has been generated.",
      });
    } catch {
      setGenerating(false);
      toast({ title: "Failed to end interview", variant: "destructive" });
    }
  }, [sessionId, completeSession, summary, handleGenerateSummary, toast]);

  // Auto-generate report for completed sessions that have no summary yet
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (
      !autoTriggered.current &&
      !summary.isLoading &&
      summary.data &&
      summary.data.status === "COMPLETED" &&
      !summary.data.summary
    ) {
      autoTriggered.current = true;
      handleGenerateSummary();
    }
  }, [summary.isLoading, summary.data, handleGenerateSummary]);

  const insightsData = summary.data?.insights as
    | {
        keyInsights?: string[];
        criteriaEvaluations?: {
          name: string;
          score: number;
          reasoning: string;
        }[];
        questionEvaluations?: QuestionEvaluation[];
        researchFindings?: ResearchFinding[];
        toneAnalysis?: {
          overall?: string;
          details?: string;
          segments?: {
            question: string;
            tone: string;
            confidence: string;
            notes: string;
          }[];
        };
        big5Personality?: any;
        behavioralAnalysis?: any;
        codeEvaluations?: {
          snippetLabel: string;
          language: string;
          correctness: number;
          efficiency: number;
          readability: number;
          problemSolving: number;
          overall: number;
          evaluation: string;
        }[];
        insufficientData?: boolean;
      }
    | string[]
    | null;
  const keyInsights = Array.isArray(insightsData)
    ? insightsData
    : (insightsData?.keyInsights ?? []);
  const criteriaEvaluations = Array.isArray(insightsData)
    ? []
    : (insightsData?.criteriaEvaluations ?? []);
  const questionEvaluations: QuestionEvaluation[] = Array.isArray(insightsData)
    ? []
    : (insightsData?.questionEvaluations ?? []);
  const researchFindings: ResearchFinding[] = Array.isArray(insightsData)
    ? []
    : (insightsData?.researchFindings ?? []);
  const toneAnalysis = Array.isArray(insightsData)
    ? null
    : (insightsData?.toneAnalysis ?? null);
  const big5Personality = Array.isArray(insightsData)
    ? null
    : (insightsData?.big5Personality ?? null);
  const behavioralAnalysis = Array.isArray(insightsData)
    ? null
    : (insightsData?.behavioralAnalysis ?? null);
  const codeEvaluations = Array.isArray(insightsData)
    ? []
    : (insightsData?.codeEvaluations ?? []);

  const isSessionAnalyzed = !!(sessionId && insightsData && (!Array.isArray(insightsData) || insightsData.length > 0));

  const big5Data = useMemo(() => {
    if (!big5Personality) return [];
    const traits = [
      {
        name: "Openness",
        score: big5Personality.openness ?? 0,
        highDesc: "Highly creative, curious, and open to new experiences.",
        lowDesc: "Prefers routine, practical, and traditional methods."
      },
      {
        name: "Conscientiousness",
        score: big5Personality.conscientiousness ?? 0,
        highDesc: "Disciplined, organized, and detail-oriented.",
        lowDesc: "Flexible, spontaneous, but sometimes disorganized."
      },
      {
        name: "Extraversion",
        score: big5Personality.extraversion ?? 0,
        highDesc: "Outgoing, energetic, and assertive.",
        lowDesc: "Reserved, quiet, and prefers solitary tasks."
      },
      {
        name: "Agreeableness",
        score: big5Personality.agreeableness ?? 0,
        highDesc: "Compassionate, cooperative, and trusting.",
        lowDesc: "Competitive, skeptical, and direct."
      },
      {
        name: "Neuroticism",
        score: big5Personality.neuroticism ?? 0,
        highDesc: "Sensitive, emotionally reactive, and alert.",
        lowDesc: "Calm, emotionally stable, and resilient."
      }
    ];
    return traits.map((t) => {
      let explanation = "Average expression of this trait.";
      if (t.score >= 7) {
        explanation = t.highDesc;
      } else if (t.score < 4) {
        explanation = t.lowDesc;
      }
      return {
        name: t.name,
        score: t.score,
        explanation
      };
    });
  }, [big5Personality]);

  const likertData = useMemo(() => {
    const defaultParams = [
      "Presentation",
      "Opportunistic",
      "Business Acumen",
      "Closing Techniques",
      "Objection Handling",
    ];
    if (behavioralAnalysis?.likertScale && Array.isArray(behavioralAnalysis.likertScale) && behavioralAnalysis.likertScale.length > 0) {
      return behavioralAnalysis.likertScale.map((item: any) => ({
        parameter: item.parameter,
        score: typeof item.score === "number" ? item.score : 0,
        explanation: item.explanation || ""
      }));
    }
    // Empty / insufficient transcript: show numeric zeros, not a placeholder message
    return defaultParams.map((parameter) => ({
      parameter,
      score: 0,
      explanation: "",
    }));
  }, [behavioralAnalysis]);

  const antiCheatingLog = (summary.data?.antiCheatingLog ?? []) as {
    type: string;
    timestamp: number;
    detail?: string;
  }[];

  const overallIntegrity = useMemo(() => {
    const tabSwitchCount = antiCheatingLog.filter(log => 
      log.type.includes("tab_switch") || log.type.includes("departure") || log.type.includes("focus_lost")
    ).length;
    const multiFacesCount = (summary.data as any)?.metadata?.multiple_faces_count ?? antiCheatingLog.filter(log => 
      log.type.includes("multiple_faces") || log.type.includes("face")
    ).length;
    const gazeMissedCount = (summary.data as any)?.metadata?.missed_count ?? 0;
    
    return {
      multipleFaces: multiFacesCount > 0 ? "Flagged" : "Clear",
      tabSwitchCount,
      tabSwitching: tabSwitchCount > 0 ? `Flagged (${tabSwitchCount})` : "Clear",
      eyeGaze: gazeMissedCount > 8 ? "Unstable" : gazeMissedCount > 3 ? "Moderate" : "Stable"
    };
  }, [antiCheatingLog, summary.data]);

  const overallVibe = useMemo(() => {
    const emotions = aggregateEmotions(toneAnalysis?.segments || []);
    const topEmotion = emotions.length > 0 ? emotions[0].emotion : "Unknown";
    const eyeContactVal = (summary.data as any)?.metadata?.eye_contact_score ?? 100;
    return {
      generalExpressionKey: topEmotion.toLowerCase(),
      isPositiveExpression: ["happy", "surprise", "neutral"].includes(topEmotion.toLowerCase()),
      eyeContact: `${eyeContactVal}%`,
      eyeContactVal
    };
  }, [toneAnalysis, summary.data]);

  const qaPairs = useMemo(() => {
    const messages = summary.data?.messages ?? [];
    const contents = ([...(summary.data?.interviewContents ?? [])] as any[])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const filtered = messages.filter((m: any) => m.contentType !== "WHITEBOARD" && (m.contentType as string) !== "CODE");

    // Drop back-to-back duplicate user/assistant lines (mute/unmute artifacts)
    const deduped = filtered.filter((m: any, i: number) => {
      if (i === 0) return true;
      const prev = filtered[i - 1];
      const sameRole = m.role === prev.role;
      const sameContent = (m.content || "").trim() === (prev.content || "").trim();
      const sameQuestion = (m.questionId || null) === (prev.questionId || null);
      return !(sameRole && sameContent && sameQuestion);
    });

    /** Merge consecutive USER messages for the same question into one answer block. */
    const mergeUserResponses = (responses: any[]) => {
      if (responses.length <= 1) return responses;
      const merged: any[] = [];
      for (const resp of responses) {
        const prev = merged[merged.length - 1];
        if (prev && prev.role === resp.role) {
          const a = (prev.content || "").trim();
          const b = (resp.content || "").trim();
          if (!a) {
            merged[merged.length - 1] = resp;
          } else if (b && !a.includes(b)) {
            merged[merged.length - 1] = {
              ...prev,
              content: `${a} ${b}`.replace(/\s+/g, " ").trim(),
            };
          }
        } else {
          merged.push(resp);
        }
      }
      return merged;
    };

    const syntheticQuestion = (q: any, knownTimestamp?: string) => ({
      id: `synthetic-q-${q.id}`,
      role: "ASSISTANT",
      content: q.description?.trim()
        ? `${q.text}\n\n${q.description}`.trim()
        : (q.text || "").trim(),
      questionId: q.id,
      timestamp: knownTimestamp || null,
      contentType: "TEXT",
      type: q.type,
      order: q.order,
    });

    const finalizePairs = (pairs: { question: any; responses: any[] }[]) =>
      normalizeQaTimeline(pairs, playbackSessionStartMs);

    // Prefer interview question bank as backbone so coding / unspoken questions always appear.
    if (contents.length > 0) {
      const pairs: { question: any; responses: any[] }[] = [];
      const byQid = new Map<string, any[]>();
      const orphans: any[] = [];

      for (const m of deduped) {
        if (m.questionId) {
          if (!byQid.has(m.questionId)) byQid.set(m.questionId, []);
          byQid.get(m.questionId)!.push(m);
        } else {
          orphans.push(m);
        }
      }

      // Intro / pre-question speech without a questionId
      if (orphans.length > 0) {
        let introQ: any = null;
        const introResponses: any[] = [];
        for (const m of orphans) {
          if ((m.role === "ASSISTANT" || m.role === "SYSTEM") && !introQ) {
            introQ = m;
          } else if (m.role === "USER" || String(m.role || "").includes("USER")) {
            introResponses.push(m);
          } else if (!introQ) {
            introQ = m;
          }
        }
        if (introQ || introResponses.length) {
          pairs.push({
            question: introQ || { content: "Introductory remarks", role: "ASSISTANT", timestamp: introResponses[0]?.timestamp },
            responses: mergeUserResponses(introResponses),
          });
        }
      }

      // Collect voice messages misattributed to coding questions to carry forward.
      let spilloverUserMsgs: any[] = [];
      let codingQuestionCounter = 0;
      for (let i = 0; i < contents.length; i++) {
        const q = contents[i];
        const msgs = byQid.get(q.id) || [];
        const assistantMsgs = msgs.filter((m) => m.role === "ASSISTANT" || m.role === "SYSTEM");
        const userMsgs = msgs.filter((m) => m.role === "USER" || String(m.role || "").includes("USER"));
        // Prefer bank text so brief coding intros don't replace the real problem statement
        const bankQ = syntheticQuestion(q, assistantMsgs[0]?.timestamp || userMsgs[0]?.timestamp);

        const isCoding = String(q.type).toUpperCase() === "CODING" || String(q.type).toUpperCase() === "CODE";

        if (isCoding) {
          // For coding questions the candidate's answer is in the code editor,
          // not in voice. Any voice messages tagged to this question are likely
          // the answer to the *next* verbal question (a common mis-tagging).
          codingQuestionCounter += 1;
          spilloverUserMsgs = [...spilloverUserMsgs, ...userMsgs];
          
          // If this is the LAST question, we don't want to lose the spilled over messages
          // but they shouldn't be under the coding question either.
          // Ideally they belong to an 'outro' or the previous question, but if we must,
          // we just drop them or append them. We'll drop them to keep the coding question clean.
          pairs.push({
            question: { ...bankQ, codingQuestionNumber: codingQuestionCounter },
            responses: [],
          });
        } else {
          // Prepend any messages carried over from a preceding coding question.
          const combinedUserMsgs = [...spilloverUserMsgs, ...userMsgs];
          spilloverUserMsgs = [];
          pairs.push({
            question: bankQ,
            responses: mergeUserResponses(combinedUserMsgs),
          });
        }
      }
      
      // If there are leftover messages after all questions, they belong to the last question
      // (if it wasn't a coding question) or they are orphaned.
      if (spilloverUserMsgs.length > 0 && pairs.length > 0) {
         // Append to the last non-coding question if possible
         const lastNonCodingIdx = [...pairs].reverse().findIndex(p => !(String(p.question?.type).toUpperCase() === "CODING" || String(p.question?.type).toUpperCase() === "CODE"));
         if (lastNonCodingIdx !== -1) {
            const actualIdx = pairs.length - 1 - lastNonCodingIdx;
            pairs[actualIdx].responses = mergeUserResponses([...pairs[actualIdx].responses, ...spilloverUserMsgs]);
         }
      }

      return finalizePairs(pairs);
    }

    const pairs: { question: any; responses: any[] }[] = [];
    const hasQuestionIdTagging = deduped.some((m: any) => m.questionId);

    if (hasQuestionIdTagging) {
      const buckets = new Map<string, { question: any; responses: any[] }>();
      const bucketOrder: string[] = [];
      let lastKey: string | null = null;

      deduped.forEach((m: any) => {
        const key: string | null = m.questionId ?? null;

        if (m.role === "ASSISTANT" || m.role === "SYSTEM") {
          const bucketKey = key ?? lastKey ?? `__nokey_${bucketOrder.length}`;
          if (buckets.has(bucketKey)) {
            const existing = buckets.get(bucketKey)!;
            // Prefer longer/complete question text over short coding intros
            const prevLen = (existing.question?.content || "").length;
            const nextLen = (m.content || "").length;
            if (nextLen >= prevLen) existing.question = m;
          } else {
            buckets.set(bucketKey, { question: m, responses: [] });
            bucketOrder.push(bucketKey);
          }
          lastKey = bucketKey;
        } else {
          const targetKey = key
            ? (buckets.has(key) ? key : lastKey)
            : lastKey;
          if (targetKey && buckets.has(targetKey)) {
            buckets.get(targetKey)!.responses.push(m);
          } else {
            pairs.push({ question: null, responses: [m] });
          }
        }
      });

      for (const k of bucketOrder) {
        const bucket = buckets.get(k)!;
        bucket.responses = mergeUserResponses(bucket.responses);
        pairs.push(bucket);
      }
    } else {
      let currentPair: { question: any; responses: any[] } | null = null;

      deduped.forEach((m: any) => {
        if (m.role === "ASSISTANT" || m.role === "SYSTEM" || !m.role.includes("USER")) {
          if (currentPair) {
            currentPair.responses = mergeUserResponses(currentPair.responses);
            pairs.push(currentPair);
          }
          currentPair = { question: m, responses: [] };
        } else {
          if (currentPair) {
            currentPair.responses.push(m);
          } else {
            pairs.push({ question: null, responses: [m] });
          }
        }
      });
      if (currentPair) {
        currentPair.responses = mergeUserResponses(currentPair.responses);
        pairs.push(currentPair);
      }
    }

    return finalizePairs(pairs);
  }, [summary.data?.messages, summary.data?.interviewContents, summary.data?.startedAt, summary.data?.createdAt, playbackSessionStartMs]);

  const questionPlaybackMarkers = useMemo(() => {
    const orderedMarkers = qaPairs
      .map((pair, idx) => {
        const content = pair.question?.content || "";
        const isDecorative =
          content === "Introductory remarks" ||
          content.includes("Introductory remarks") ||
          content.includes("Outro remarks");
        if (isDecorative) return null;

        const questionTimestamp = pair.question?.timestamp;
        if (!questionTimestamp) return null;

        const startTimeSeconds = Math.max(
          0,
          (new Date(questionTimestamp).getTime() - playbackSessionStartMs) / 1000,
        );
        if (!Number.isFinite(startTimeSeconds)) return null;

        return { idx, startTimeSeconds };
      })
      .filter((marker): marker is { idx: number; startTimeSeconds: number } => marker !== null)
      .sort((a, b) => {
        if (a.startTimeSeconds !== b.startTimeSeconds) {
          return a.startTimeSeconds - b.startTimeSeconds;
        }
        return a.idx - b.idx;
      });

    return orderedMarkers.map((marker, markerIdx) => ({
      ...marker,
      endTimeSeconds: orderedMarkers[markerIdx + 1]?.startTimeSeconds ?? Number.POSITIVE_INFINITY,
    }));
  }, [qaPairs, playbackSessionStartMs]);

  const getActiveQuestionIndexForPlaybackTime = useCallback((playbackTimeSeconds: number) => {
    if (!Number.isFinite(playbackTimeSeconds) || questionPlaybackMarkers.length === 0) {
      return null;
    }

    const EPSILON_SECONDS = 0.2;

    for (let i = questionPlaybackMarkers.length - 1; i >= 0; i--) {
      const marker = questionPlaybackMarkers[i];
      if (
        playbackTimeSeconds + EPSILON_SECONDS >= marker.startTimeSeconds &&
        playbackTimeSeconds < marker.endTimeSeconds - EPSILON_SECONDS
      ) {
        return marker.idx;
      }
    }

    if (playbackTimeSeconds + EPSILON_SECONDS < questionPlaybackMarkers[0]!.startTimeSeconds) {
      return questionPlaybackMarkers[0]!.idx;
    }

    return questionPlaybackMarkers[questionPlaybackMarkers.length - 1]!.idx;
  }, [questionPlaybackMarkers]);


  const aiOverallScore = getSessionOverallScore({
    questionEvaluations,
    criteriaEvaluations,
  });

  const hrScoreComment = [...existingHrComments].reverse().find((c: any) => c.score !== undefined && c.score !== null);
  
  const overallScore = hrScoreComment ? hrScoreComment.score : aiOverallScore;
  const isScoreEdited = !!hrScoreComment;
  const originalScore = aiOverallScore;

  const avgQuestionScore =
    overallScore !== null ? overallScore.toFixed(1) : null;

  const strengthsList = useMemo(() => {
    const data = insightsData as any;
    if (data?.pros && Array.isArray(data.pros) && data.pros.length > 0) {
      return data.pros;
    }
    return [
      "Demonstrates clear communication skills.",
      "Exhibits a strongly analytical mindset."
    ];
  }, [insightsData]);

  const gapsList = useMemo(() => {
    const data = insightsData as any;
    if (data?.cons && Array.isArray(data.cons) && data.cons.length > 0) {
      return data.cons;
    }
    return [
      "Could improve structural conciseness.",
      "Opportunity to provide more quantitative examples."
    ];
  }, [insightsData]);

  const recommendationsList = useMemo(() => {
    const data = insightsData as any;
    if (data?.keyInsights && Array.isArray(data.keyInsights) && data.keyInsights.length > 0) {
      return data.keyInsights;
    }
    return [
      "Proceed with final round interview focusing on culture fit.",
      "Verify references to confirm track record."
    ];
  }, [insightsData, overallScore]);

  const candidatePhoto = useMemo(() => {
    const metadataPhoto =
      (summary.data?.metadata as { capturedPhoto?: string } | undefined)?.capturedPhoto ??
      ((summary.data as any)?.participantMetadata as { capturedPhoto?: string } | undefined)?.capturedPhoto;
    if (metadataPhoto) return metadataPhoto;
    
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`captured_photo_${sessionId}`);
        if (stored) return stored;
      } catch (e) {
        console.error(e);
      }
    }
    return null;
  }, [summary.data, sessionId]);

  const sentimentData = summary.data?.sentiment as {
    overall?: string;
    details?: string;
    score?: number;
  } | null;

  const hasReport = !!(
    summary.data?.summary ||
    criteriaEvaluations.length > 0 ||
    questionEvaluations.length > 0 ||
    researchFindings.length > 0 ||
    keyInsights.length > 0 ||
    (summary.data?.themes && summary.data.themes.length > 0)
  );

  const handleExportPDF = useCallback(async () => {
    if (activeTab === "cv_analysis") {
      const cvAnalysis = (summary.data?.candidateProfile as any)?.cvAnalysis;
      if (!cvAnalysis?.resumePath) {
        toast({
          title: "No CV uploaded",
          description: "There is no CV file stored for this candidate.",
          variant: "destructive",
        });
        return;
      }
      try {
        setExporting(true);
        setExportProgress("Downloading...");
        const res = await getCvDownloadUrl.mutateAsync({ candidateId: candidateRecordId! });
        const a = document.createElement("a");
        a.href = res.url;
        a.download = res.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast({
          title: "Success",
          description: "Resume downloaded successfully!",
        });
      } catch (err: any) {
        toast({
          title: "Download Failed",
          description: err.message || "Failed to download resume.",
          variant: "destructive",
        });
      } finally {
        setExporting(false);
      }
      return;
    }

    if (!reportRef.current) return;

    const participant =
      summary.data?.participantName ||
      summary.data?.participantEmail ||
      "anonymous";
    const title = summary.data?.interviewTitle || "interview";
    // Safer filename: replace any non-alphanumeric (except _ and -) with _
    const safeTitle = title.replace(/[^a-z0-9]/gi, "_");
    const safeParticipant = participant.replace(/[^a-z0-9]/gi, "_");
    const fileName = `${safeTitle}_${safeParticipant}_report.pdf`;

    setExporting(true);
    setExportPercent(0);
    setExportProgress("Preparing...");
    setPdfCapture(true);
    
    // Yield to let the browser paint before each heavy stage
    const paint = () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );

    try {
      // 1. Give much more time for the PDF layout to render fully (charts, etc)
      // We wait in increments to ensure the DOM is ready
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 200));
        const pages = document.querySelectorAll(".pdf-page");
        if (pages.length >= 4) break; // We expect at least 4 core pages
        setExportProgress(`Initializing Layout (${attempt + 1})...`);
      }

      await paint();

      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      // 2. Capture EACH page individually
      const pageElements = Array.from(document.querySelectorAll(".pdf-page")) as HTMLElement[];
      
      if (pageElements.length === 0) {
        throw new Error("No report pages found to capture. Please try again.");
      }

      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // Animate progress during the slow html2canvas phase
      let currentProgress = 10;
      setExportPercent(currentProgress);

      for (let i = 0; i < pageElements.length; i++) {
        const el = pageElements[i];
        setExportProgress(`Capturing Page ${i + 1} of ${pageElements.length}...`);
        await paint();

        const canvas = await html2canvas(el, {
          scale: 2, // Slightly reduced scale for better stability/memory
          useCORS: true,
          backgroundColor: "#ffffff",
          imageTimeout: 30000,
          logging: false,
          width: el.offsetWidth,
          height: el.offsetHeight,
          windowWidth: el.offsetWidth,
          windowHeight: el.offsetHeight,
          onclone: (clonedDoc) => {
            // Ensure any hidden elements are visible in the clone if needed
            const clonedEl = clonedDoc.querySelector(`.pdf-page:nth-child(${i + 1})`) as HTMLElement;
            if (clonedEl) clonedEl.style.display = "block";
          }
        });

        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Use JPEG with slightly lower quality to prevent huge file sizes that can crash browsers
        const imgData = canvas.toDataURL("image/jpeg", 0.92);

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight, undefined, "FAST");
        
        currentProgress = 10 + Math.round(((i + 1) / pageElements.length) * 85);
        setExportPercent(currentProgress);
      }

      setExportProgress("Saving File...");
      await paint();

      // 3. Save the file. pdf.save() is generally more robust across all browsers 
      // than the experimental File System Access API for this use case.
      pdf.save(fileName);
      
      setExportPercent(100);
      toast({ title: "Report exported successfully" });
    } catch (err) {
      console.error("PDF export failed:", err);
      toast({ 
        title: "PDF Export Failed", 
        description: err instanceof Error ? err.message : "An error occurred while generating the report.",
        variant: "destructive" 
      });
    } finally {
      setPdfCapture(false);
      setExporting(false);
      setExportProgress("");
      setExportPercent(0);
    }
  }, [summary.data, criteriaEvaluations, questionEvaluations, overallScore, sentimentData, toneAnalysis, toast, activeTab, candidateRecordId, getCvDownloadUrl]);

  const renderVideoTranscript = () => {
    if (!summary.data?.messages && !summary.data?.videoRecordingUrl && !summary.data?.audioRecordingUrl && !((summary.data as any)?.videoClips?.length)) {
      return null;
    }

    const videoUrl = summary.data?.videoRecordingUrl || null;
    const audioUrl = summary.data?.audioRecordingUrl || null;
    const hasMedia = !!(videoUrl || audioUrl);
    const sessionStart = playbackSessionStartMs;
    const videoClips: { questionId: string; clipUrl: string; durationSec: number }[] =
      (summary.data as any)?.videoClips ?? [];
    const hasClips = videoClips.length > 0;
    const clipByQuestionId = new Map(videoClips.map((c) => [c.questionId, c]));
    const activeQPair = activeQuestionIdx !== null ? qaPairs[activeQuestionIdx] : null;
    const activeQId = activeQPair?.question?.questionId || activeQPair?.question?.id || null;
    const activeClip = activeQId ? clipByQuestionId.get(activeQId) : undefined;

    return (
      <Card id="relay-video" className="overflow-hidden border border-slate-200 shadow-sm bg-white dark:bg-slate-900 mt-6">
        <CardHeader className="border-b bg-slate-50 dark:bg-slate-900/50">
          <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white text-base font-bold">
            <Video className="h-4 w-4 text-purple-600" />
            {t("results.videoAndReplay")}
            {hasClips && (
              <span className="ml-auto text-[10px] font-semibold text-purple-600 bg-purple-100/60 px-2 py-0.5 rounded-full">
                Per-Question Clips
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
            {/* Left Side: QA Accordion — pb so last expand isn't clipped; items stay in normal flow (no overlap) */}
            <div className="space-y-3 overflow-y-auto max-h-[500px] pr-2 pb-16">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t("results.questionsList")}</p>
              {(() => {

                return qaPairs.map((pair, idx) => {
                  const content = pair.question?.content || "";
                  if (content === "Introductory remarks" || content.includes("Introductory remarks") || content.includes("Outro remarks")) {
                    return null;
                  }
                  const isSelected = activeQuestionIdx === idx;
                  const questionTimestamp = pair.question?.timestamp;
                  const parsedQuestionTime = questionTimestamp
                    ? new Date(questionTimestamp).getTime()
                    : Number.NaN;
                  const hasQuestionTime = Number.isFinite(parsedQuestionTime);
                  const msgTime = hasQuestionTime
                    ? Math.max(0, (parsedQuestionTime - sessionStart) / 1000)
                    : null;
                  
                  const minutes = msgTime == null ? 0 : Math.floor(msgTime / 60);
                  const seconds = msgTime == null ? "00" : Math.floor(msgTime % 60).toString().padStart(2, '0');
                  const timestamp = msgTime == null ? "—" : `${minutes}:${seconds}`;
                  const pairKey =
                    pair.question?.questionId ||
                    pair.question?.id ||
                    `qa-${idx}`;

                  const qId = pair.question?.questionId || pair.question?.id;
                  const clip = qId ? clipByQuestionId.get(qId) : undefined;

                  return (
                    <div 
                      key={pairKey} 
                      data-qa-idx={idx}
                      className={cn(
                        "relative z-0 border rounded-lg p-3 transition-all cursor-pointer isolate",
                        isSelected 
                          ? "z-10 border-purple-300 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20" 
                          : "border-slate-100 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                      )}
                      onClick={() => {
                        if (isSelected) {
                          setActiveQuestionIdx(null);
                        } else {
                          setActiveQuestionIdx(idx);
                          if (!hasClips && videoRef.current && msgTime != null) {
                            (videoRef.current as HTMLVideoElement & { __qaManualSeekUntil?: number }).__qaManualSeekUntil =
                              Date.now() + 2500;
                            videoRef.current.currentTime = msgTime;
                          }
                        }
                      }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <p className="text-xs text-slate-800 dark:text-slate-200 font-semibold leading-relaxed">
                          {pair.question?.content || "Introductory remarks"}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasClips ? (
                            clip ? (
                              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Video className="h-2.5 w-2.5" />
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                No clip
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-purple-600 font-bold bg-purple-100/50 px-1.5 py-0.5 rounded">
                              {timestamp}
                            </span>
                          )}
                          {isSelected ? (
                            <ChevronUp className="h-3.5 w-3.5 text-purple-500" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {/* Collapsible Dropdown for responses — in-flow so it doesn't overlap prior rows */}
                      {isSelected && (
                        <div className="relative z-10 mt-3 pt-3 border-t border-purple-100 dark:border-purple-900 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Candidate Response</p>
                          
                          {pair.responses.length === 0 ? (
                            <div className="w-full text-left text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-2.5 rounded border border-dashed border-slate-200 dark:border-slate-800">
                              {String(pair.question?.type).toUpperCase() === 'CODING' || String(pair.question?.type).toUpperCase() === 'CODE'
                                ? `— Refer to code snippet #${pair.question?.codingQuestionNumber ?? ''} in the Code Submissions & Evaluation section`
                                : `- Candidate did not attempt this question`}
                            </div>
                          ) : (
                            pair.responses.map((resp, rIdx) => {
                              const respTime = resp?.timestamp
                                ? Math.max(0, (new Date(resp.timestamp).getTime() - sessionStart) / 1000)
                                : null;
                              const hasResponseTime = respTime != null && Number.isFinite(respTime);
                              const responseTimestamp = hasResponseTime
                                ? `${Math.floor(respTime / 60)}:${Math.floor(respTime % 60).toString().padStart(2, "0")}`
                                : "—";
                              const responseStartMs = resp?.timestamp ? new Date(resp.timestamp).getTime() : null;
                              const clipOffsetSec = (Number.isFinite(parsedQuestionTime) && responseStartMs)
                                ? Math.max(0, (responseStartMs - parsedQuestionTime) / 1000)
                                : 0;

                              return (
                                <button
                                  key={rIdx}
                                  type="button"
                                  className="w-full text-left text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-100 dark:border-slate-800 hover:border-purple-300 hover:bg-purple-50/40 dark:hover:bg-purple-950/20 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (hasClips && clipVideoRef.current) {
                                      // Seek directly to the candidate's start timestamp in the clip and play
                                      clipVideoRef.current.currentTime = clipOffsetSec;
                                      clipVideoRef.current.play().catch(() => {});
                                    } else if (!hasClips && videoRef.current && hasResponseTime) {
                                      (videoRef.current as HTMLVideoElement & { __qaManualSeekUntil?: number }).__qaManualSeekUntil =
                                        Date.now() + 2500;
                                      videoRef.current.currentTime = respTime;
                                    }
                                  }}
                                >
                                  {!hasClips && (
                                    <span className="mb-1 inline-block text-[10px] text-purple-600 font-bold bg-purple-100/50 px-1.5 py-0.5 rounded">
                                      {responseTimestamp}
                                    </span>
                                  )}
                                  <span className="block">{resp.content}</span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Right Side: Per-question clip or full session video */}
            <div className="flex flex-col space-y-4">
              <div
                className="relative w-full bg-black rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800"
                style={{ aspectRatio: 16 / 9 }}
              >
                {hasClips ? (
                  activeClip ? (
                    <video
                      key={activeClip.clipUrl}
                      ref={(el) => {
                        (clipVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
                      }}
                      controls
                      preload="auto"
                      src={activeClip.clipUrl}
                      className="h-full w-full object-contain"
                    />
                  ) : activeQuestionIdx === null ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-950 px-6 text-center">
                      <Video className="h-8 w-8 text-slate-500" />
                      <p className="text-sm font-medium text-slate-300">Select a question</p>
                      <p className="text-xs text-slate-500">Click a question on the left to play its recording</p>
                    </div>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
                      <div className="h-14 w-14 rounded-full bg-slate-800 flex items-center justify-center">
                        <Video className="h-6 w-6 text-slate-500" />
                      </div>
                      <p className="text-sm font-semibold text-slate-300">Candidate did not answer</p>
                      <p className="text-xs text-slate-500 max-w-xs">
                        No recording was captured for this question. The candidate may have skipped it or closed the session before answering.
                      </p>
                    </div>
                  )
                ) : videoUrl ? (
                  <video
                    ref={videoRef}
                    controls
                    preload="auto"
                    src={videoUrl}
                    className="h-full w-full object-contain"
                    onTimeUpdate={(e) => {
                      const curTime = e.currentTarget.currentTime;
                      setVideoTime(curTime);

                      const manualUntil =
                        (e.currentTarget as HTMLVideoElement & { __qaManualSeekUntil?: number })
                          .__qaManualSeekUntil ?? 0;
                      if (Date.now() < manualUntil) return;

                      const pairIdx = getActiveQuestionIndexForPlaybackTime(curTime);
                      if (pairIdx !== null && pairIdx !== activeQuestionIdx) {
                        setActiveQuestionIdx(pairIdx);
                      }
                    }}
                    onCanPlay={() => setVideoCanPlay(true)}
                  />
                ) : audioUrl ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-950 px-6">
                    <Volume2 className="h-8 w-8 text-slate-400" />
                    <audio controls preload="auto" src={audioUrl} className="w-full max-w-md" />
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-950 px-6 text-center">
                    <Video className="h-8 w-8 text-slate-500" />
                    <p className="text-sm font-medium text-slate-300">{t("results.recordingUnavailable")}</p>
                    <p className="text-xs text-slate-500">{t("results.recordingUnavailableHint")}</p>
                  </div>
                )}
              </div>
              
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border">
                <span className="text-xs text-slate-500 font-medium">
                  {hasClips
                    ? `${videoClips.length} question clip${videoClips.length !== 1 ? "s" : ""} recorded — select a question to play`
                    : hasMedia ? t("results.syncMessage") : t("results.transcriptOnlyHint")}
                </span>
                <Button variant="outline" size="sm" onClick={handleDownloadTranscript}>
                  <Download className="mr-2 h-3 w-3" />
                  {t("results.downloadTranscript")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };


  const handleDownloadTranscript = useCallback(() => {
    if (!summary.data?.messages) return;

    const sessionStart = new Date(summary.data.startedAt || summary.data.createdAt).getTime();
    const transcript = summary.data.messages
      .filter((m: any) => m.contentType !== "WHITEBOARD" && (m.contentType as string) !== "CODE")
      .map((msg: any) => {
        const role = msg.role === "USER" ? "Candidate" : "AI Interviewer";
        const msgTime = (new Date(msg.timestamp).getTime() - sessionStart) / 1000;
        const minutes = Math.floor(msgTime / 60);
        const seconds = Math.floor(msgTime % 60).toString().padStart(2, '0');
        const timestamp = `[${minutes}:${seconds}]`;
        return `${timestamp} ${role}: ${msg.content}`;
      })
      .join("\n\n");

    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (summary.data?.participantName || "candidate").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    a.href = url;
    a.download = `${safeName}_interview_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: "Transcript downloaded successfully" });
  }, [summary.data, toast]);



  return (
    <div className="space-y-6">
      {/* Hidden file input for trying another CV */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleCvFileChange}
        accept=".pdf,.doc,.docx"
        className="hidden"
      />

      {/* Top bar */}
      <div className="flex items-center justify-between no-print">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Results
        </Button>
        <div className="flex items-center gap-2">
          {!isViewer &&
            summary.data?.status === "IN_PROGRESS" &&
            !!sessionId && (
              <Button
                variant="destructive"
                onClick={handleRequestReport}
                disabled={generating || completeSession.isPending}
              >
                {generating || completeSession.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <StopCircle className="mr-2 h-4 w-4" />
                )}
                {generating
                  ? "Generating result..."
                  : "End Interview & Generate Result"}
              </Button>
            )}
          {!isViewer &&
            summary.data?.status === "COMPLETED" &&
            !hasReport &&
            (summary.data?.messages?.length ?? 0) > 0 && (
              <Button
                variant="default"
                onClick={handleGenerateSummary}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {generating ? "Generating..." : "Generate Result"}
              </Button>
            )}
          {activeTab === "cv_analysis" && (
            <Button
              variant="outline"
              onClick={handleTryAnotherCvClick}
              disabled={isAnalyzingCv || isViewer}
              className="flex items-center"
            >
              {isAnalyzingCv ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isAnalyzingCv ? "Analyzing..." : "Try Another CV"}
            </Button>
          )}
          {(hasReport || activeTab === "cv_analysis") && (
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={exporting}
              className="relative overflow-hidden"
            >
              {exporting && (
                <div
                  className="absolute inset-0 bg-primary/10 transition-all duration-300 ease-out"
                  style={{ width: `${exportPercent}%` }}
                />
              )}
              <span className="relative flex items-center">
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                {activeTab === "cv_analysis"
                  ? (exporting ? exportProgress || "Downloading..." : "Download CV")
                  : (exporting ? exportProgress || "Exporting..." : "Export PDF")}
              </span>
            </Button>
          )}
        </div>
      </div>

      {summary.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div ref={reportRef} className={cn(pdfCapture && "pdf-capture bg-white")}>
          {pdfCapture ? (
            <HRStandardPDFReport 
              summary={summary}
              criteriaEvaluations={criteriaEvaluations}
              questionEvaluations={questionEvaluations}
              overallScore={overallScore}
              sentimentData={sentimentData}
              toneAnalysis={toneAnalysis}
              big5Personality={big5Personality}
              behavioralAnalysis={behavioralAnalysis}
            />
          ) : (
            <div
              className={cn(
                "space-y-6 bg-background p-8 rounded-xl",
              )}
            >
            {/* HR Professional Header (visible in report/PDF) */}
            <div className="flex flex-col gap-6 border-b-2 border-primary pb-8">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h1 className="text-3xl font-black tracking-tighter text-slate-900 dark:text-white uppercase">
                    Interview Performance Report
                  </h1>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                    Confidential Recruitment Document
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="mb-2 border-primary text-primary font-bold">
                    ID: {(summary.data as any)?.id?.slice(0, 8).toUpperCase() ?? "N/A"}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground">
                    Generated on {new Date(summary.data?.createdAt ?? Date.now()).toLocaleDateString()}
                  </p>
                </div>
              </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 mt-6">
              {/* Left Sidebar */}
              <div className="space-y-5 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto pr-1">
                {/* Profile Card */}
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{t("results.candidateOverview")}</p>
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-700">
                      {candidatePhoto ? (
                        <img
                          src={candidatePhoto}
                          alt="Candidate photo"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold uppercase text-sm">
                          {(summary.data?.participantName || "A")[0]}
                        </div>
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">{summary.data?.participantName || "Anonymous Candidate"}</p>
                      <p className="text-[11px] text-slate-450 dark:text-slate-400 truncate mt-0.5">{summary.data?.participantEmail || "-"}</p>
                    </div>
                  </div>
                </Card>

                {/* Session Snapshot Card */}
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{t("results.sessionSnapshot")}</p>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t("results.date")}</span><span className="font-bold text-slate-800 dark:text-slate-200">{summary.data?.createdAt ? new Date(summary.data.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : "-"}</span></div>
                    {(() => {
                      const crossDay = sessionSpanCrossesLocalDay(
                        summary.data?.startedAt,
                        summary.data?.completedAt,
                      );
                      const durationMin = resolveDisplayDurationMinutes(
                        summary.data?.totalDurationSeconds,
                        summary.data?.startedAt,
                        summary.data?.completedAt,
                      );
                      return (
                        <>
                          <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t("results.startTime")}</span><span className="font-bold text-slate-800 dark:text-slate-200">{formatSessionClock(summary.data?.startedAt, { includeDate: crossDay })}</span></div>
                          <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t("results.endTime")}</span><span className="font-bold text-slate-800 dark:text-slate-200">{formatSessionClock(summary.data?.completedAt, { includeDate: crossDay })}</span></div>
                          <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t("results.duration")}</span><span className="font-bold text-slate-800 dark:text-slate-200">{durationMin != null ? `${durationMin} min` : "-"}</span></div>
                        </>
                      );
                    })()}
                    <div className="flex justify-between items-center gap-4"><span className="text-slate-400 font-bold shrink-0">{t("results.role")}</span><span className="font-bold text-slate-800 dark:text-slate-200 truncate" title={summary.data?.interviewTitle}>{summary.data?.interviewTitle || "-"}</span></div>
                    <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t("results.status")}</span><Badge variant="outline" className={cn("text-[10px] font-bold rounded-full py-0.5", getSessionStatusBadgeClass(summary.data?.status))}>{summary.data?.status || "COMPLETED"}</Badge></div>
                    <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t("results.score")}</span><div className="flex flex-col items-end gap-1"><Badge variant="outline" className={cn("font-bold rounded-full px-2.5 py-0.5 flex gap-1 items-center", getScoreBadgeClass(overallScore))}>{overallScore !== null ? `${overallScore.toFixed(1)} / 10` : "-"}{isScoreEdited && <span className="text-[10px] uppercase font-bold opacity-75 tracking-wider">(edited)</span>}</Badge>{isScoreEdited && originalScore !== null && <span className="text-[10px] text-slate-400 font-medium">(originally {originalScore.toFixed(1)})</span>}</div></div>
                  </div>
                </Card>

                {/* Evaluation Result Dropdown */}
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 rounded-2xl p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("results.evaluationResult")}</p>
                  {(() => {
                    const status = summary.data?.evaluationStatus || "PENDING";
                    const statusColors: Record<string, string> = {
                      PENDING: "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-350",
                      SHORTLISTED: "bg-emerald-50 border-emerald-250 text-emerald-700 hover:bg-emerald-100/50 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400",
                      WAITLISTED: "bg-amber-50 border-amber-250 text-amber-700 hover:bg-amber-100/50 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400",
                      REJECTED: "bg-red-50 border-red-250 text-red-700 hover:bg-red-100/50 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400"
                    };
                    const colorClass = statusColors[status] || statusColors.PENDING;
                    
                    return (
                      <Select
                        value={status}
                        disabled={isViewer}
                        onValueChange={async (val) => {
                          try {
                            if (candidateRecordId) {
                              await updateCandidate.mutateAsync({
                                id: candidateRecordId,
                                evaluationStatus: val as any,
                              });
                            } else if (sessionId) {
                              await updateStatus.mutateAsync({
                                sessionId: sessionId,
                                evaluationStatus: val as any,
                              });
                            }
                            await utils.analysis.getSessionSummary.invalidate();
                            await utils.candidate.list.invalidate();
                            toast({ title: "Status updated successfully" });
                          } catch {
                            toast({ title: "Failed to update status", variant: "destructive" });
                          }
                        }}
                      >
                        <SelectTrigger className={cn("w-full rounded-xl h-10 font-bold border transition-colors shadow-sm", colorClass)}>
                          <SelectValue placeholder={t("results.pending")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PENDING" className="font-semibold text-slate-700">{t("results.pending")}</SelectItem>
                          <SelectItem value="SHORTLISTED" className="font-semibold text-emerald-600">{t("results.shortlisted")}</SelectItem>
                          <SelectItem value="WAITLISTED" className="font-semibold text-amber-600">{t("results.waitlisted")}</SelectItem>
                          <SelectItem value="REJECTED" className="font-semibold text-red-600">{t("results.rejected")}</SelectItem>
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </Card>

                {/* Feedback Navigation Section */}
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 rounded-2xl p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">FEEDBACK NAVIGATION</p>
                  <Button 
                    variant="ghost"
                    className={cn(
                      "w-full justify-start rounded-xl font-bold h-11 text-xs border border-transparent transition-all", 
                      activeTab === "ai_result" 
                        ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm" 
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-350 border-slate-100 dark:border-slate-800"
                    )} 
                    onClick={() => {
                      setActiveTab("ai_result");
                      setTimeout(() => {
                        document.getElementById("results-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }}
                  >
                    {t("results.aiInterviewResult")}
                  </Button>
                  <Button 
                    variant="ghost"
                    className={cn(
                      "w-full justify-start rounded-xl font-bold h-11 text-xs border border-transparent transition-all",
                      activeTab === "transcript_relay"
                        ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-350 border-slate-100 dark:border-slate-800"
                    )}
                    onClick={() => {
                      setActiveTab("transcript_relay");
                      setTimeout(() => {
                        document.getElementById("relay-video")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }}
                  >
                    {t("results.transcriptAndRelay")}
                  </Button>
                  <Button 
                    variant="ghost"
                    className={cn(
                      "w-full justify-start rounded-xl font-bold h-11 text-xs border border-transparent transition-all", 
                      activeTab === "cv_analysis" 
                        ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm" 
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-350 border-slate-100 dark:border-slate-800"
                    )} 
                    onClick={() => setActiveTab("cv_analysis")}
                  >
                    {t("results.cvAnalysis")}
                  </Button>
                  <Button 
                    variant="ghost"
                    className={cn(
                      "w-full justify-start rounded-xl font-bold h-11 text-xs border border-transparent transition-all", 
                      activeTab === "hr_comments" 
                        ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm" 
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-350 border-slate-100 dark:border-slate-800"
                    )} 
                    onClick={() => setActiveTab("hr_comments")}
                  >
                    {t("results.hrComments")}
                  </Button>
                </Card>
              </div>

              {/* Right Content */}
              <div className="min-w-0" id="results-top">
                {(activeTab === "ai_result" || activeTab === "transcript_relay") && (
                  <div className="space-y-6">
                    {/* Row 1: Overall Hireability | WORKMAP BEHAVIORAL ASSESSMENT */}
                    <div className="grid gap-6 md:grid-cols-2">
                      {/* Overall Hireability */}
                      {isSessionAnalyzed ? (
                        <Card className="shadow-sm card-break-avoid">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-bold">
                              <Trophy className="h-4 w-4 text-amber-600" />
                              <span>{t("results.overallHireability")}</span>
                              {isScoreEdited && (
                                <span className="text-[10px] uppercase tracking-widest text-slate-400 opacity-75 font-bold mt-0.5 ml-1">
                                  (edited)
                                </span>
                              )}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">{t("results.overallHireabilityDesc")}</p>
                          </CardHeader>
                          <CardContent className="flex flex-col items-center">
                            {(() => {
                              const techTerms = ["technical", "coding", "problem", "knowledge", "skill"];
                              const techCriteria = criteriaEvaluations.filter(c => 
                                techTerms.some(term => c.name.toLowerCase().includes(term))
                              );
                              const behavioralCriteria = criteriaEvaluations.filter(c => 
                                !techTerms.some(term => c.name.toLowerCase().includes(term))
                              );
                              
                              const techAvg = techCriteria.length > 0 
                                ? techCriteria.reduce((sum, c) => sum + c.score, 0) / techCriteria.length 
                                : (overallScore || 0);
                              
                              const behavioralAvg = behavioralCriteria.length > 0 
                                ? behavioralCriteria.reduce((sum, c) => sum + c.score, 0) / behavioralCriteria.length 
                                : (overallScore || 0);

                              return (
                                <div className="w-full flex flex-col items-center">
                                  <HireabilityGauge 
                                    score={overallScore || 0} 
                                    technicalScore={techAvg} 
                                    behavioralScore={behavioralAvg} 
                                    isEdited={isScoreEdited}
                                    originalScore={originalScore}
                                  />
                                  
                                  {/* Tabs Pill Selector */}
                                  <div className="mt-6 flex justify-center bg-slate-50 dark:bg-slate-900/50 p-1 rounded-full border border-slate-100 dark:border-slate-800 w-full max-w-sm">
                                    <button
                                      type="button"
                                      className={cn(
                                        "flex-1 text-[11px] font-bold py-1.5 px-3 rounded-full transition-all text-center",
                                        hireabilityTab === "recommendations"
                                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700"
                                          : "text-slate-500 hover:text-slate-800"
                                      )}
                                      onClick={() => setHireabilityTab("recommendations")}
                                    >
                                      {t("results.recommendations")}
                                    </button>
                                    <button
                                      type="button"
                                      className={cn(
                                        "flex-1 text-[11px] font-bold py-1.5 px-3 rounded-full transition-all text-center",
                                        hireabilityTab === "strengths"
                                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700"
                                          : "text-slate-500 hover:text-slate-800"
                                      )}
                                      onClick={() => setHireabilityTab("strengths")}
                                    >
                                      {t("results.strengths")}
                                    </button>
                                    <button
                                      type="button"
                                      className={cn(
                                        "flex-1 text-[11px] font-bold py-1.5 px-3 rounded-full transition-all text-center",
                                        hireabilityTab === "gaps"
                                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700"
                                          : "text-slate-500 hover:text-slate-800"
                                      )}
                                      onClick={() => setHireabilityTab("gaps")}
                                    >
                                      {t("results.gaps")}
                                    </button>
                                </div>

                                {/* Tab Content */}
                                <div className="mt-5 w-full max-w-sm min-h-[90px] px-1">
                                  <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-400">
                                    {(hireabilityTab === "recommendations" ? recommendationsList : hireabilityTab === "strengths" ? strengthsList : gapsList).map((item: string, idx: number) => (
                                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                                        <span className="text-purple-650 font-black mt-1 shrink-0">•</span>
                                        <span className="font-semibold">{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Card>
                      ) : (
                        <InterviewDataOverlay
                          sessionStatus={summary.data?.status}
                          generating={generating}
                          summaryFailed={summaryGenFailed}
                          onRetry={handleGenerateSummary}
                        >
                          <Card className="shadow-sm card-break-avoid">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2 text-base font-bold">
                                <Trophy className="h-4 w-4 text-amber-600" />
                                {t("results.overallHireability")}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground">{t("results.overallHireabilityDesc")}</p>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center">
                              <div className="w-full flex flex-col items-center">
                                <HireabilityGauge score={0} technicalScore={0} behavioralScore={0} />
                              </div>
                            </CardContent>
                          </Card>
                        </InterviewDataOverlay>
                      )}

                      {/* Workmap Behavioral Assessment */}
                      {isSessionAnalyzed ? (
                        <Card className="shadow-sm card-break-avoid">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-bold">
                              <BarChart3 className="h-4 w-4 text-purple-600" />
                              {t("results.behavioralAssessment")}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">{t("results.behavioralAssessmentDesc")}</p>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="border border-slate-100 rounded-lg overflow-hidden">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b bg-slate-50">
                                    <th className="py-2 px-3 font-bold uppercase tracking-wider text-slate-700">{t("results.parameter")}</th>
                                    <th className="py-2 px-3 font-bold uppercase tracking-wider text-slate-700 text-center">{t("results.score")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {likertData.map((item: any, idx: number) => {
                                    return (
                                      <tr key={idx} className="border-b last:border-0 hover:bg-slate-50/30">
                                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                                          {t("results.parameter." + item.parameter.toLowerCase().replace(/ /g, ""), { defaultValue: item.parameter })}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                          <span className={cn(
                                            "inline-block px-2 py-1 rounded text-xs font-bold w-12 text-center",
                                            item.score >= 80 ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                                            item.score >= 60 ? "bg-amber-50 text-amber-700 border border-amber-100" :
                                            "bg-rose-50 text-rose-700 border border-rose-100"
                                          )}>
                                            {item.score}%
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <InterviewDataOverlay
                          sessionStatus={summary.data?.status}
                          generating={generating}
                          summaryFailed={summaryGenFailed}
                          onRetry={handleGenerateSummary}
                        >
                          <Card className="shadow-sm card-break-avoid">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2 text-base font-bold">
                                <BarChart3 className="h-4 w-4 text-purple-600" />
                                {t("results.behavioralAssessment")}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground">{t("results.behavioralAssessmentDesc")}</p>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="border border-slate-100 rounded-lg overflow-hidden">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b bg-slate-50">
                                      <th className="py-2 px-3 font-bold uppercase tracking-wider text-slate-700">{t("results.parameter")}</th>
                                      <th className="py-2 px-3 font-bold uppercase tracking-wider text-slate-700 text-center">{t("results.score")}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {likertData.map((item: any, idx: number) => (
                                      <tr key={idx} className="border-b last:border-0">
                                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                                          {t("results.parameter." + item.parameter.toLowerCase().replace(/ /g, ""), { defaultValue: item.parameter })}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                          <span className="inline-block px-2 py-1 rounded text-xs font-bold w-12 text-center bg-slate-50 text-slate-700 border border-slate-100">
                                            {item.score}%
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          </Card>
                        </InterviewDataOverlay>
                      )}
                    </div>

                    {/* Row 2: Core Competencies (Full Width) */}
                    {isSessionAnalyzed ? (
                      <Card className="shadow-sm card-break-avoid">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Target className="h-4 w-4 text-blue-600" />
                            {t("results.coreCompetencies")}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">{t("results.coreCompetenciesDesc")}</p>
                        </CardHeader>
                        <CardContent className="pb-4">
                          {criteriaEvaluations.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 items-center">
                              {/* Left: Chart */}
                              <div className="w-full min-w-0">
                                <CriteriaRadarChart criteria={criteriaEvaluations} />
                              </div>
                              
                              {/* Right: Accordion */}
                              <div className="space-y-3">
                                {criteriaEvaluations.map((ce: any, idx: number) => {
                                  const isExpanded = expandedCompetency === ce.name;
                                  return (
                                    <div key={idx} className="border rounded-lg bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                                      <div 
                                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850"
                                        onClick={() => setExpandedCompetency(isExpanded ? null : ce.name)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{ce.name}</span>
                                          <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <StarRating score={ce.score} />
                                          {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                                        </div>
                                      </div>
                                      {isExpanded && (
                                        <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 italic leading-relaxed">
                                          "{ce.reasoning}"
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <p className="py-10 text-center text-sm text-muted-foreground">{t("results.noCompetencyDataAvailable")}</p>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <InterviewDataOverlay
                          sessionStatus={summary.data?.status}
                          generating={generating}
                          summaryFailed={summaryGenFailed}
                          onRetry={handleGenerateSummary}
                        >
                        <Card className="shadow-sm card-break-avoid">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-bold">
                              <Target className="h-4 w-4 text-blue-600" />
                              {t("results.coreCompetencies")}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">{t("results.coreCompetenciesDesc")}</p>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 items-center">
                              <div className="w-full min-w-0">
                                <div className="h-[360px] md:h-[480px] bg-slate-100 dark:bg-slate-800 rounded-full opacity-40" />
                              </div>
                              <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                  <div key={i} className="border rounded-lg bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm h-16" />
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </InterviewDataOverlay>
                    )}

                    {/* Row 3: Behavioral Analysis Big 5 (Full Width) */}
                    {isSessionAnalyzed ? (
                      <Card className="shadow-sm card-break-avoid">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <BarChart3 className="h-4 w-4 text-purple-600" />
                            {t("results.behavioralAnalysisBig5")}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">{t("results.behavioralAnalysisBig5Desc")}</p>
                        </CardHeader>
                        <CardContent className="pb-4">
                          {big5Personality ? (
                            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 items-center">
                              {/* Left: Chart */}
                              <div className="w-full min-w-0">
                                <Big5RadarChart big5={big5Personality} />
                              </div>
                              
                              {/* Right: Accordion */}
                              <div className="space-y-3">
                                {big5Data.map((trait: any, idx: number) => {
                                  const isExpanded = expandedTrait === trait.name;
                                  return (
                                    <div key={idx} className="border rounded-lg bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                                      <div 
                                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850"
                                        onClick={() => setExpandedTrait(isExpanded ? null : trait.name)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                                            {t("results.personality." + trait.name.toLowerCase(), { defaultValue: trait.name })}
                                          </span>
                                          <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <StarRating score={trait.score} />
                                          {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                                        </div>
                                      </div>
                                      {isExpanded && (
                                        <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 italic leading-relaxed">
                                          "{trait.explanation}"
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                          </div>
                        ) : (
                          <p className="py-10 text-center text-sm text-muted-foreground">{t("results.insufficientSemanticData")}</p>
                        )}
                      </CardContent>
                    </Card>
                    ) : (
                      <InterviewDataOverlay
                          sessionStatus={summary.data?.status}
                          generating={generating}
                          summaryFailed={summaryGenFailed}
                          onRetry={handleGenerateSummary}
                        >
                        <Card className="shadow-sm card-break-avoid">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-bold">
                              <BarChart3 className="h-4 w-4 text-purple-600" />
                              {t("results.behavioralAnalysisBig5")}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">{t("results.behavioralAnalysisBig5Desc")}</p>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 items-center">
                              <div className="w-full min-w-0">
                                <div className="h-[360px] md:h-[480px] bg-slate-100 dark:bg-slate-800 rounded-full opacity-40" />
                              </div>
                              <div className="space-y-3">
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <div key={i} className="border rounded-lg bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm h-16" />
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </InterviewDataOverlay>
                    )}

                    {/* Row 4: Communication Tone & Emotional Presence (Commented Out)
                    {isSessionAnalyzed ? (
                      <Card className="shadow-sm card-break-avoid">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Volume2 className="h-4 w-4 text-rose-600" />
                            {t("results.communicationToneTitle")}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">{t("results.communicationToneDesc")}</p>
                        </CardHeader>
                        <CardContent>
                          <CommunicationToneLineChart segments={toneAnalysis?.segments || []} />
                        </CardContent>
                      </Card>
                    ) : (
                      <InterviewDataOverlay
                          sessionStatus={summary.data?.status}
                          generating={generating}
                          summaryFailed={summaryGenFailed}
                          onRetry={handleGenerateSummary}
                        >
                        <Card className="shadow-sm card-break-avoid">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-bold">
                              <Volume2 className="h-4 w-4 text-rose-600" />
                              {t("results.communicationToneTitle")}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">{t("results.communicationToneDesc")}</p>
                          </CardHeader>
                          <CardContent>
                            <div className="h-48 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                          </CardContent>
                        </Card>
                      </InterviewDataOverlay>
                    )}
                    */}

                    {/* Row 5: Integrity signals | vibe */}
                    {isSessionAnalyzed ? (
                      <div className="grid gap-6 md:grid-cols-2">
                        {/* Integrity signals */}
                        <Card className="shadow-sm card-break-avoid">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-bold">
                              {t("results.integritySignals")}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center justify-between border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <span className="text-sm font-semibold text-slate-700">{t("results.multipleFacesDetect")}</span>
                              <span className={cn(
                                "text-xs font-bold px-2 py-1 rounded",
                                overallIntegrity.multipleFaces === "Clear" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                              )}>
                                {overallIntegrity.multipleFaces === "Clear" ? t("results.integrity.clear") : t("results.integrity.flagged")}
                              </span>
                            </div>
                            <div className="flex items-center justify-between border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <span className="text-sm font-semibold text-slate-700">{t("results.tabSwitchingLog")}</span>
                              <span className={cn(
                                "text-xs font-bold px-2 py-1 rounded",
                                overallIntegrity.tabSwitching === "Clear" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                              )}>
                                {overallIntegrity.tabSwitching === "Clear" ? t("results.integrity.clear") : t("results.integrity.flaggedWithCount", { count: overallIntegrity.tabSwitchCount })}
                              </span>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Vibe */}
                        <Card className="shadow-sm card-break-avoid">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-bold">
                              {t("results.vibe")}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center justify-between border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <span className="text-sm font-semibold text-slate-700">{t("results.overallSentiment")}</span>
                              <span className={cn(
                                "text-xs font-bold px-2 py-1 rounded",
                                sentimentData?.overall?.toLowerCase() === "positive" 
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                  : sentimentData?.overall?.toLowerCase() === "negative"
                                    ? "bg-red-50 text-red-700 border border-red-100"
                                    : "bg-blue-50 text-blue-700 border border-blue-100"
                              )}>
                                {translateSentimentLabel(sentimentData?.overall, t)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <span className="text-sm font-semibold text-slate-700">{t("results.eyeContact")}</span>
                              <span className={cn(
                                "text-xs font-bold px-2 py-1 rounded",
                                overallVibe.eyeContactVal >= 70 
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                  : overallVibe.eyeContactVal >= 40 
                                    ? "bg-amber-50 text-amber-700 border border-amber-100" 
                                    : "bg-red-50 text-red-700 border border-red-100"
                              )}>
                                {overallVibe.eyeContact}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <InterviewDataOverlay
                          sessionStatus={summary.data?.status}
                          generating={generating}
                          summaryFailed={summaryGenFailed}
                          onRetry={handleGenerateSummary}
                        >
                        <div className="grid gap-6 md:grid-cols-2">
                          <Card className="shadow-sm card-break-avoid">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2 text-base font-bold">
                                {t("results.integritySignals")}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {[1, 2].map((i) => (
                                <div key={i} className="flex items-center justify-between border border-slate-100 bg-slate-50/50 rounded-lg p-3 h-12" />
                              ))}
                            </CardContent>
                          </Card>
                          <Card className="shadow-sm card-break-avoid">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2 text-base font-bold">
                                {t("results.vibe")}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {[1, 2].map((i) => (
                                <div key={i} className="flex items-center justify-between border border-slate-100 bg-slate-50/50 rounded-lg p-3 h-12" />
                              ))}
                            </CardContent>
                          </Card>
                        </div>
                      </InterviewDataOverlay>
                    )}

                    {/* Code Submissions & Evaluation — shown in AI result when coding questions exist */}
                    {(() => {
                      const codeMsgs = summary.data?.messages.filter(
                        (m: any) => (m.contentType as string) === "CODE",
                      ) || [];
                      
                      const contents = (summary.data?.interviewContents as any[]) || [];
                      const codingQuestions = contents.filter((c: any) => c.type === 'CODING' || c.type === 'CODE');

                      if (codingQuestions.length === 0) return null;

                      const scoreColor = (s: number) =>
                        s >= 8
                          ? "text-emerald-600 dark:text-emerald-400"
                          : s >= 6
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400";

                      const scoreBarColor = (s: number) =>
                        s >= 8 ? "bg-emerald-500" : s >= 6 ? "bg-amber-500" : "bg-red-500";

                      const scoreBadgeClass = (s: number) =>
                        s >= 8
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                          : s >= 6
                          ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800"
                          : "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800";

                      const dimensions = [
                        { key: "correctness", label: "Correctness" },
                        { key: "efficiency", label: "Efficiency" },
                        { key: "readability", label: "Readability" },
                        { key: "problemSolving", label: "Problem-Solving" },
                      ] as const;

                      return (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Code2 className="h-4 w-4" />
                              Code Submissions &amp; Evaluation
                              <Badge variant="secondary" className="ml-1 font-normal">
                                {codingQuestions.length}{" "}
                                {codingQuestions.length === 1 ? "question" : "questions"}
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-8">
                            <Accordion type="single" collapsible className="w-full space-y-4">
                              {codingQuestions.map((matchingQ: any, idx: number) => {
                                const questionTitle = matchingQ.title || `Coding Question ${idx + 1}`;
                                
                                // Find if there's a code snippet submitted for this question
                                const msg = codeMsgs.find((m: any) => {
                                  const mLabel = (m.whiteboardData?.label as string) || "";
                                  return (
                                    mLabel.toLowerCase() === questionTitle.toLowerCase() ||
                                    (matchingQ.text && mLabel.toLowerCase() === matchingQ.text.toLowerCase()) ||
                                    mLabel.match(/\b(\d+)\b/)?.[1] === matchingQ.order?.toString()
                                  );
                                }) || codeMsgs[idx]; // Fallback to index matching
                                
                                const data = msg?.whiteboardData as Record<string, unknown> | null;
                                const label = (data?.label as string) ?? questionTitle;
                                const code = (data?.code as string) ?? "";
                                const language = (data?.language as string) ?? "plaintext";
                                
                                const codeEval = msg ? (codeEvaluations.find(
                                  (e) => e.snippetLabel?.toLowerCase() === label.toLowerCase()
                                ) ?? codeEvaluations[idx]) : null;

                                const questionContent = matchingQ.text + (matchingQ.description ? "\n\n" + matchingQ.description : "");
                                
                                // Fallback to questionEvaluations for unattempted questions
                                const fallbackQEval = questionEvaluations.find(q => 
                                  q.question === matchingQ.text || 
                                  q.question === matchingQ.title ||
                                  (matchingQ.text && q.question.includes(matchingQ.text.substring(0, 20)))
                                ) || questionEvaluations[matchingQ.order - 1];

                                const overallScore = codeEval?.overall ?? fallbackQEval?.score ?? 0;
                                const evaluationText = codeEval?.evaluation ?? fallbackQEval?.evaluation ?? "Question was not attempted.";

                                return (
                                  <AccordionItem value={`snippet-${idx}`} key={`snippet-${idx}`} className="rounded-xl border bg-card overflow-hidden px-4">
                                    <AccordionTrigger className="hover:no-underline py-4 border-b-0">
                                      <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2">
                                          <Code2 className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm font-semibold text-foreground text-left">{idx + 1}. {label}</span>
                                          {!msg && (
                                            <Badge variant="outline" className="ml-2 text-[10px] text-muted-foreground bg-muted/30">
                                              Unattempted
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-3 pr-2">
                                          {msg && <Badge variant="outline" className="text-[10px] font-normal">{language}</Badge>}
                                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${scoreBadgeClass(overallScore)}`}>
                                            {overallScore}/10
                                          </span>
                                          {msg && (
                                            <span className="text-[10px] text-muted-foreground">
                                              {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                      <div className="pt-2 pb-4 space-y-6">
                                        {questionContent && (
                                          <div className="rounded-lg border bg-muted/20 px-4 py-3">
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Question Description</p>
                                            <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{questionContent}</div>
                                          </div>
                                        )}
                                        {msg && code && (
                                          <div className="border rounded-lg overflow-hidden">
                                            <CodeBlock code={code} language={language} className="text-sm" />
                                          </div>
                                        )}
                                        
                                        <div className="space-y-4">
                                          {msg && codeEval && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                              {dimensions.map(({ key, label: dimLabel }) => {
                                                const score = (codeEval as any)[key] as number;
                                                return (
                                                  <div key={key} className="flex items-center justify-between border rounded-lg px-4 py-3 bg-card shadow-sm">
                                                    <span className="text-sm font-medium text-foreground">{dimLabel}</span>
                                                    <StarRating score={score ?? 0} />
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                          <div className="rounded-lg bg-muted/50 border px-4 py-3 flex items-center justify-between mt-2">
                                            <span className="text-sm font-semibold">Overall Score</span>
                                            <StarRating score={overallScore} />
                                          </div>
                                          {evaluationText && (
                                            <div className="rounded-lg border bg-muted/30 px-4 py-3">
                                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">AI Assessment</p>
                                              <p className="text-sm leading-relaxed text-foreground">{evaluationText}</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </AccordionContent>
                                  </AccordionItem>
                                );
                              })}
                            </Accordion>
                          </CardContent>
                        </Card>
                      );
                    })()}

                    {renderVideoTranscript()}
                  </div>
                )}
            {activeTab === 'transcript' && (<div className='space-y-6'> {/* Whiteboard — shown if any whiteboard messages exist */}
            {(() => {
              const whiteboardMsgs = summary.data?.messages.filter(
                (m: any) =>
                  m.contentType === "WHITEBOARD" && m.whiteboardImageUrl,
              );
              if (!whiteboardMsgs || whiteboardMsgs.length === 0) return null;
              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PenLine className="h-4 w-4" />
                      Whiteboard
                      <Badge variant="secondary" className="ml-1 font-normal">
                        {whiteboardMsgs.length}{" "}
                        {whiteboardMsgs.length === 1 ? "drawing" : "drawings"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {whiteboardMsgs.map((msg: any) => {
                        const label = (
                          msg.whiteboardData as Record<string, unknown> | null
                        )?.label as string | undefined;
                        const alt = label ?? "Whiteboard drawing";
                        return (
                          <button
                            key={msg.id}
                            type="button"
                            className="group overflow-hidden rounded-lg border bg-card p-1.5 text-left transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary/30"
                            onClick={() =>
                              setLightboxImg({
                                src: msg.whiteboardImageUrl!,
                                alt,
                              })
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={msg.whiteboardImageUrl!}
                              alt={alt}
                              className="h-44 w-full rounded object-contain"
                            />
                            <div className="mt-1 flex items-center justify-between px-0.5">
                              {label && (
                                <p className="truncate text-[11px] font-medium text-muted-foreground">
                                  {label}
                                </p>
                              )}
                              <p className="ml-auto text-[10px] text-muted-foreground/60">
                                {new Date(msg.timestamp).toLocaleTimeString(
                                  undefined,
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Anti-cheating integrity log */}
            {antiCheatingLog.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-900">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Integrity Log
                    <Badge variant="outline" className="ml-1 font-normal">
                      {antiCheatingLog.length}{" "}
                      {antiCheatingLog.length === 1 ? "event" : "events"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {(() => {
                      const counts: Record<string, number> = {};
                      for (const v of antiCheatingLog) {
                        let rawType = v.type || "";
                        if (
                          rawType.includes("departureTitle") ||
                          rawType.includes("departure") ||
                          rawType.includes("tab_switch") ||
                          rawType.includes("focus_lost")
                        ) {
                          rawType = "page_departure";
                        } else if (rawType.includes("paste")) {
                          rawType = "paste";
                        } else if (
                          rawType.includes("multiScreen") ||
                          rawType.includes("multi_screen")
                        ) {
                          rawType = "multi_screen";
                        }

                        const label =
                          rawType === "page_departure"
                            ? "Page departure"
                            : rawType === "tab_switch"
                              ? "Page departure"
                              : rawType === "focus_lost"
                                ? "Page departure"
                                : rawType === "paste"
                                  ? "External paste blocked"
                                  : rawType === "multi_screen"
                                    ? "Multi-screen detected"
                                    : rawType;
                        counts[label] = (counts[label] || 0) + 1;
                      }
                      return Object.entries(counts).map(([label, count]) => (
                        <div
                          key={label}
                          className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-1.5 text-sm dark:bg-amber-950/20"
                        >
                          <span className="text-amber-800 dark:text-amber-300">
                            {label}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {count}
                          </Badge>
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}


            {/* Screenshots */}
            {(() => {
              const screenshots = summary.data?.screenshots as
                | {
                    url: string;
                    path: string;
                    timestamp: string;
                    type: "camera" | "screen";
                  }[]
                | null;
              if (!screenshots || screenshots.length === 0) return null;
              const cameraShots = screenshots.filter(
                (s) => s.type === "camera",
              );
              const screenShots = screenshots.filter(
                (s) => s.type === "screen",
              );
              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Camera className="h-4 w-4" />
                      {t("results.interviewScreenshots")}
                      <Badge variant="secondary" className="ml-1 font-normal">
                        {screenshots.length}{" "}
                        {t("results.screenshots.captureCount", { count: screenshots.length })}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {cameraShots.length > 0 && (
                      <div>
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                          <Camera className="h-3.5 w-3.5" />
                          {t("results.camera")}
                        </p>
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                          {cameraShots.map((shot, i) => (
                            <button
                              key={i}
                              type="button"
                              className="group overflow-hidden rounded-lg border bg-card p-1 text-left transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary/30"
                              onClick={() =>
                                setLightboxImg({
                                  src: shot.url,
                                  alt: `Camera screenshot at ${new Date(shot.timestamp).toLocaleTimeString()}`,
                                })
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={shot.url}
                                alt={`Camera at ${new Date(shot.timestamp).toLocaleTimeString()}`}
                                className="h-24 w-full rounded object-cover"
                              />
                              <p className="mt-0.5 text-center text-[10px] text-muted-foreground/60">
                                {new Date(shot.timestamp).toLocaleTimeString(
                                  undefined,
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {screenShots.length > 0 && (
                      <div>
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                          <Monitor className="h-3.5 w-3.5" />
                          {t("results.screen")}
                        </p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {screenShots.map((shot, i) => (
                            <button
                              key={i}
                              type="button"
                              className="group overflow-hidden rounded-lg border bg-card p-1 text-left transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary/30"
                              onClick={() =>
                                setLightboxImg({
                                  src: shot.url,
                                  alt: `Screen screenshot at ${new Date(shot.timestamp).toLocaleTimeString()}`,
                                })
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={shot.url}
                                alt={`Screen at ${new Date(shot.timestamp).toLocaleTimeString()}`}
                                className="h-36 w-full rounded object-cover"
                              />
                              <p className="mt-0.5 text-center text-[10px] text-muted-foreground/60">
                                {new Date(shot.timestamp).toLocaleTimeString(
                                  undefined,
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            </div>)} {activeTab === 'cv_analysis' && (() => {
              const rawCvAnalysis = (summary.data?.candidateProfile as any)?.cvAnalysis;
              let cvAnalysis: any = null;
              if (rawCvAnalysis && typeof rawCvAnalysis === "object") {
                cvAnalysis = rawCvAnalysis;
              } else if (rawCvAnalysis && typeof rawCvAnalysis === "string") {
                try {
                  cvAnalysis = JSON.parse(rawCvAnalysis);
                } catch {
                  // ignore
                }
              }
              if (!cvAnalysis) {
                return (
                  <div className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[400px]">
                    <div className="mb-4 rounded-full bg-muted p-6">
                      <FileText className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">{t("results.noCvUploaded")}</h3>
                    <p className="mb-6 text-sm text-muted-foreground max-w-sm">
                      {t("results.uploadCvPrompt")}
                    </p>
                    <div className="flex gap-4">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={handleCvFileChange}
                        className="hidden"
                        id="empty-cv-upload"
                      />
                      <label htmlFor="empty-cv-upload">
                        <Button 
                          asChild
                          disabled={isAnalyzingCv || isViewer}
                          variant="default"
                        >
                          <span className="cursor-pointer flex items-center">
                            {isAnalyzingCv ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("results.analyzing")}
                              </>
                            ) : (
                              <>
                                <Upload className="mr-2 h-4 w-4" />
                                {t("results.uploadCv")}
                              </>
                            )}
                          </span>
                        </Button>
                      </label>
                    </div>
                  </div>
                );
              }

              // Helper to find raw factor score
              const findRawFactor = (names: string[]) => {
                const item = (cvAnalysis.scoreBreakdown || []).find((f: any) =>
                  names.some((name) => f.factor?.toLowerCase().includes(name.toLowerCase()))
                );
                return item || { points: 0, reason: "" };
              };

              // Compute clean normalized score out of 10
              const openSourceItem = findRawFactor(["open source"]);
              const openSourceScore = (openSourceItem.points / 35) * 10;

              const selfProjectsItem = findRawFactor(["self projects"]);
              const selfProjectsScore = (selfProjectsItem.points / 30) * 10;

              const productionItem = findRawFactor(["production"]);
              const productionScore = (productionItem.points / 25) * 10;

              const technicalSkillsItem = findRawFactor(["technical skills"]);
              const technicalSkillsScore = technicalSkillsItem.points; // already out of 10

              // Job alignment score (weighted or simple average of all JD-related factors)
              const jdFactors = (cvAnalysis.scoreBreakdown || []).filter((f: any) =>
                f.factor?.toLowerCase().includes("jd ") || f.factor?.toLowerCase().includes("job ")
              );
              const jdScore = jdFactors.length > 0 
                ? (jdFactors.reduce((acc: number, f: any) => acc + (f.points || 0), 0) / jdFactors.length) / 10 
                : 0;

              // Technical profile strength (overall rubric normalization)
              const techProfileItem = findRawFactor(["technical profile"]);
              const techProfileScore = techProfileItem.points / 10; // out of 100 -> out of 10

              // Helper to score a general marking/evaluation criterion
              const scoreForCriterion = (name: string): number => {
                const lower = name.toLowerCase();
                let foundScore: number | null = null;

                if (lower.includes("communication") || lower.includes("clarity")) {
                  const item = findRawFactor(["communication"]);
                  if (item.points) foundScore = item.points;
                } else if (lower.includes("problem") || lower.includes("solve") || lower.includes("intellectual") || lower.includes("agility") || lower.includes("analytical")) {
                  const item = findRawFactor(["intellectual", "agility", "velocity"]);
                  if (item.points) foundScore = item.points;
                } else if (lower.includes("experience") || lower.includes("production") || lower.includes("suitability") || lower.includes("career")) {
                  const item = findRawFactor(["experience", "readiness", "progression", "production"]);
                  if (item.points) foundScore = (item.points > 10 ? item.points / 10 : item.points);
                } else if (lower.includes("technical") || lower.includes("code") || lower.includes("programming") || lower.includes("skill")) {
                  const item = findRawFactor(["technical skills", "technical profile"]);
                  if (item.points) foundScore = (item.points > 10 ? item.points / 10 : item.points);
                } else if (lower.includes("alignment") || lower.includes("fit") || lower.includes("role") || lower.includes("job")) {
                  const item = findRawFactor(["role alignment", "alignment"]);
                  if (item.points) foundScore = item.points;
                }

                if (foundScore !== null) {
                  return Math.max(0, Math.min(10, foundScore));
                }

                // Fallback: overallScore / 10 with deterministic variation
                const base = (cvAnalysis.overallScore || 70) / 10;
                const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const offset = ((hash % 7) - 3) * 0.4; // range [-1.2, 1.2]
                return Math.max(1, Math.min(10, Math.round((base + offset) * 10) / 10));
              };

              // Graph 1: Assessment Rubrics — prefer configured cvAssessmentCriteria,
              // merge scored scoreBreakdown values (missing → 0).
              const defaultCriteria = [
                { name: "Core Skills", description: "Core domain skills required for the role." },
                { name: "Problem Solving", description: "Analytical approach to complex tasks." },
                { name: "Professional Suitability", description: "Readiness for a professional environment." },
              ];

              const configuredAssessment = normalizeCvCriteria(
                (summary.data as any)?.cvAssessmentCriteria,
              );

              // Build scored rubrics from scoreBreakdown returned by the backend
              const breakdownRubrics: { subject: string; score: number; description: string }[] = (cvAnalysis.scoreBreakdown || [])
                .filter((f: any) => f?.factor && typeof f?.points === 'number')
                // Exclude meta-aggregation rows and score modifiers from the radar chart
                .filter((f: any) => {
                  const label = f.factor.toLowerCase();
                  return !label.includes('weight)') && !label.includes('deduction') && !label.includes('bonus');
                })
                .slice(0, 8)
                .map((f: any) => ({
                  subject: f.factor,
                  score: Math.max(0, Math.min(10, Math.round((f.points / 2) * 10) / 10)),
                  description: (f.description || f.reason || "").trim(),
                }));

              // Fallback scored list when breakdown is sparse and no configured criteria exist
              const fallbackRubrics = (() => {
                const interviewCriteria = (summary.data?.assessmentCriteria || [])
                  .filter((c: any) => c && typeof c === 'object' && c.name)
                  .map((c: any) => ({ name: c.name, description: c.description || "" }));
                const rubricsList: { name: string; description: string }[] = [];
                for (const c of interviewCriteria) {
                  if (rubricsList.length < 8 && !rubricsList.some(r => r.name.toLowerCase() === c.name.toLowerCase())) {
                    rubricsList.push(c);
                  }
                }
                for (const c of defaultCriteria) {
                  if (rubricsList.length >= 5) break;
                  if (!rubricsList.some(r => r.name.toLowerCase() === c.name.toLowerCase())) {
                    rubricsList.push(c);
                  }
                }
                return rubricsList.map(c => ({
                  subject: c.name,
                  score: scoreForCriterion(c.name),
                  description: c.description || "",
                }));
              })();

              const scoredRubrics =
                breakdownRubrics.length > 0 ? breakdownRubrics : fallbackRubrics;

              const rubrics =
                configuredAssessment.length > 0
                  ? mergeCvAssessmentRubrics(configuredAssessment, scoredRubrics)
                  : scoredRubrics.length >= 3
                    ? scoredRubrics
                    : fallbackRubrics;

              // Graph 2: JD Alignment — prefer configured cvJdAlignmentCriteria,
              // merge matchingMatrix values (missing → 0).
              const configuredJd = normalizeCvCriteria(
                (summary.data as any)?.cvJdAlignmentCriteria,
              );

              const matrixRows: {
                subject: string;
                score: number;
                fullRequirement: string;
                description: string;
                coverage?: string;
                evidence?: string;
              }[] = (cvAnalysis.matchingMatrix || []).slice(0, 8).map((m: any) => ({
                subject:
                  m.label ||
                  (m.requirement?.length > 28
                    ? m.requirement.slice(0, 28) + "…"
                    : m.requirement || "Requirement"),
                fullRequirement: m.requirement || m.label || "Requirement",
                description: (m.description || m.requirement || "").trim(),
                score: coverageToRadarScore(m.coverage),
                coverage: m.coverage || "Missing",
                evidence: (m.evidence || "").trim(),
              }));

              const defaultJdParams = [
                { subject: "Experience Fit", fullRequirement: "Experience Fit", description: "Overall years and relevance of experience for the role.", score: Math.max(1, Math.min(10, (cvAnalysis.overallScore || 65) / 10)) },
                { subject: "Skills Alignment", fullRequirement: "Skills Alignment", description: "Match between required hard skills and resume evidence.", score: Math.max(1, Math.min(10, (cvAnalysis.overallScore || 65) / 10)) },
                { subject: "Education", fullRequirement: "Education", description: "Credentials and education against JD requirements.", score: Math.max(1, Math.min(10, (cvAnalysis.overallScore || 65) / 10)) },
                { subject: "Responsibilities", fullRequirement: "Responsibilities", description: "Overlap with core job responsibilities in the JD.", score: Math.max(1, Math.min(10, (cvAnalysis.overallScore || 65) / 10)) },
                { subject: "Domain Fit", fullRequirement: "Domain Fit", description: "Domain / industry experience relevant to the role.", score: Math.max(1, Math.min(10, (cvAnalysis.overallScore || 65) / 10)) },
              ];

              const scoredJd = matrixRows.length > 0 ? matrixRows : defaultJdParams;

              const profile =
                configuredJd.length > 0
                  ? mergeJdAlignmentProfile(configuredJd, scoredJd)
                  : matrixRows.length >= 2
                    ? matrixRows
                    : defaultJdParams;

              const computedCvScore = getDynamicCvScore(cvAnalysis, summary.data) ?? cvAnalysis.overallScore ?? 0;

              // Evidence table: all configured JD rows (or raw matrix if none configured)
              const evidenceRows =
                configuredJd.length > 0
                  ? profile.map((r) => ({
                      requirement: r.fullRequirement || r.subject,
                      evidence: r.evidence || "No evidence found in CV analysis.",
                      coverage: r.coverage || "Missing",
                    }))
                  : (cvAnalysis.matchingMatrix || []);

              return (
                <div className="space-y-6">
                  {/* Row 1: CV Score & Summary Details */}
                  <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-start">
                        {/* Left Circle Score */}
                        <div className="flex flex-col items-center justify-center space-y-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">CV Score</p>
                          <CvScoreGauge score={computedCvScore} />
                          
                          {/* Seniority badge (placed under circle gauge) */}
                          <div className="text-center w-full pt-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-450 mb-1.5">Seniority</p>
                            <Badge className="bg-slate-100 hover:bg-slate-100 text-slate-700 font-bold border rounded-full px-3 py-1 text-xs">
                              {cvAnalysis.estimatedSeniority}
                            </Badge>
                          </div>

                          {(() => {
                            const verdictText = cvAnalysis.verdict || "Move aside";
                            const lower = verdictText.toLowerCase();
                            const isHighPotential = lower.includes("potential") || lower.includes("shortlist") || lower.includes("accept") || lower.includes("high");
                            const isToConsider = lower.includes("consider") || lower.includes("maybe");

                            if (isHighPotential) {
                              return (
                                <button
                                  type="button"
                                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mt-2 transition-colors"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  {verdictText}
                                </button>
                              );
                            } else if (isToConsider) {
                              return (
                                <button
                                  type="button"
                                  className="text-xs font-bold text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mt-2 transition-colors"
                                >
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  {verdictText}
                                </button>
                              );
                            } else {
                              return (
                                <button
                                  type="button"
                                  className="text-xs font-bold text-red-500 hover:text-red-600 dark:text-red-400 flex items-center gap-1.5 mt-2 transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  {verdictText}
                                </button>
                              );
                            }
                          })()}
                        </div>

                        {/* Right Detail Blocks */}
                        <div className="space-y-5">
                          {/* AI Summary */}
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">AI Summary</p>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                              {(cvAnalysis.overallSummary || "").replace(/Overall fit \d+\/100/i, `Overall fit ${computedCvScore}/100`)}
                            </p>
                          </div>

                          {/* Recommendations (spanning full width under summary and progress) */}
                          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Recommendations</p>
                            <ul className="space-y-2.5 text-xs font-semibold text-slate-650 dark:text-slate-350 list-none">
                              {(cvAnalysis.areasToValidate || []).map((rec: string, rIdx: number) => (
                                <li key={rIdx} className="flex items-start gap-1.5 leading-relaxed">
                                  <span className="text-slate-400 font-bold select-none mt-0.5">›</span>
                                  <span>{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Row 2: Requirements vs. CV Evidence Table (Placed just under overall score card) */}
                  <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden animate-fade-in">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                        <span className="text-purple-600">🎯</span> Requirements vs. CV Evidence
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b bg-slate-50 dark:bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4 w-1/3">Requirement</th>
                              <th className="py-3 px-4 w-1/2">Evidence in CV</th>
                              <th className="py-3 px-4 text-center">Coverage</th>
                            </tr>
                          </thead>
                          <tbody>
                            {evidenceRows.map((m: any, idx: number) => {
                              const isMissing = m.coverage === "Missing" || m.coverage === "No";
                              const isYes = m.coverage === "Yes";
                              return (
                                <tr key={idx} className="border-b last:border-0 hover:bg-slate-50/30">
                                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white leading-relaxed">{m.requirement}</td>
                                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 leading-relaxed font-semibold">{m.evidence}</td>
                                  <td className="py-3 px-4 text-center shrink-0">
                                    <span className={cn(
                                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black border uppercase tracking-wider",
                                      isYes 
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                        : isMissing 
                                          ? "bg-red-50 border-red-200 text-red-700" 
                                          : "bg-amber-50 border-amber-200 text-amber-700"
                                    )}>
                                      {isYes ? "✓ Yes" : isMissing ? "✕ Missing" : "~ Partial"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Row 3: Assessment Rubrics (Full width card with StarRating lists, at bottom of page) */}
                  <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden animate-fade-in">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        Assessment Rubrics ({rubrics.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 items-center">
                        <div className="w-full min-w-0">
                          <CvRadarChart data={rubrics} />
                        </div>
                        <div className="space-y-4">
                          {rubrics.map((r: any, rIdx: number) => (
                            <details
                              key={rIdx}
                              className="group rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-850 dark:bg-slate-950"
                            >
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                                <span className="text-sm font-bold text-slate-800 dark:text-slate-250">
                                  {r.subject}
                                  <span className="ml-1.5 text-xs font-medium text-slate-400 group-open:hidden">▾</span>
                                  <span className="ml-1.5 hidden text-xs font-medium text-slate-400 group-open:inline">▴</span>
                                </span>
                                <div className="shrink-0">
                                  <StarRating score={r.score} size="md" />
                                </div>
                              </summary>
                              {r.description ? (
                                <p className="mt-2.5 border-t border-slate-200/70 pt-2.5 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                  {r.description}
                                </p>
                              ) : null}
                            </details>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Row 4: Job Description Alignment (Full width card with StarRating lists, at bottom of page) */}
                  <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden animate-fade-in">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        Job Description Alignment ({profile.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 items-center">
                        <div className="w-full min-w-0">
                          <CvRadarChart data={profile} />
                        </div>
                        <div className="space-y-4">
                          {profile.map((r: any, rIdx: number) => (
                            <details
                              key={rIdx}
                              className="group rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-850 dark:bg-slate-950"
                            >
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                                <span className="text-sm font-bold text-slate-800 dark:text-slate-250">
                                  {r.subject}
                                  <span className="ml-1.5 text-xs font-medium text-slate-400 group-open:hidden">▾</span>
                                  <span className="ml-1.5 hidden text-xs font-medium text-slate-400 group-open:inline">▴</span>
                                </span>
                                <div className="shrink-0">
                                  <StarRating score={r.score} size="md" />
                                </div>
                              </summary>
                              {(r.description || r.fullRequirement) ? (
                                <p className="mt-2.5 border-t border-slate-200/70 pt-2.5 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                  {r.description || r.fullRequirement}
                                </p>
                              ) : null}
                            </details>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
            {activeTab === 'hr_comments' && (
              <div className='space-y-6'>
                {(() => {
                  const canComment = !!candidateRecordId;
                  return (
                    <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-200">
                          <MessageCircle className="h-4 w-4 text-slate-500" />
                          {t("results.hrComments")}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {t("results.internalNotesVisibleOnly")}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Existing comments thread */}
                        {existingHrComments.length > 0 ? (
                          <div className="space-y-3">
                            {existingHrComments.map((c: any, i: number) => (
                              <div
                                key={c.id ?? i}
                                className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4 space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    {c.author || "HR Manager"}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {c.score !== undefined && c.score !== null && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-extrabold text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                                        {Number(c.score).toFixed(1)}/10
                                      </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground tabular-nums">
                                      {c.createdAt
                                        ? new Date(c.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })
                                        : ""}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                                  {c.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            {t("results.noCommentsYet")}
                          </p>
                        )}

                        {/* New comment input */}
                        {true && (
                          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                            <textarea
                              id="hr-comment-textarea"
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40 min-h-[80px]"
                              placeholder={isViewer ? t("results.viewersCannotAddComments") : t("results.addInternalHrNote")}
                              value={hrCommentText}
                              onChange={(e) => setHrCommentText(e.target.value)}
                              disabled={isViewer}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                  e.preventDefault();
                                  handleAddHrComment();
                                }
                              }}
                            />
                            <div className="flex flex-col gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                              <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <label
                                    htmlFor="hr-comment-score"
                                    className="text-xs font-semibold text-slate-500 whitespace-nowrap"
                                  >
                                    {t("results.scoreModifier")}
                                  </label>
                                  <div className="flex items-center gap-1">
                                    {/* Minus Modifier Button */}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 rounded-lg border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors font-bold text-sm"
                                      disabled={isViewer}
                                      onClick={() => {
                                        const current = parseFloat(hrCommentScore || "0");
                                        setHrCommentScore((current - 0.5).toFixed(1));
                                      }}
                                    >
                                      -
                                    </Button>
 
                                    {/* Modifier text input */}
                                    <input
                                      id="hr-comment-score"
                                      type="text"
                                      className="w-16 h-8 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-background text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                                      placeholder="0.0"
                                      value={hrCommentScore}
                                      onChange={(e) => setHrCommentScore(e.target.value)}
                                      disabled={isViewer}
                                    />
 
                                    {/* Plus Modifier Button */}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 rounded-lg border-slate-200 text-slate-500 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition-colors font-bold text-sm"
                                      disabled={isViewer}
                                      onClick={() => {
                                        const current = parseFloat(hrCommentScore || "0");
                                        setHrCommentScore((current + 0.5).toFixed(1));
                                      }}
                                    >
                                      +
                                    </Button>
                                  </div>
                                </div>

                                {/* Dynamic Score Preview */}
                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 ml-1">
                                  <span>{t("results.base")}: {overallScore !== null ? overallScore.toFixed(1) : "0.0"}</span>
                                  <span>+</span>
                                  <span>{t("results.modifier")}: {parseFloat(hrCommentScore || "0").toFixed(1)}</span>
                                  <span>=</span>
                                  <span className="text-xs font-black text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-100 dark:border-purple-900/50">
                                    {t("results.finalScore")}: {Math.max(0, Math.min(10, (overallScore || 0) + parseFloat(hrCommentScore || "0"))).toFixed(1)}/10
                                  </span>
                                </div>

                                <div className="ml-auto">
                                  <Button
                                    id="hr-add-comment-btn"
                                    size="sm"
                                    className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-4 py-2 font-bold"
                                    onClick={handleAddHrComment}
                                    disabled={!hrCommentText.trim() || savingComment || isViewer}
                                  >
                                    {savingComment ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                    ) : null}
                                    {savingComment ? t("results.submitting") : t("results.addComment")}
                                  </Button>
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Tip: Ctrl+Enter to save quickly.</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            )}

            {/* Transcript — shown only during PDF export or as fallback */}
            {pdfCapture && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Full Transcript
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {summary.data?.messages
                      .filter(
                        (m: any) =>
                          m.contentType !== "WHITEBOARD" &&
                          (m.contentType as string) !== "CODE",
                      )
                      .map((msg: any) => {
                        const isUser = msg.role === "USER";
                        return (
                          <div
                            key={msg.id}
                            className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
                          >
                            <div
                              className={`max-w-[75%] rounded-lg px-4 py-2.5 ${
                                isUser
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary-100 dark:bg-secondary text-secondary-900 dark:text-secondary-foreground"
                              }`}
                            >
                              <div className="mb-1 flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold">
                                  {isUser ? "Participant" : "Interviewer"}
                                </span>
                                <span className="text-[10px]">
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-sm leading-relaxed">
                                {msg.content}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}
            </div>
            {/* End Right Content */}
            </div>
            {/* End Grid */}
            </div>
          )}
        </div>
      )}

      {/* End interview confirmation for in-progress sessions */}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              End interview and generate report?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This interview is still in progress. Generating the report will
              end the interview — the candidate will no longer be able to
              continue. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmEndAndGenerate();
              }}
              disabled={generating || completeSession.isPending}
            >
              {generating || completeSession.isPending
                ? "Working..."
                : "End Interview & Generate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox overlay for whiteboard drawings */}
      {lightboxImg && (
        <div
          className="!m-0 fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxImg(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            onClick={() => setLightboxImg(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxImg.src}
            alt={lightboxImg.alt}
            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
