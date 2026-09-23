"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useOrg } from "@/components/org-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    ExternalLink,
    FileText,
    MessageSquare,
    Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
    Bar,
    BarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

type PeriodValue = "last7" | "last30" | "last90" | "thisMonth";

const PERIOD_OPTIONS: { value: PeriodValue; label: string }[] = [
  { value: "thisMonth", label: "This month" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "last90", label: "Last 90 days" },
];

/* ──────────────────── Helpers ──────────────────── */

function formatHours(seconds: number): string {
  const hrs = seconds / 3600;
  if (hrs < 1) return `${Math.round(seconds / 60)} min`;
  return `${hrs.toFixed(1)} hrs`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

/* ──────────────────── Summary card (top grid) ──────────────────── */

function UsageRing({
  used,
  limit,
  label,
  icon: Icon,
  format = "number",
  totalSeconds,
  hideProgress = false,
}: {
  used: number;
  limit: number | null;
  label: string;
  icon: React.ElementType;
  format?: "number" | "hours";
  totalSeconds?: number;
  hideProgress?: boolean;
}) {
  const { t } = useAppLocale();
  const isUnlimited = limit === null || hideProgress;
  const pct = isUnlimited
    ? 0
    : limit! > 0
      ? Math.min((used / limit!) * 100, 100)
      : 0;
  const isHigh = !hideProgress && pct >= 80;
  const isFull = !hideProgress && pct >= 100;

  const formatValue = (val: number) => {
    if (format === "hours" && totalSeconds !== undefined)
      return formatHours(totalSeconds);
    return val.toLocaleString();
  };

  const formatLimit = (val: number | null) => {
    if (val === null) return t("usage.unlimited");
    if (format === "hours") return `${val} ${t("usage.hoursAbbr")}`;
    return val.toLocaleString();
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">
              {formatValue(used)}
              {!hideProgress && (
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatLimit(limit)}
                </span>
              )}
            </p>
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              isFull
                ? "bg-destructive/10"
                : isHigh
                  ? "bg-yellow-500/10"
                  : "bg-primary/10"
            }`}
          >
            <Icon
              className={`h-5 w-5 ${
                isFull
                  ? "text-destructive"
                  : isHigh
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-primary"
              }`}
            />
          </div>
        </div>
        {!hideProgress && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {limit === null
                  ? t("usage.noLimit")
                  : t("usage.percentUsed", { pct: pct.toFixed(1) })}
              </span>
              {limit !== null && (
                <span>
                  {isFull ? (
                    <Badge
                      variant="destructive"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {t("usage.limitReached")}
                    </Badge>
                  ) : isHigh ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                    >
                      {t("usage.approachingLimit")}
                    </Badge>
                  ) : null}
                </span>
              )}
            </div>
            {limit !== null ? (
              <Progress
                value={pct}
                className={`h-2 ${isFull ? "[&>div]:bg-destructive" : isHigh ? "[&>div]:bg-yellow-500" : ""}`}
              />
            ) : (
              <div className="h-2 rounded-full bg-muted" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ──────────────── 2-panel detail section per resource ──────────────── */

function UsageDetailSection({
  title,
  description,
  extraContent,
  infoLinks,
  chartTitle,
  chartSubtitle,
  total,
  totalLabel,
  limitLabel,
  data,
  dataKey,
  color,
  yLabel,
  children,
}: {
  title: string;
  description: string;
  extraContent?: React.ReactNode;
  infoLinks?: { label: string; href: string }[];
  chartTitle: string;
  chartSubtitle: string;
  total: string;
  totalLabel?: string;
  limitLabel?: string;
  data: { date: string; [key: string]: number | string }[];
  dataKey: string;
  color: string;
  yLabel: string;
  children?: React.ReactNode;
}) {
  const { t } = useAppLocale();
  return (
    <Card>
      <CardContent className="grid gap-6 pt-6 md:grid-cols-[2fr_3fr]">
        <div className="flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            {extraContent}
          </div>

          {infoLinks && infoLinks.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("usage.moreInformation")}
              </p>
              <div className="mt-2 space-y-1.5">
                {infoLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-1.5 text-sm text-foreground hover:underline"
                  >
                    {link.label}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <h4 className="text-sm font-semibold">{chartTitle}</h4>
            <span className="text-sm font-bold">{total}</span>
          </div>

          {(totalLabel || limitLabel) && (
            <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
              <span>{chartSubtitle}</span>
              {limitLabel && <span>{limitLabel}</span>}
            </div>
          )}

          {!totalLabel && !limitLabel && (
            <p className="mb-1 text-xs text-muted-foreground">
              {chartSubtitle}
            </p>
          )}

          <div className="mt-3 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 4, right: 20, bottom: 0, left: -20 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(data.length / 10) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                    color: "hsl(var(--popover-foreground))",
                    fontSize: "12px",
                  }}
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
        </div>
      </CardContent>

      {children && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

/* ──────────────── Collapsible detail table ──────────────── */

const PAGE_SIZE = 10;

interface DetailTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

function CollapsibleDetailTable<T extends { id: string }>({
  title,
  subtitle,
  emptyMessage,
  rows,
  columns,
  isLoading,
}: {
  title: string;
  subtitle: string;
  emptyMessage: string;
  rows: T[] | undefined;
  columns: DetailTableColumn<T>[];
  isLoading: boolean;
}) {
  const { locale, t } = useAppLocale();
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const items = rows ?? [];
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="-mx-3 w-[calc(100%+1.5rem)] rounded-lg border border-border/40 px-3 py-2.5 transition-colors hover:bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="text-left">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && items.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      {open && items.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`pb-2 pr-4 last:pr-0 ${col.align === "right" ? "text-right" : ""}`}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`py-2.5 pr-4 last:pr-0 ${col.align === "right" ? "text-right" : ""}`}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t("usage.pagination.showing", {
                  start: page * PAGE_SIZE + 1,
                  end: Math.min((page + 1) * PAGE_SIZE, items.length),
                  total: items.length,
                })}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Main page ───────────────────────── */

export default function UsagePage() {
  const { t } = useAppLocale();
  const { currentOrg } = useOrg();

  const [period, setPeriod] = useState<PeriodValue>("thisMonth");
  const [projectId, setProjectId] = useState<string>("all");

  const filterParams = {
    organizationId: currentOrg?.id,
    period,
    projectId: projectId === "all" ? undefined : projectId,
    tzOffset: new Date().getTimezoneOffset(),
  };

  const { data, isLoading } = trpc.usage.summary.useQuery(filterParams, {
    enabled: true,
  });

  const { data: projects } = trpc.project.list.useQuery(
    { organizationId: currentOrg?.id ?? "" },
    { enabled: !!currentOrg?.id },
  );

  const { data: sessionTxns, isLoading: sessionTxnsLoading } =
    trpc.usage.sessionTransactions.useQuery(filterParams, { enabled: true });
  const { data: templateTxns, isLoading: templateTxnsLoading } =
    trpc.usage.templateTransactions.useQuery(filterParams, { enabled: true });

  const sessionColumns = [
    {
      key: "interview",
      header: t("usage.table.interview"),
      render: (s: NonNullable<typeof sessionTxns>[number]) => (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="truncate">{s.interviewTitle}</span>
        </div>
      ),
    },
    {
      key: "participant",
      header: t("usage.table.participant"),
      render: (s: NonNullable<typeof sessionTxns>[number]) => (
        <span className="truncate text-muted-foreground">{s.participant}</span>
      ),
    },
    {
      key: "duration",
      header: t("usage.table.duration"),
      align: "right" as const,
      render: (s: NonNullable<typeof sessionTxns>[number]) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDuration(s.durationSeconds)}
        </span>
      ),
    },
    {
      key: "status",
      header: t("usage.table.status"),
      align: "right" as const,
      render: (s: NonNullable<typeof sessionTxns>[number]) => (
        <Badge variant="secondary" className="text-[10px] capitalize">
          {s.status.toLowerCase().replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "date",
      header: t("usage.table.date"),
      align: "right" as const,
      render: (s: NonNullable<typeof sessionTxns>[number]) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(s.createdAt)}
        </span>
      ),
    },
  ];

  const templateColumns = [
    {
      key: "title",
      header: t("usage.table.template"),
      render: (tRow: NonNullable<typeof templateTxns>[number]) => (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="truncate">{tRow.title}</span>
        </div>
      ),
    },
    {
      key: "project",
      header: t("usage.table.project"),
      render: (tRow: NonNullable<typeof templateTxns>[number]) => (
        <span className="truncate text-muted-foreground">{tRow.projectName}</span>
      ),
    },
    {
      key: "sessions",
      header: t("usage.table.sessions"),
      align: "right" as const,
      render: (tRow: NonNullable<typeof templateTxns>[number]) => (
        <span className="tabular-nums text-muted-foreground">
          {tRow.sessionCount}
        </span>
      ),
    },
    {
      key: "channels",
      header: t("usage.table.channels"),
      align: "right" as const,
      render: (tRow: NonNullable<typeof templateTxns>[number]) => (
        <div className="flex flex-wrap justify-end gap-1">
          {tRow.channels.map((ch) => (
            <Badge
              key={ch}
              variant="outline"
              className="text-[10px] font-normal"
            >
              {ch}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "date",
      header: t("usage.table.created"),
      align: "right" as const,
      render: (tRow: NonNullable<typeof templateTxns>[number]) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(tRow.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("usage.title")}</h1>
        <p className="text-muted-foreground">
          {t("usage.description")}
        </p>
      </div>

      {/* Filters & Plan Info */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={period}
          onValueChange={(v) => setPeriod(v as PeriodValue)}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(`usage.options.${opt.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("usage.allProjects")}
            </SelectItem>
            {(projects ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isLoading && data && (
          <div className="ml-auto flex items-center gap-2.5 rounded-lg border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
            <span>
              {formatDate(data.periodStart)} – {formatDate(data.periodEnd)}
            </span>
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h2 className="text-lg font-semibold">{t("usage.overview")}</h2>
      </div>

      {/* Usage Cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <UsageRing
            used={data.templates.used}
            limit={null}
            label={t("usage.templates.title")}
            icon={FileText}
            hideProgress
          />
          <UsageRing
            used={Math.round((data.sessionTime.usedSeconds / 3600) * 10) / 10}
            limit={null}
            label={t("usage.sessionTime.title")}
            icon={Clock}
            format="hours"
            totalSeconds={data.sessionTime.usedSeconds}
            hideProgress
          />
          <UsageRing
            used={data.seats.used}
            limit={null}
            label={t("usage.seats.title")}
            icon={Users}
            hideProgress
          />
        </div>
      ) : null}

      <Separator />

      {/* Detailed Usage per Resource */}
      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : data?.daily ? (
        <div className="space-y-8">
          <UsageDetailSection
            title={t("usage.sessionTime.title")}
            description={t("usage.sessionTime.desc")}
            chartTitle={t("usage.sessionTime.title")}
            chartSubtitle={t("usage.sessionTime.chartSubtitle")}
            total={formatHours(data.sessionTime.usedSeconds)}
            data={data.daily}
            dataKey="sessionMinutes"
            color="hsl(24, 80%, 55%)"
            yLabel={t("usage.minutesAbbr")}
          >
            <CollapsibleDetailTable
              title={t("usage.sessionTime.historyTitle")}
              subtitle={t("usage.sessionTime.historySubtitle")}
              emptyMessage={t("usage.sessionTime.empty")}
              rows={sessionTxns}
              columns={sessionColumns}
              isLoading={sessionTxnsLoading}
            />
          </UsageDetailSection>

          <UsageDetailSection
            title={t("usage.templates.title")}
            description={t("usage.templates.desc")}
            chartTitle={t("usage.templates.title")}
            chartSubtitle={t("usage.templates.chartSubtitle")}
            total={`${data.templates.used.toLocaleString()} ${t("usage.templatesAbbr")}`}
            data={data.daily}
            dataKey="templates"
            color="hsl(142, 60%, 45%)"
            yLabel={t("usage.templatesAbbr")}
          >
            <CollapsibleDetailTable
              title={t("usage.templates.historyTitle")}
              subtitle={t("usage.templates.historySubtitle")}
              emptyMessage={t("usage.templates.empty")}
              rows={templateTxns}
              columns={templateColumns}
              isLoading={templateTxnsLoading}
            />
          </UsageDetailSection>
        </div>
      ) : null}
    </div>
  );
}
