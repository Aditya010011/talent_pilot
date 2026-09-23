"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useProject } from "@/components/project-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";
import {
  getCoachingDisplayStatus,
  resolveCoachingSession,
} from "@/lib/coaching-status";
import {
  ArrowUpDown,
  Brain,
  Check,
  Search,
  Timer,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export default function CoachingCandidatesPage() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "createdAt" | "status">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = trpc.coachingCandidate.listAll.useQuery(
    { projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );

  const candidates = data?.candidates ?? [];
  const walkInSessions = data?.walkInSessions ?? [];

  const unifiedList = useMemo(() => {
    const list: any[] = [];
    candidates.forEach((c) => list.push({ ...c, type: "candidate" }));
    walkInSessions.forEach((s) => list.push({ ...s, type: "walkin" }));

    let filtered = list.filter((row) => {
      const q = search.toLowerCase();
      const n = (row.name || row.participantName || row.email || row.participantEmail || "").toLowerCase();
      return n.includes(q);
    });

    filtered.sort((a, b) => {
      let aVal: any = 0;
      let bVal: any = 0;

      if (sortKey === "name") {
        aVal = (a.name || a.participantName || a.email || a.participantEmail || "").toLowerCase();
        bVal = (b.name || b.participantName || b.email || b.participantEmail || "").toLowerCase();
      } else if (sortKey === "createdAt") {
        aVal = new Date(a.createdAt || a.startedAt || 0).getTime();
        bVal = new Date(b.createdAt || b.startedAt || 0).getTime();
      } else if (sortKey === "status") {
        aVal = a.type === "walkin" ? a.status : (a.evaluationStatus || "PENDING");
        bVal = b.type === "walkin" ? b.status : (b.evaluationStatus || "PENDING");
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [candidates, walkInSessions, search, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ colKey }: { colKey: typeof sortKey }) => {
    if (sortKey !== colKey) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    return (
      <ArrowUpDown className={`ml-1 h-3 w-3 ${sortDir === "asc" ? "text-primary rotate-180" : "text-primary"}`} />
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-6 w-6 text-sky-500" />
            <h1 className="text-3xl font-bold">Coaching Candidates</h1>
          </div>
          <p className="text-muted-foreground">
            Manage candidates and walk-in sessions across all your trainings.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search candidates..."
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[300px]">
                <Button variant="ghost" onClick={() => toggleSort("name")} className="-ml-4 h-8 font-semibold">
                  Participant <SortIcon colKey="name" />
                </Button>
              </TableHead>
              <TableHead>Training</TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => toggleSort("createdAt")} className="-ml-4 h-8 font-semibold">
                  Date <SortIcon colKey="createdAt" />
                </Button>
              </TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => toggleSort("status")} className="-ml-4 h-8 font-semibold">
                  Status <SortIcon colKey="status" />
                </Button>
              </TableHead>
              <TableHead>Time Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                </TableRow>
              ))
            ) : unifiedList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No candidates or sessions found.
                </TableCell>
              </TableRow>
            ) : (
              unifiedList.map((row) => {
                const name = row.name || row.participantName || "Anonymous";
                const email = row.email || row.participantEmail || "";
                const date = row.createdAt || row.startedAt;
                
                const sessionObj =
                  row.type === "walkin"
                    ? resolveCoachingSession(row)
                    : resolveCoachingSession(row.session);
                const durationSeconds = sessionObj?.startedAt && sessionObj?.completedAt 
                  ? (new Date(sessionObj.completedAt).getTime() - new Date(sessionObj.startedAt).getTime()) / 1000 
                  : 0;

                const training = row.training;
                const displayStatus = getCoachingDisplayStatus(sessionObj, training);
                const isCompleted = displayStatus === "COMPLETED";
                const finishedAt = sessionObj?.completedAt;

                return (
                  <TableRow key={row.id} className="hover:bg-sky-50/50 dark:hover:bg-sky-950/20">
                    <TableCell>
                      <div className="font-medium">{name}</div>
                      {email && <div className="text-xs text-muted-foreground">{email}</div>}
                      {row.type === "walkin" && (
                        <Badge variant="outline" className="mt-1 text-[10px] uppercase">Walk-in</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Brain className="h-3.5 w-3.5 text-sky-500" />
                        {row.training?.title || "Unknown Training"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {date ? formatShortDate(date) : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Timer className="h-3.5 w-3.5" />
                        {durationSeconds > 0 ? formatDuration(durationSeconds) : "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={isCompleted ? "default" : "secondary"}
                        className={
                          isCompleted
                            ? "bg-green-500 hover:bg-green-600"
                            : displayStatus === "QUIZ PENDING"
                              ? "border-amber-400 bg-amber-50 text-amber-700"
                              : ""
                        }
                      >
                        {displayStatus === "IN_PROGRESS"
                          ? "IN PROGRESS"
                          : displayStatus === "Not Started"
                            ? "NOT STARTED"
                            : displayStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {finishedAt ? formatDateTime(finishedAt) : "-"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
