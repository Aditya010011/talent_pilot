"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useProject } from "@/components/project-provider";
import { useOrg } from "@/components/org-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import {
  ArrowRight,
  Brain,
  Link2,
  Lock,
  Plus,
  Timer,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNewTraining } from "@/components/interview/new-training-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { format } from "date-fns";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function toPieData(raw: unknown): { name: string; value: number }[] {
  if (Array.isArray(raw)) {
    return raw.map((d: any) => ({
      name: String(d?.name ?? ""),
      value: Number(d?.value) || 0,
    }));
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([name, value]) => ({
      name,
      value: Number(value) || 0,
    }));
  }
  return [];
}

const CHART_COLORS = {
  primary: "hsl(200, 95%, 45%)", // Sky Blue
  orange: "hsl(24, 80%, 55%)",
  green: "hsl(142, 60%, 45%)",
  muted: "hsl(var(--muted-foreground))",
};

const PIE_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.orange,
  CHART_COLORS.green,
  CHART_COLORS.muted,
  "hsl(262, 50%, 55%)",
];

const TOOLTIP_STYLE = {
  borderRadius: "8px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CoachingDashboardPage() {
  const { currentProject } = useProject();
  const { currentOrg } = useOrg();
  const { openNewTraining } = useNewTraining();
  const { t, locale } = useAppLocale();
  const router = useRouter();

  const isViewer = currentOrg?.role === "VIEWER";
  const projectId = currentProject?.id;

  // Date Range Filter States
  const [filterType, setFilterType] = useState<"all" | "today" | "yesterday" | "7d" | "30d" | "6m" | "1y" | "manual">("30d");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const resolvedDates = useMemo(() => {
    if (filterType === "all") return { startDate: undefined, endDate: undefined };
    if (filterType === "manual") {
      return {
        startDate: startDate ? startDate.toISOString() : undefined,
        endDate: endDate ? endDate.toISOString() : undefined,
      };
    }
    const end = new Date();
    const start = new Date();
    if (filterType === "today") {
      const utcTodayStart = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0, 0));
      const utcTodayEnd = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999));
      return {
        startDate: utcTodayStart.toISOString(),
        endDate: utcTodayEnd.toISOString(),
      };
    } else if (filterType === "yesterday") {
      const utcYesterdayStart = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate() - 1, 0, 0, 0, 0));
      const utcYesterdayEnd = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate() - 1, 23, 59, 59, 999));
      return {
        startDate: utcYesterdayStart.toISOString(),
        endDate: utcYesterdayEnd.toISOString(),
      };
    } else if (filterType === "7d") {
      start.setDate(end.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (filterType === "30d") {
      start.setDate(end.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (filterType === "6m") {
      start.setMonth(end.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (filterType === "1y") {
      start.setFullYear(end.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [filterType, startDate, endDate]);

  const { data, isLoading } = trpc.training.dashboardStats.useQuery(
    { projectId: projectId ?? undefined, startDate: resolvedDates.startDate, endDate: resolvedDates.endDate },
    { enabled: !!projectId },
  );

  const trainings = trpc.training.list.useQuery(
    { limit: 5, projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );

  const recentSessions = Array.isArray(data?.recentSessions)
    ? data.recentSessions
    : [];

  const trainingBreakdown = useMemo(
    () => toPieData(data?.questionTypeBreakdown),
    [data?.questionTypeBreakdown],
  );

  const totalSessionsCount = useMemo(() => {
    if (!data?.statusBreakdown || typeof data.statusBreakdown !== "object") return 0;
    return Object.values(data.statusBreakdown).reduce(
      (a: number, b) => a + (typeof b === "number" ? b : 0),
      0,
    );
  }, [data?.statusBreakdown]);

  const totalDurationSeconds = useMemo(() => {
    return recentSessions.reduce(
      (acc: number, s: any) => acc + (s.totalDurationSeconds || 0),
      0,
    );
  }, [recentSessions]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-6 w-6 text-sky-500" />
            <h1 className="text-3xl font-bold">Coaching Analytics</h1>
          </div>
          <p className="text-muted-foreground">
            Insights and engagement for your program sessions.
          </p>

          {/* Date range filter */}
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <Select
              value={filterType}
              onValueChange={(val: any) => {
                setFilterType(val);
                if (val !== "manual") {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }
              }}
            >
              <SelectTrigger className="h-9 w-[180px] bg-background">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="6m">Last 6 months</SelectItem>
                <SelectItem value="1y">Last 1 year</SelectItem>
                <SelectItem value="manual">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {filterType === "manual" && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 px-3 text-xs font-normal">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                      {startDate ? format(startDate, "PPP") : "Start Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">to</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 px-3 text-xs font-normal">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                      {endDate ? format(endDate, "PPP") : "End Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={setEndDate} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>
        {!isViewer && (
          <Button
            className="bg-sky-600 hover:bg-sky-700 text-white border-0 shadow-sm gap-2 h-10 shrink-0 self-start md:self-center"
            onClick={() => openNewTraining(projectId)}
          >
            <Plus className="h-4 w-4 shrink-0" />
            New Training
          </Button>
        )}
      </div>

      {/* Row 1: Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="Total Trainings"
          value={trainings.data?.trainings.length}
          icon={Brain}
          loading={trainings.isLoading}
        />
        <StatsCard
          title="Total Sessions"
          value={totalSessionsCount}
          icon={Users}
          loading={isLoading}
        />
        <StatsCard
          title="Total Duration"
          value={formatDuration(totalDurationSeconds)}
          icon={Timer}
          loading={isLoading}
        />
      </div>

      {/* Row 2: Daily Coaching Sessions + Daily Session Time */}
      <div className="grid gap-4 md:grid-cols-2">
        <DailyChart
          title="Daily Coaching Sessions"
          data={Array.isArray(data?.daily) ? data.daily : []}
          dataKey="sessions"
          color={CHART_COLORS.primary}
          yLabel="sessions"
          loading={isLoading}
        />
        <DailyChart
          title="Daily Session Time"
          data={Array.isArray(data?.daily) ? data.daily : []}
          dataKey="sessionMinutes"
          color={CHART_COLORS.orange}
          yLabel="minutes"
          loading={isLoading}
        />
      </div>

      {/* Row 3: Session Status Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <PieCard
          title="Session Status"
          centerLabel="Sessions"
          data={[
            {
              name: "Completed",
              value: data?.statusBreakdown.COMPLETED ?? 0,
            },
            {
              name: "In Progress",
              value: data?.statusBreakdown.IN_PROGRESS ?? 0,
            },
            {
              name: "Not Started",
              value: data?.statusBreakdown.NOT_STARTED ?? 0,
            },
          ]}
          loading={isLoading}
        />
        <PieCard
          title="Training Breakdown"
          centerLabel="Sessions"
          data={trainingBreakdown}
          loading={isLoading}
        />
      </div>

      {/* Row 4: Recent Completed Sessions */}
      {recentSessions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Sessions</CardTitle>
            <Link href="/coaching/candidates">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentSessions.map((s: any) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/10 text-xs font-semibold text-sky-600">
                      {(s.participantName?.[0] || s.participantEmail?.[0] || "?").toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.participantName || "Anonymous"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.createdAt).toLocaleDateString(
                          locale === "zh" ? "zh-CN" : "en-US",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {s.participantEmail && (
                      <span className="text-muted-foreground hidden md:inline">
                        {s.participantEmail}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {formatDuration(s.totalDurationSeconds || 0)}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 5: Recent Trainings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Trainings</CardTitle>
          <Link href="/coaching/trainings">
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {trainings.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : trainings.data?.trainings.length === 0 ? (
            <div className="py-12 text-center">
              <Brain className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">
                No coaching programs yet
              </h3>
              <p className="text-sm text-muted-foreground">
                Create a coaching program to get started.
              </p>
              {!isViewer && (
                <Button onClick={() => openNewTraining(projectId)} className="mt-4 bg-sky-600 hover:bg-sky-700 text-white">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Training
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {trainings.data?.trainings.map((t: any) => (
                <Link
                  key={t.id}
                  href={`/coaching/trainings/${t.id}/edit`}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{t.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {t.publicSlug ? "Public" : "Private"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.publicSlug && t.isActive ? (
                      <Badge
                        variant="outline"
                        className="gap-1 max-w-[200px] border-border bg-background text-foreground"
                      >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          /c/{t.publicSlug}
                        </span>
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        Invite Only
                      </Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatsCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value?: string | number;
  icon: React.ElementType;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-lg bg-sky-500/10 p-3">
          <Icon className="h-5 w-5 text-sky-600" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold">{value ?? 0}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DailyChart({
  title,
  data,
  dataKey,
  color,
  yLabel,
  loading,
}: {
  title: string;
  data: { date: string; [key: string]: number | string }[];
  dataKey: string;
  color: string;
  yLabel: string;
  loading: boolean;
}) {
  const chartData = Array.isArray(data) ? data : [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No data yet
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 10) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => formatShortDate(String(label))}
                  formatter={(value) => [
                    `${Number(value).toLocaleString()} ${yLabel}`,
                    title,
                  ]}
                />
                <Bar
                  dataKey={dataKey}
                  fill={color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PieCard({
  title,
  centerLabel,
  data,
  loading,
}: {
  title: string;
  centerLabel: string;
  data: { name: string; value: number }[];
  loading: boolean;
}) {
  const items = Array.isArray(data) ? data : [];
  const total = items.reduce((s, d) => s + d.value, 0);
  const filtered = items.filter((d) => d.value > 0);
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-6">
        {loading ? (
          <Skeleton className="h-80 w-full" />
        ) : total === 0 ? (
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            No data yet
          </div>
        ) : (
          <div>
            <div className="relative flex items-center justify-center py-6">
              <div className="h-52 w-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={filtered}
                      cx="50%"
                      cy="50%"
                      innerRadius="84%"
                      outerRadius="98%"
                      dataKey="value"
                      strokeWidth={1}
                      stroke="hsl(var(--card))"
                      cornerRadius={10}
                      paddingAngle={1}
                      onMouseEnter={(_, idx) => setHovered(idx)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {filtered.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                          opacity={
                            hovered === null || hovered === idx ? 1 : 0.4
                          }
                          style={{
                            transition: "opacity 0.2s ease, filter 0.2s ease",
                            filter:
                              hovered === idx
                                ? "brightness(1.1) drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
                                : "none",
                            cursor: "pointer",
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, name) => [
                        `${Number(value)} (${Math.round((Number(value) / total) * 100)}%)`,
                        String(name),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground/60">
                  {centerLabel}
                </span>
                <span className="text-4xl">{total.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {items.map((d, idx) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: PIE_COLORS[idx % PIE_COLORS.length],
                    }}
                  />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-medium">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "bg-green-500/10 text-green-700 dark:text-green-400",
    IN_PROGRESS: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    NOT_STARTED: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    COMPLETED: "Completed",
    IN_PROGRESS: "In Progress",
    NOT_STARTED: "Not Started",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
