/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAppLocale } from "@/components/app-locale-provider";
import { useOrg } from "@/components/org-provider";
import { exportToXlsx } from "@/lib/export-xlsx";
import { compareCandidateTieBreakers } from "@/lib/candidate-ranking";
import { getSessionOverallScore } from "@/lib/session-score";
import { getDynamicCvScore } from "@/lib/cv-criteria";
import { trpc } from "@/lib/trpc/client";
import { getCvAnalysisCost } from "@/lib/interview-credits";
import { copyToClipboard, cn } from "@/lib/utils";
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Calendar,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    ClipboardList,
    Clock,
    Download,
    FileSpreadsheet,
    FileText,
    GripVertical,
    Link as LinkIcon,
    Loader2,
    Plus,
    Search,
    Settings,
    StopCircle,
    Trash2,
    UserCheck,
    UserPlus,
    Users,
    X,
    Mail,
    RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandidateCreateDialog } from "./candidate-create-dialog";
import { CandidateImportDialog } from "./candidate-import-dialog";
import { ResumeImportDialog } from "./resume-import-dialog";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CandidateManagerProps {
  interviewId: string;
  interview?: any;
  onViewParticipant: (id: string, type: "session" | "candidate") => void;
}

type CandidateRow = {
  type: "candidate";
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  gender: string | null;
  birthday: string | null;
  education: string | null;
  school: string | null;
  major: string | null;
  graduationYear: number | null;
  workExperience: string | null;
  notes: string | null;
  inviteToken: string | null;
  session: any;
  createdAt: string;
  invitedAt: string | null;
  cvAnalysis?: any;
  evaluationStatus: string | null;
};

type WalkInRow = {
  type: "walkin";
  id: string;
  email: string | null;
  name: string | null;
  session: any;
  evaluationStatus?: string | null;
};

type UnifiedRow = CandidateRow | WalkInRow;

type SortKey =
  | "name"
  | "email"
  | "phone"
  | "gender"
  | "birthday"
  | "education"
  | "school"
  | "major"
  | "gradYear"
  | "experience"
  | "notes"
  | "cvScore"
  | "interviewScore"
  | "source"
  | "status"
  | "outcome";

type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

type ColumnDef = {
  key: string;
  label: string;
  sortKey?: SortKey;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
};

const COLUMNS: ColumnDef[] = [
  {
    key: "name",
    label: "Name",
    sortKey: "name",
    defaultVisible: true,
    alwaysVisible: true,
  },
  { key: "email", label: "Email", sortKey: "email", defaultVisible: true },
  { key: "phone", label: "Phone", sortKey: "phone", defaultVisible: false },
  { key: "gender", label: "Gender", sortKey: "gender", defaultVisible: false },
  {
    key: "birthday",
    label: "Birthday",
    sortKey: "birthday",
    defaultVisible: false,
  },
  {
    key: "education",
    label: "Education",
    sortKey: "education",
    defaultVisible: false,
  },
  { key: "school", label: "School", sortKey: "school", defaultVisible: false },
  { key: "major", label: "Major", sortKey: "major", defaultVisible: false },
  {
    key: "gradYear",
    label: "Grad Year",
    sortKey: "gradYear",
    defaultVisible: false,
  },
  {
    key: "experience",
    label: "Experience",
    sortKey: "experience",
    defaultVisible: false,
  },
  { key: "notes", label: "Notes", sortKey: "notes", defaultVisible: false },
  { key: "cvScore", label: "Resume Score", sortKey: "cvScore", defaultVisible: true },
  { key: "interviewScore", label: "Interview Score", sortKey: "interviewScore", defaultVisible: true },
  { key: "source", label: "Source", sortKey: "source", defaultVisible: true },
  { key: "status", label: "Status", sortKey: "status", defaultVisible: true },
  { key: "outcome", label: "Outcome", sortKey: "outcome", defaultVisible: true },
];

const DEFAULT_VISIBLE = new Set(
  COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
);

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const TIME_RANGE_OPTIONS = [
  { value: "ALL", label: "All Time" },
  { value: "1d", label: "Past 1 day" },
  { value: "3d", label: "Past 3 days" },
  { value: "7d", label: "Past 7 days" },
  { value: "14d", label: "Past 14 days" },
  { value: "30d", label: "Past 30 days" },
  { value: "90d", label: "Past 90 days" },
] as const;

function getTimeRangeCutoff(value: string): Date | null {
  const now = Date.now();
  const ms: Record<string, number> = {
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "14d": 14 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  if (!ms[value]) return null;
  return new Date(now - ms[value]);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSessionStatus(row: UnifiedRow): string {
  const session = row.session;
  if (!session) return "Not Started";
  return session.status;
}

function getSessionBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "IN_PROGRESS":
      return "outline";
    case "ABANDONED":
      return "destructive";
    default:
      return "secondary";
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStartDate(row: UnifiedRow): string | null {
  const s = row.session;
  if (!s) return null;
  return s.startedAt ?? s.createdAt ?? null;
}

function getCandidateField(row: UnifiedRow): CandidateRow | null {
  return row.type === "candidate" ? (row as CandidateRow) : null;
}

function getCvScore(row: UnifiedRow, interview?: any): number | null {
  const c = getCandidateField(row);
  if (!c?.cvAnalysis) return null;
  let analysis = c.cvAnalysis;
  if (typeof analysis === "string") {
    try {
      analysis = JSON.parse(analysis);
    } catch {
      return null;
    }
  }

  let summary = row.session?.summary;
  if (typeof summary === "string") {
    try {
      summary = JSON.parse(summary);
    } catch {
      summary = null;
    }
  }

  const mergedSummary = {
    ...(summary || {}),
    cvAssessmentCriteria: interview?.cvAssessmentCriteria,
    cvJdAlignmentCriteria: interview?.cvJdAlignmentCriteria,
  };

  const dynamicScore = getDynamicCvScore(analysis, mergedSummary);
  if (dynamicScore !== null && dynamicScore !== undefined) {
    return dynamicScore;
  }

  if (analysis?.overallScore !== undefined) {
    return Number(analysis.overallScore);
  }
  return null;
}

function getInterviewScore(row: UnifiedRow): number | null {
  const session = row.session;
  
  // Check candidate's direct hrComments first
  const rowComments = (row as any).hrComments || [];
  if (Array.isArray(rowComments) && rowComments.length > 0) {
    const hrScoreComment = [...rowComments].reverse().find((c: any) => c.score !== undefined && c.score !== null);
    if (hrScoreComment) {
      return Number(hrScoreComment.score);
    }
  }

  if (session?.metadata) {
    let meta = session.metadata;
    if (typeof meta === "string") {
      try { meta = JSON.parse(meta); } catch {}
    }
    const hrComments = (meta as any)?.hrComments || [];
    const hrScoreComment = [...hrComments].reverse().find((c: any) => c.score !== undefined && c.score !== null);
    if (hrScoreComment) {
      return Number(hrScoreComment.score);
    }
  }

  if (!session?.insights) return null;
  return getSessionOverallScore(
    session.insights as {
      questionEvaluations?: { score: number }[];
      criteriaEvaluations?: { score: number }[];
    },
  );
}

function getSortValue(row: UnifiedRow, key: SortKey, interview?: any): string | number {
  const c = getCandidateField(row);
  switch (key) {
    case "name":
      return (row.name ?? "").toLowerCase();
    case "email":
      return (row.email ?? "").toLowerCase();
    case "phone":
      return (c?.phone ?? "").toLowerCase();
    case "gender":
      return (c?.gender ?? "").toLowerCase();
    case "birthday":
      return c?.birthday ?? "";
    case "education":
      return (c?.education ?? "").toLowerCase();
    case "school":
      return (c?.school ?? "").toLowerCase();
    case "major":
      return (c?.major ?? "").toLowerCase();
    case "gradYear":
      return c?.graduationYear ?? -1;
    case "experience":
      return (c?.workExperience ?? "").toLowerCase();
    case "notes":
      return (c?.notes ?? "").toLowerCase();
    case "cvScore":
      return getCvScore(row, interview) ?? -1;
    case "interviewScore":
      return getInterviewScore(row) ?? -1;
    case "source":
      if (row.type === "walkin") return "Walk-in";
      const cSort = getCandidateField(row);
      return cSort?.invitedAt ? "Invited" : "Added";
    case "status":
      return getSessionStatus(row);
  }
  return "";
}

/* ------------------------------------------------------------------ */
/*  Sortable Header                                                    */
/* ------------------------------------------------------------------ */

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  direction: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  return (
    <TableHead
      className="group cursor-pointer select-none whitespace-nowrap hover:text-foreground"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-40" />
        )}
      </span>
    </TableHead>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CandidateManager({
  interviewId,
  interview,
  onViewParticipant,
}: CandidateManagerProps) {
  const { toast } = useToast();
  const { t } = useAppLocale();
  const utils = trpc.useUtils();
  const { data: creditRates } = trpc.creditRates.list.useQuery();
  const cvAnalysisCost = getCvAnalysisCost(creditRates);

  const columnLabel: Record<string, string> = {
    name: t("candidates.columns.name"),
    email: t("candidates.columns.email"),
    phone: t("candidates.columns.phone"),
    gender: t("candidates.columns.gender"),
    birthday: t("candidates.columns.birthday"),
    education: t("candidates.columns.education"),
    school: t("candidates.columns.school"),
    major: t("candidates.columns.major"),
    gradYear: t("candidates.columns.gradYear"),
    experience: t("candidates.columns.experience"),
    notes: t("candidates.columns.notes"),
    cvScore: t("candidates.columns.resumeScore"),
    interviewScore: t("candidates.columns.interviewScore"),
    source: t("candidates.columns.source"),
    status: t("candidates.columns.status"),
    outcome: t("candidates.columns.outcome"),
  };

  // ── State ──
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [timeRange, setTimeRange] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey | null>("cvScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSendEmail, setConfirmSendEmail] = useState(false);
  const [endSessionTarget, setEndSessionTarget] = useState<{
    sessionId: string;
    name: string | null;
  } | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [resumeImportOpen, setResumeImportOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] =
    useState<Set<string>>(DEFAULT_VISIBLE);
  const [rescanProgressOpen, setRescanProgressOpen] = useState(false);
  const [rescanProgressPercent, setRescanProgressPercent] = useState(0);
  const [rescanProgressProcessed, setRescanProgressProcessed] = useState(0);
  const [rescanProgressTotal, setRescanProgressTotal] = useState(0);
  const [rescanInProgress, setRescanInProgress] = useState(false);
  const rescanProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    COLUMNS.map((c) => c.key),
  );

  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Column reorder via document-level pointer tracking ──
  const [draggingCol, setDraggingCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const draggingColRef = useRef<string | null>(null);
  const dragOverColRef = useRef<string | null>(null);

  const handleGripPointerDown = useCallback(
    (key: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      draggingColRef.current = key;
      dragOverColRef.current = null;
      setDraggingCol(key);
      setDragOverCol(null);
    },
    [],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingColRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest<HTMLElement>("[data-col-key]");
      const key = row?.dataset.colKey ?? null;
      if (
        key &&
        key !== draggingColRef.current &&
        key !== dragOverColRef.current
      ) {
        dragOverColRef.current = key;
        setDragOverCol(key);
      } else if (!key && dragOverColRef.current) {
        dragOverColRef.current = null;
        setDragOverCol(null);
      }
    };

    const onPointerUp = () => {
      const src = draggingColRef.current;
      const tgt = dragOverColRef.current;
      if (src && tgt && src !== tgt) {
        setColumnOrder((prev) => {
          const next = [...prev];
          const srcIdx = next.indexOf(src);
          const tgtIdx = next.indexOf(tgt);
          if (srcIdx === -1 || tgtIdx === -1) return prev;
          next.splice(srcIdx, 1);
          next.splice(tgtIdx, 0, src);
          return next;
        });
      }
      draggingColRef.current = null;
      dragOverColRef.current = null;
      setDraggingCol(null);
      setDragOverCol(null);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const orderedColumns = useMemo(() => {
    const orderMap = new Map(columnOrder.map((key, idx) => [key, idx]));
    return [...COLUMNS].sort(
      (a, b) => (orderMap.get(a.key) ?? 0) - (orderMap.get(b.key) ?? 0),
    );
  }, [columnOrder]);

  // ── Data ──
  const candidateList = trpc.candidate.list.useQuery({ interviewId });
  const insights = trpc.analysis.getInterviewInsights.useQuery({ interviewId });

  const removeCandidatesMutation = trpc.candidate.removeMany.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (err) => {
      toast({
        title: "Failed to remove sessions",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const removeSessionsMutation = trpc.session.deleteMany.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (err) => {
      toast({
        title: "Failed to remove sessions",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateCandidateStatusMutation = trpc.candidate.update.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (err) => toast({ title: "Failed", description: err.message, variant: "destructive" })
  });
  const updateSessionStatusMutation = trpc.session.updateEvaluationStatus.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (err) => toast({ title: "Failed", description: err.message, variant: "destructive" })
  });

  const completeSessionMutation = trpc.session.complete.useMutation();
  const { currentOrg } = useOrg();
  const isViewer = currentOrg?.role === "VIEWER";

  const sendBulkMutation = trpc.emailInvite.sendBulk.useMutation({
    onSuccess: (result) => {
      utils.candidate.list.invalidate({ interviewId });
      setSelectedIds(new Set());
      setConfirmSendEmail(false);
      toast({
        title: `Emails sent: ${result.sent} success, ${result.failed} failed`,
      });
    },
    onError: (err) => {
      toast({
        title: "Failed to send emails",
        description: err.message,
        variant: "destructive",
      });
      setConfirmSendEmail(false);
    },
  });
  const rescanManyMutation = trpc.candidate.rescanMany.useMutation();

  const invalidateAll = useCallback(() => {
    utils.candidate.list.invalidate({ interviewId });
    utils.analysis.getInterviewInsights.invalidate({ interviewId });
    if (currentOrg?.id) {
      utils.organization.getBalance.invalidate({ organizationId: currentOrg.id });
    }
  }, [utils, interviewId, currentOrg?.id]);

  const handleConfirmEndAndGenerate = useCallback(async () => {
    if (!endSessionTarget) return;
    const { sessionId, name } = endSessionTarget;
    setEndingSession(true);
    try {
      await completeSessionMutation.mutateAsync({ id: sessionId });
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          organizationId: currentOrg?.id,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to generate summary");
      }
      invalidateAll();
      setEndSessionTarget(null);
      toast({
        title: "Interview ended",
        description: name
          ? `Result generated for ${name}.`
          : "The session was completed and the result has been generated.",
      });
      onViewParticipant(sessionId, "session");
    } catch (err) {
      toast({
        title: "Failed to end interview",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setEndingSession(false);
    }
  }, [
    endSessionTarget,
    completeSessionMutation,
    currentOrg?.id,
    toast,
    onViewParticipant,
    invalidateAll,
  ]);

  const handleCopyInviteLink = useCallback(
    (inviteToken: string) => {
      const link = `${window.location.origin}/i/invite/${inviteToken}`;
      copyToClipboard(link);
      toast({ title: "Invite link copied!" });
    },
    [toast],
  );

  // ── Build unified rows ──
  const candidates: CandidateRow[] = (candidateList.data?.candidates ?? []).map(
    (c: any) => ({
      type: "candidate" as const,
      id: c.id,
      email: c.email,
      name: c.name,
      phone: c.phone,
      gender: c.gender ?? null,
      birthday: c.birthday ?? null,
      education: c.education ?? null,
      school: c.school ?? null,
      major: c.major ?? null,
      graduationYear: c.graduationYear ?? null,
      workExperience: c.workExperience ?? null,
      notes: c.notes ?? null,
      inviteToken: c.inviteToken,
      session: c.session,
      createdAt: c.createdAt,
      invitedAt: c.invitedAt ?? null,
      cvAnalysis: c.cvAnalysis,
      evaluationStatus: c.evaluationStatus ?? "PENDING",
    }),
  );

  const walkIns: WalkInRow[] = (candidateList.data?.walkInSessions ?? []).map(
    (s: any) => ({
      type: "walkin" as const,
      id: s.id,
      email: s.participantEmail,
      name: s.participantName,
      session: s,
      evaluationStatus: s.evaluationStatus ?? "PENDING",
    }),
  );

  const isFiltering =
    searchQuery.trim() || statusFilter !== "ALL" || timeRange !== "ALL";

  // ── Filter + Sort ──
  const processedRows = useMemo(() => {
    const allRows: UnifiedRow[] = [...candidates, ...walkIns];
    let result = allRows;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (row) =>
          (row.email?.toLowerCase().includes(q) ?? false) ||
          (row.name?.toLowerCase().includes(q) ?? false),
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((row) => {
        const s = getSessionStatus(row);
        if (statusFilter === "NOT_STARTED") return s === "Not Started";
        return s === statusFilter;
      });
    }

    const cutoff = getTimeRangeCutoff(timeRange);
    if (cutoff) {
      result = result.filter((row) => {
        const started = getStartDate(row);
        if (!started) return false;
        return new Date(started) >= cutoff;
      });
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const va = getSortValue(a, sortKey, interview);
        const vb = getSortValue(b, sortKey, interview);
        let cmp =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb));
            
        // Tie-break equal scores: years of experience first, then education
        if (cmp === 0 && (sortKey === "cvScore" || sortKey === "interviewScore")) {
          const ca = getCandidateField(a);
          const cb = getCandidateField(b);
          return compareCandidateTieBreakers(
            {
              workExperience: ca?.workExperience,
              education: ca?.education,
            },
            {
              workExperience: cb?.workExperience,
              education: cb?.education,
            },
          );
        }

        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [candidates, walkIns, searchQuery, statusFilter, timeRange, sortKey, sortDir, interview]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedRows = useMemo(
    () => processedRows.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [processedRows, safePage, pageSize],
  );

  // ── Sort handler ──
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "cvScore" || key === "interviewScore"
          ? "desc"
          : "asc",
      );
    }
    setPage(0);
  };

  // ── Multi-select ──
  const pageIds = paginatedRows.map((r) => `${r.type}-${r.id}`);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  const toggleSelect = useCallback((compositeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(compositeId)) next.delete(compositeId);
      else next.add(compositeId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }, [allPageSelected, pageIds]);

  const isBulkDeleting =
    removeCandidatesMutation.isLoading || removeSessionsMutation.isLoading;

  const handleBulkDelete = useCallback(() => {
    const candidateIds = Array.from(selectedIds)
      .filter((id) => id.startsWith("candidate-"))
      .map((id) => id.replace("candidate-", ""));
    const sessionIds = Array.from(selectedIds)
      .filter((id) => id.startsWith("walkin-"))
      .map((id) => id.replace("walkin-", ""));

    let pending = 0;
    const onDone = () => {
      pending--;
      if (pending === 0) {
        toast({
          title: `${selectedIds.size} entry${selectedIds.size > 1 ? "s" : ""} removed`,
        });
        setSelectedIds(new Set());
      }
    };

    if (candidateIds.length > 0) {
      pending++;
      removeCandidatesMutation.mutate(
        { ids: candidateIds },
        { onSuccess: onDone },
      );
    }
    if (sessionIds.length > 0) {
      pending++;
      removeSessionsMutation.mutate({ ids: sessionIds }, { onSuccess: onDone });
    }
  }, [selectedIds, removeCandidatesMutation, removeSessionsMutation, toast]);

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [candidateList.data]);

  const handleExport = useCallback(() => {
    const nameCol = COLUMNS.find((c) => c.alwaysVisible)!;
    const dynCols = COLUMNS.filter(
      (c) => c !== nameCol && visibleColumns.has(c.key),
    );
    const exportCols = [nameCol, ...dynCols];

    const rows = processedRows.map((row) => {
      const c = getCandidateField(row);
      const status = getSessionStatus(row);
      const session = row.session;
      const hasSession = !!session && status !== "Not Started";
      const record: Record<string, string | number | null> = {};
      for (const col of exportCols) {
        switch (col.key) {
          case "name":
            record[col.label] = row.name || "";
            break;
          case "email":
            record[col.label] = row.email || "";
            break;
          case "phone":
            record[col.label] = c?.phone || "";
            break;
          case "gender":
            record[col.label] = c?.gender || "";
            break;
          case "birthday":
            record[col.label] = c?.birthday || "";
            break;
          case "education":
            record[col.label] = c?.education || "";
            break;
          case "school":
            record[col.label] = c?.school || "";
            break;
          case "major":
            record[col.label] = c?.major || "";
            break;
          case "gradYear":
            record[col.label] = c?.graduationYear ?? "";
            break;
          case "experience":
            record[col.label] = c?.workExperience || "";
            break;
          case "notes":
            record[col.label] = c?.notes || "";
            break;
          case "cvScore": {
            const cvScore = getCvScore(row, interview);
            record[col.label] = cvScore !== null ? Number(cvScore.toFixed(1)) : "";
            break;
          }
          case "interviewScore": {
            const interviewScore = getInterviewScore(row);
            record[col.label] = interviewScore != null ? Number(interviewScore.toFixed(1)) : "";
            break;
          }
          case "source":
            if (row.type === "walkin") {
              record[col.label] = "Walk-in";
            } else {
              const c = getCandidateField(row);
              record[col.label] = c?.invitedAt ? "Invited" : "Added";
            }
            break;
          case "status":
            record[col.label] =
              status === "Not Started"
                ? "NOT STARTED"
                : status.replace("_", " ");
            break;
          case "outcome":
            record[col.label] = row.evaluationStatus ?? "PENDING";
            break;
        }
      }
      return record;
    });
    exportToXlsx(rows, `candidates-${new Date().toISOString().slice(0, 10)}`);
  }, [processedRows, visibleColumns, interview]);

  const selectedCandidateIds = useMemo(
    () =>
      Array.from(selectedIds)
        .filter((id) => id.startsWith("candidate-"))
        .map((id) => id.replace("candidate-", "")),
    [selectedIds],
  );

  const handleRescanSelected = useCallback(() => {
    if (selectedCandidateIds.length === 0 || rescanManyMutation.isLoading) return;
    const total = selectedCandidateIds.length;

    if (rescanProgressTimerRef.current) {
      clearInterval(rescanProgressTimerRef.current);
      rescanProgressTimerRef.current = null;
    }

    setRescanProgressTotal(total);
    setRescanProgressProcessed(0);
    setRescanProgressPercent(6);
    setRescanProgressOpen(true);
    setRescanInProgress(true);

    toast({
      title: `Rescanning ${total} CV${total === 1 ? "" : "s"}...`,
      description:
        `Using latest interview CV grading criteria. Charges ${cvAnalysisCost.toFixed(1)} credits per successful CV.`,
    });

    const startTime = Date.now();
    const expectedDurationMs = Math.max(5000, total * 1200);
    rescanProgressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const smoothTarget = 10 + Math.min(80, (elapsed / expectedDurationMs) * 80);
      setRescanProgressPercent((prev) =>
        prev < smoothTarget ? Math.min(smoothTarget, prev + 1.5) : prev,
      );
      setRescanProgressProcessed((prev) => {
        const targetProcessed = Math.min(
          total - 1,
          Math.floor((smoothTarget / 90) * total),
        );
        return targetProcessed > prev ? targetProcessed : prev;
      });
    }, 120);

    void rescanManyMutation
      .mutateAsync({
        interviewId,
        candidateIds: selectedCandidateIds,
      })
      .then((result) => {
        if (rescanProgressTimerRef.current) {
          clearInterval(rescanProgressTimerRef.current);
          rescanProgressTimerRef.current = null;
        }
        setRescanProgressPercent(100);
        setRescanProgressProcessed(total);
        setRescanInProgress(false);
        invalidateAll();
        setSelectedIds(new Set());
        if (result.failed > 0 || result.skipped > 0) {
          toast({
            title: `Rescanned ${result.rescanned}/${result.requested} CVs`,
            description: `${result.failed} failed, ${result.skipped} skipped.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: `Rescanned ${result.rescanned} CV${result.rescanned === 1 ? "" : "s"} successfully`,
          });
        }
        setTimeout(() => {
          setRescanProgressOpen(false);
        }, 500);
      })
      .catch((err: Error) => {
        if (rescanProgressTimerRef.current) {
          clearInterval(rescanProgressTimerRef.current);
          rescanProgressTimerRef.current = null;
        }
        setRescanInProgress(false);
        setRescanProgressOpen(false);
        toast({
          title: "Failed to rescan CVs",
          description: err.message,
          variant: "destructive",
        });
      });
  }, [rescanManyMutation, selectedCandidateIds, toast, interviewId]);

  useEffect(() => {
    return () => {
      if (rescanProgressTimerRef.current) {
        clearInterval(rescanProgressTimerRef.current);
      }
    };
  }, []);

  // ── Stats ──
  const totalCandidates = candidates.length + walkIns.length;
  const completedCount = [...candidates, ...walkIns].filter(
    (r: UnifiedRow) => getSessionStatus(r) === "COMPLETED",
  ).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">{t("candidateManager.totalSessions")}</p>
              <p className="text-2xl font-bold">{totalCandidates}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <UserCheck className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">{t("candidateManager.completed")}</p>
              <p className="text-2xl font-bold">{completedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Clock className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">{t("candidateManager.avgDuration")}</p>
              <p className="text-2xl font-bold">
                {insights.data?.avgDurationSeconds
                  ? `${Math.round(insights.data.avgDurationSeconds / 60)}m`
                  : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters toolbar — matching sessions table layout */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("candidateManager.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>

        {selectedIds.size === 0 && (
          <Select
            value={timeRange}
            onValueChange={(v) => {
              setTimeRange(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t("candidates.timeRange." + (opt.value === "ALL" ? "allTime" : opt.value === "1d" ? "past1Day" : opt.value === "3d" ? "past3Days" : opt.value === "7d" ? "past7Days" : opt.value === "14d" ? "past14Days" : opt.value === "30d" ? "past30Days" : "past90Days"))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <CircleDot className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("candidateManager.allStatus")}</SelectItem>
            <SelectItem value="COMPLETED">{t("candidates.completed")}</SelectItem>
            <SelectItem value="IN_PROGRESS">{t("candidates.inProgress")}</SelectItem>
            <SelectItem value="NOT_STARTED">{t("candidates.notStarted")}</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={handleExport}
          disabled={processedRows.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          {t("candidateManager.export")}
        </Button>

        {/* Bulk actions / Import+Add */}
        {selectedIds.size > 0 ? (
          <>
            <Button
              variant="default"
              className="bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500 disabled:bg-emerald-600/60 disabled:text-white/90"
              onClick={handleRescanSelected}
              disabled={isViewer || rescanManyMutation.isLoading || selectedCandidateIds.length === 0 || isBulkDeleting}
              title={isViewer ? "Viewer role is read-only" : undefined}
            >
              {rescanManyMutation.isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Rescan CVs ({selectedCandidateIds.length})
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={isViewer || isBulkDeleting}
              title={isViewer ? "Viewer role is read-only" : undefined}
            >
              {isBulkDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("candidates.delete") + ` (${selectedIds.size})`}
            </Button>
            {Array.from(selectedIds).some((id) => id.startsWith("candidate-")) && (
              <Button
                variant="default"
                onClick={() => setConfirmSendEmail(true)}
                disabled={isViewer || sendBulkMutation.isLoading || isBulkDeleting}
                title={isViewer ? "Viewer role is read-only" : undefined}
              >
                <Mail className="mr-2 h-4 w-4" />
                Send Emails ({Array.from(selectedIds).filter((id) => id.startsWith("candidate-")).length})
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-1 h-4 w-4" />
              {t("candidates.cancel")}
            </Button>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-tour="add-session"
                disabled={isViewer}
                title={isViewer ? "Viewer role is read-only" : undefined}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("candidateManager.add")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                data-tour="create-individually"
                onClick={() => setCreateOpen(true)}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Create individually
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Import by Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setResumeImportOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Import by resumes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        {candidateList.isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : processedRows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {isFiltering
              ? t("candidates.noSessionsMatchFilters") || "No sessions match your filters."
              : t("candidates.noSessionsYet") || "No sessions yet. Add sessions individually or import them in bulk."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto code-scrollbar">
              <Table className="border-collapse">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {/* Frozen left: checkbox + name (single cell to avoid gap) */}
                    <TableHead className="sticky left-0 z-20 min-w-[180px] bg-background shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={
                            allPageSelected
                              ? true
                              : somePageSelected
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={toggleSelectAll}
                          disabled={isViewer}
                        />
                        <span
                          className="inline-flex cursor-pointer items-center gap-1 select-none whitespace-nowrap hover:text-foreground"
                          onClick={() => handleSort("name")}
                        >
                          {columnLabel.name}
                          {sortKey === "name" ? (
                            sortDir === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-40" />
                          )}
                        </span>
                      </div>
                    </TableHead>
                    {/* Dynamic columns (skip name — it's frozen) */}
                    {orderedColumns
                      .filter(
                        (col) =>
                          col.key !== "name" && visibleColumns.has(col.key),
                      )
                      .map((col) =>
                        col.sortKey ? (
                          <SortableHead
                            key={col.key}
                            label={columnLabel[col.key] ?? col.label}
                            sortKey={col.sortKey}
                            activeKey={sortKey}
                            direction={sortDir}
                            onSort={handleSort}
                          />
                        ) : (
                          <TableHead
                            key={col.key}
                            className="whitespace-nowrap"
                          >
                            {columnLabel[col.key] ?? col.label}
                          </TableHead>
                        ),
                      )}
                    {/* Frozen right: gear icon */}
                    <TableHead className="sticky right-0 z-20 w-10 bg-background shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <Settings className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-48 p-1">
                          <div className="max-h-[320px] overflow-y-auto code-scrollbar">
                            {orderedColumns
                              .filter((col) => !col.alwaysVisible)
                              .map((col) => (
                                <div
                                  key={col.key}
                                  data-col-key={col.key}
                                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors ${
                                    draggingCol === col.key
                                      ? "bg-accent/80 opacity-50"
                                      : dragOverCol === col.key
                                        ? "border-t-2 border-primary bg-primary/5"
                                        : "hover:bg-accent"
                                  }`}
                                >
                                  <GripVertical
                                    className="h-3.5 w-3.5 shrink-0 cursor-grab touch-none text-muted-foreground/50 active:cursor-grabbing"
                                    onPointerDown={(e) =>
                                      handleGripPointerDown(col.key, e)
                                    }
                                  />
                                  <span
                                    className="flex-1 cursor-pointer select-none text-left"
                                    onClick={() => {
                                      if (!draggingCol) toggleColumn(col.key);
                                    }}
                                  >
                                    {columnLabel[col.key] ?? col.label}
                                  </span>
                                  {visibleColumns.has(col.key) && (
                                    <Check className="h-4 w-4 shrink-0 text-primary" />
                                  )}
                                </div>
                              ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.map((row) => {
                    const status = getSessionStatus(row);
                    const session = row.session;
                    const hasSession = !!session && status !== "Not Started";
                    const compositeId = `${row.type}-${row.id}`;
                    const c = getCandidateField(row);

                    const cellValues: Record<string, JSX.Element | string> = {
                      email: (
                        <span className="text-muted-foreground">
                          {row.email || "-"}
                        </span>
                      ),
                      phone: (
                        <span className="whitespace-nowrap text-muted-foreground">
                          {c?.phone || "-"}
                        </span>
                      ),
                      gender: (
                        <span className="text-muted-foreground">
                          {c?.gender || "-"}
                        </span>
                      ),
                      birthday: (
                        <span className="text-muted-foreground">
                          {c?.birthday || "-"}
                        </span>
                      ),
                      education: (
                        <span className="text-muted-foreground">
                          {c?.education || "-"}
                        </span>
                      ),
                      school: (
                        <span className="max-w-[200px] truncate text-muted-foreground">
                          {c?.school || "-"}
                        </span>
                      ),
                      major: (
                        <span className="max-w-[160px] truncate text-muted-foreground">
                          {c?.major || "-"}
                        </span>
                      ),
                      gradYear: (
                        <span className="text-muted-foreground">
                          {c?.graduationYear || "-"}
                        </span>
                      ),
                      experience: (
                        <span className="text-muted-foreground">
                          {c?.workExperience || "-"}
                        </span>
                      ),
                      notes: (
                        <span
                          className="block max-w-[200px] truncate text-muted-foreground"
                          title={c?.notes || undefined}
                        >
                          {c?.notes || "-"}
                        </span>
                      ),
                      cvScore: (() => {
                        const cvScore = getCvScore(row, interview);
                        if (cvScore === null)
                          return (
                            <span className="text-muted-foreground">-</span>
                          );
                        const sc =
                          cvScore >= 70
                            ? "text-green-700 dark:text-green-400"
                            : cvScore >= 40
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-red-700 dark:text-red-400";
                        return (
                          <span className={`font-semibold ${sc}`}>
                            {cvScore.toFixed(0)}/100
                          </span>
                        );
                      })(),
                      interviewScore: (() => {
                        // Use nullish check so numeric 0 still renders (not treated as missing)
                        const interviewScore = getInterviewScore(row);
                        if (interviewScore == null)
                          return (
                            <span className="text-muted-foreground">-</span>
                          );
                        const sc =
                          interviewScore >= 7
                            ? "text-green-700 dark:text-green-400"
                            : interviewScore >= 4
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-red-700 dark:text-red-400";
                        return (
                          <span className={`font-semibold ${sc}`}>
                            {interviewScore.toFixed(1)}/10
                          </span>
                        );
                      })(),
                      source: (() => {
                        if (row.type === "walkin") {
                          return (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                              <UserPlus className="h-3 w-3" />
                              Walk-in
                            </span>
                          );
                        }
                        const cStatus = getCandidateField(row);
                        if (cStatus?.invitedAt) {
                          return (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                              <Mail className="h-3 w-3" />
                              Invited
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                            <Plus className="h-3 w-3" />
                            Added
                          </span>
                        );
                      })(),
                      status: (
                        <Badge
                          variant={getSessionBadgeVariant(status)}
                          className="whitespace-nowrap"
                        >
                          {status === "Not Started"
                            ? "NOT STARTED"
                            : status.replace("_", " ")}
                        </Badge>
                      ),
                      outcome: (() => {
                        const currentStatus = row.evaluationStatus ?? "PENDING";
                        const statusColors: Record<string, string> = {
                          PENDING: "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-350",
                          SHORTLISTED: "bg-emerald-50 border-emerald-250 text-emerald-700 hover:bg-emerald-100/50 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400",
                          WAITLISTED: "bg-amber-50 border-amber-250 text-amber-700 hover:bg-amber-100/50 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400",
                          REJECTED: "bg-red-50 border-red-250 text-red-700 hover:bg-red-100/50 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400"
                        };
                        const colorClass = statusColors[currentStatus] || statusColors.PENDING;
                        return (
                          <Select
                            value={currentStatus}
                            onValueChange={(val: any) => {
                              if (isViewer) return;
                              if (row.type === "walkin") {
                                updateSessionStatusMutation.mutate({ sessionId: row.id, evaluationStatus: val });
                              } else {
                                updateCandidateStatusMutation.mutate({ id: row.id, evaluationStatus: val });
                              }
                            }}
                          >
                            <SelectTrigger
                              className={cn("h-8 w-[130px] font-bold border transition-colors shadow-sm", colorClass)}
                              onClick={(e) => e.stopPropagation()}
                              disabled={isViewer}
                              title={isViewer ? "Viewer role is read-only" : undefined}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PENDING" className="font-semibold text-slate-700">Pending</SelectItem>
                              <SelectItem value="SHORTLISTED" className="font-semibold text-emerald-600">Shortlisted</SelectItem>
                              <SelectItem value="WAITLISTED" className="font-semibold text-amber-600">Waitlisted</SelectItem>
                              <SelectItem value="REJECTED" className="font-semibold text-red-600">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        );
                      })(),
                    };

                    return (
                      <TableRow
                        key={compositeId}
                        className="cursor-pointer"
                        data-state={
                          selectedIds.has(compositeId) ? "selected" : undefined
                        }
                        onClick={() => {
                          if (row.type === "candidate" && !hasSession) {
                            onViewParticipant(row.id, "candidate");
                          } else if (hasSession) {
                            onViewParticipant(session.id, "session");
                          }
                        }}
                      >
                        {/* Frozen left: checkbox + name (single cell) */}
                        <TableCell className="sticky left-0 z-10 bg-background shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          <div className="flex items-center gap-3">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.has(compositeId)}
                                onCheckedChange={() =>
                                  toggleSelect(compositeId)
                                }
                                disabled={isViewer}
                              />
                            </div>
                            <span className="font-medium">
                              {row.name || (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        {/* Dynamic columns (skip name — it's frozen) */}
                        {orderedColumns
                          .filter(
                            (col) =>
                              col.key !== "name" && visibleColumns.has(col.key),
                          )
                          .map((col) => (
                            <TableCell key={col.key}>
                              {cellValues[col.key]}
                            </TableCell>
                          ))}
                        {/* Frozen right: actions */}
                        <TableCell
                          onClick={(e) => e.stopPropagation()}
                          className="sticky right-0 z-10 w-10 bg-background shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                        >
                          <div className="flex items-center justify-end gap-0.5">
                            {hasSession && status === "IN_PROGRESS" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="End interview & generate result"
                                disabled={isViewer || endingSession}
                                onClick={() =>
                                  setEndSessionTarget({
                                    sessionId: session.id,
                                    name: row.name || null,
                                  })
                                }
                              >
                                {endingSession &&
                                endSessionTarget?.sessionId === session.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
                                ) : (
                                  <StopCircle className="h-3.5 w-3.5 text-destructive" />
                                )}
                              </Button>
                            )}
                            {hasSession && status === "COMPLETED" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="View report"
                                onClick={() => {
                                  if (row.type === "candidate" && !hasSession) {
                                    onViewParticipant(row.id, "candidate");
                                  } else {
                                    onViewParticipant(session.id, "session");
                                  }
                                }}
                              >
                                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            ) : row.type === "candidate" && row.inviteToken ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Copy invite link"
                                data-tour="copy-link"
                                onClick={() =>
                                  handleCopyInviteLink(row.inviteToken!)
                                }
                              >
                                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {processedRows.length > PAGE_SIZE_OPTIONS[0] && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Rows per page</span>
                  <select
                    className="rounded border bg-background px-2 py-1 text-sm"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(0);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  <span className="ml-2">
                    {safePage * pageSize + 1}–
                    {Math.min((safePage + 1) * pageSize, processedRows.length)}{" "}
                    of {processedRows.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    {safePage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={safePage >= totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sessions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} session
              {selectedIds.size > 1 ? "s" : ""}? This will permanently remove
              the selected entries and any associated data. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                handleBulkDelete();
                setConfirmDelete(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!endSessionTarget}
        onOpenChange={(open) => {
          if (!open && !endingSession) setEndSessionTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              End interview and generate report?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {endSessionTarget?.name
                ? `This will end ${endSessionTarget.name}'s in-progress interview and generate the result from whatever answers exist so far.`
                : "This interview is still in progress. Generating the report will end the interview — the candidate will no longer be able to continue."}{" "}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endingSession}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={endingSession}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmEndAndGenerate();
              }}
            >
              {endingSession ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ending...
                </>
              ) : (
                "End Interview & Generate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={rescanProgressOpen}
        onOpenChange={(open) => {
          if (!open && !rescanInProgress) {
            setRescanProgressOpen(false);
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md [&>button]:hidden"
          onEscapeKeyDown={(event) => {
            if (rescanInProgress) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (rescanInProgress) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rescanning CVs</DialogTitle>
            <DialogDescription>
              Re-evaluating selected resumes using the latest interview CV grading criteria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Progress value={rescanProgressPercent} />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Processing {Math.min(rescanProgressProcessed, rescanProgressTotal)} of{" "}
                {rescanProgressTotal}
              </span>
              <span>{Math.round(rescanProgressPercent)}%</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <CandidateCreateDialog
        interviewId={interviewId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={invalidateAll}
      />
      <CandidateImportDialog
        interviewId={interviewId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={invalidateAll}
      />
      <ResumeImportDialog
        interviewId={interviewId}
        open={resumeImportOpen}
        onOpenChange={setResumeImportOpen}
        onImported={invalidateAll}
      />

      {/* Send Emails Confirm Dialog */}
      <AlertDialog open={confirmSendEmail} onOpenChange={setConfirmSendEmail}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Invite Emails</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to send invite emails to {Array.from(selectedIds).filter((id) => id.startsWith("candidate-")).length} candidate(s)? This will use the email template configured in your Interview Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendBulkMutation.isLoading}>Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                const candidateIds = Array.from(selectedIds)
                  .filter((id) => id.startsWith("candidate-"))
                  .map((id) => id.replace("candidate-", ""));
                sendBulkMutation.mutate({ interviewId, candidateIds, type: "INVITE" });
              }}
              disabled={sendBulkMutation.isLoading}
            >
              {sendBulkMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Emails
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
