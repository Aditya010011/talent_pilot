/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAppLocale } from "@/components/app-locale-provider";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  LineChart,
  Line,
} from "recharts";

const CustomRadarTick = ({ payload, x, y, textAnchor, fill, fontSize, fontWeight }: any) => {
  const text = payload.value;
  const words = text.split(" ");
  
  // Nudge the labels further out to prevent overlapping with grid numbers (like "10")
  let adjustedY = y;
  let adjustedX = x;
  
  if (textAnchor === "middle") {
    // Top or bottom point. 
    // Usually radar charts have the top point at y < 150.
    if (y < 150) {
      adjustedY -= 18; // Push top label up
    } else {
      adjustedY += 10; // Push bottom label down
    }
  } else if (textAnchor === "end") {
    // Left side labels
    adjustedX -= 12;
  } else if (textAnchor === "start") {
    // Right side labels
    adjustedX += 12;
  }
  
  if (words.length > 2 && text.length > 15) {
    const mid = Math.ceil(words.length / 2);
    const line1 = words.slice(0, mid).join(" ");
    const line2 = words.slice(mid).join(" ");
    
    return (
      <text x={adjustedX} y={adjustedY} textAnchor={textAnchor} fill={fill} fontSize={fontSize} fontWeight={fontWeight}>
        <tspan x={adjustedX} dy="-0.2em">{line1}</tspan>
        <tspan x={adjustedX} dy="1.2em">{line2}</tspan>
      </text>
    );
  }

  return (
    <text x={adjustedX} y={adjustedY} textAnchor={textAnchor} fill={fill} fontSize={fontSize} fontWeight={fontWeight}>
      <tspan x={adjustedX} dy="0.3em">{text}</tspan>
    </text>
  );
};

function getRadarChartLayout(isExporting: boolean) {
  if (isExporting) {
    return {
      outerRadius: "75%",
      margin: { top: 20, right: 36, bottom: 20, left: 36 },
    };
  }

  return {
    outerRadius: "78%",
    margin: { top: 12, right: 24, bottom: 12, left: 24 },
  };
}

const RESULTS_RADAR_HEIGHT_CLASS = "h-[360px] md:h-[480px]";
const RESULTS_MULTI_RADAR_HEIGHT_CLASS = "h-[400px] md:h-[520px]";
const RESULTS_BAR_LINE_HEIGHT_CLASS = "h-[280px] md:h-[360px]";
const EXPORT_RADAR_HEIGHT = 260;
const EXPORT_BAR_LINE_HEIGHT = 240;

// ─── Color palette ────────────────────────────────────────────────
const COLORS = {
  primary: "#2563eb", // Blue 600
  primaryLight: "#60a5fa", // Blue 400
  secondary: "#64748b", // Slate 500
  success: "#059669", // Emerald 600
  warning: "#d97706", // Amber 600
  danger: "#dc2626", // Red 600
  muted: "#94a3b8", // Slate 400
  accent1: "#4f46e5", // Indigo 600
  accent2: "#0891b2", // Cyan 600
  accent3: "#7c3aed", // Violet 600
  accent4: "#0d9488", // Teal 600
  accent5: "#2563eb", // Blue 600
  accent6: "#475569", // Slate 600
};

function getScoreColor(score: number): string {
  if (score >= 7) return COLORS.success;
  if (score >= 4) return COLORS.warning;
  return COLORS.danger;
}

const tooltipStyle = {
  backgroundColor: "rgba(15, 23, 42, 0.98)", // Slate 900
  border: "1px solid rgba(255, 255, 255, 0.2)",
  borderRadius: "12px",
  fontSize: "13px",
  fontWeight: "bold",
  color: "#ffffff", 
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
  backdropFilter: "blur(8px)",
  padding: "10px 14px",
};

// ─── Hireability Speedometer (Gauge) ──────────────────────────────
export function HireabilityGauge({
  score,
  maxScore = 10,
  isEdited,
  originalScore,
}: {
  score: number;
  maxScore?: number;
  technicalScore?: number;
  behavioralScore?: number;
  isEdited?: boolean;
  originalScore?: number | null;
}) {
  const getRecommendation = (s: number) => {
    if (s >= 8.0) return { label: "Strong Hire", color: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800" };
    if (s >= 5.0) return { label: "Hire with Reservations", color: "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800" };
    return { label: "Do Not Hire", color: "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800" };
  };

  const safeScore = typeof score === "number" && Number.isFinite(score) ? score : 0;
  const rec = getRecommendation(safeScore);
  const arcColor = getScoreColor(safeScore);
  const pct = Math.min(Math.max(safeScore / maxScore, 0), 1);

  // SVG coordinate space — fits cleanly in viewBox
  const VW = 420;
  const VH = 220;
  const cx = VW / 2;
  const cy = VH - 10;
  const R = 150;
  const THICK = 32;

  const toXY = (angleDeg: number, r: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };

  // Full track: 180° → 0°
  const trackS = toXY(180, R);
  const trackE = toXY(0,   R);

  // Filled portion: 180° → (180° - pct×180°)
  const fillEndAngle = 180 - pct * 180;
  const fillS = toXY(180,         R);
  const fillE = toXY(fillEndAngle, R);
  const largeArc = 0; // filled arc never exceeds 180°, so always take the short path

  // Label anchor points just outside the ring
  const LR = R + THICK / 2 + 10;
  const p0  = toXY(180, LR);
  const p5  = toXY(90,  LR);
  const p10 = toXY(0,   LR);

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-full max-w-[420px] md:max-w-[480px]">
        {/* SVG arc — no overflow, fits inside viewBox */}
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          style={{ display: "block", overflow: "hidden" }}
        >
          {/* Background track */}
          <path
            d={`M ${trackS.x} ${trackS.y} A ${R} ${R} 0 0 1 ${trackE.x} ${trackE.y}`}
            fill="none"
            stroke="rgba(148,163,184,0.2)"
            strokeWidth={THICK}
            strokeLinecap="butt"
          />
          {/* Filled arc */}
          {pct > 0 && (
            <path
              d={`M ${fillS.x} ${fillS.y} A ${R} ${R} 0 ${largeArc} 1 ${fillE.x} ${fillE.y}`}
              fill="none"
              stroke={arcColor}
              strokeWidth={THICK}
              strokeLinecap="butt"
            />
          )}
          {/* 0 / 5 / 10 labels */}
          <text x={p0.x}  y={p0.y + 4}  textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.55">0</text>
          <text x={p5.x}  y={p5.y - 6}  textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.55">5</text>
          <text x={p10.x} y={p10.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.55">10</text>
        </svg>

        {/* Score + badge — absolutely centered over the arc interior */}
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ bottom: "16%" }}>
          <span className="text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-none relative">
            {safeScore.toFixed(1)}<span className="text-2xl font-semibold opacity-50">/10</span>
          </span>
          {isEdited && originalScore !== null && originalScore !== undefined && (
             <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
               (originally {originalScore.toFixed(1)})
             </div>
          )}
          <div className={cn(
            "mt-2 rounded-full border px-4 py-1 text-[11px] font-black uppercase tracking-wider shadow",
            rec.color
          )}>
            {rec.label}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SimpleScoreGauge({ score, maxScore = 10 }: { score: number; maxScore?: number }) {
  const safeScore = typeof score === "number" && Number.isFinite(score) ? score : 0;
  const percentage = (safeScore / maxScore) * 100;
  const data = [{ name: "Score", value: percentage, fill: getScoreColor(safeScore) }];
  return (
    <div className="relative h-32 w-32 md:h-36 md:w-36">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          startAngle={90}
          endAngle={90 - (360 * percentage) / 100}
          data={data}
          barSize={10}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "rgba(148, 163, 184, 0.1)" }} dataKey="value" cornerRadius={4} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">{safeScore.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ─── Radar Chart for Assessment Criteria ──────────────────────────
export function CriteriaRadarChart({
  criteria,
  maxScore = 10,
  height,
  isExporting = false,
  color = "#2563eb",
}: {
  criteria: { name: string; score: number; reasoning: string }[];
  maxScore?: number;
  height?: number;
  isExporting?: boolean;
  color?: string;
}) {
  const data = criteria.map((c) => ({
    subject: c.name,
    fullName: c.name,
    score: c.score,
    fullMark: maxScore,
  }));

  const tickColor = isExporting ? "#1e293b" : "currentColor";
  const gridColor = isExporting ? "#94a3b8" : "rgba(148, 163, 184, 0.6)";
  const { outerRadius, margin } = getRadarChartLayout(isExporting);

  return (
    <div
      className={cn(
        "relative w-full flex items-center justify-center",
        height == null && !isExporting && RESULTS_RADAR_HEIGHT_CLASS,
      )}
      style={height != null ? { height } : isExporting ? { height: EXPORT_RADAR_HEIGHT } : undefined}
    >
      <ResponsiveContainer width="100%" height="100%" debounce={1} minWidth={0} minHeight={0}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius={outerRadius} margin={margin}>
          <PolarGrid
            gridType="polygon"
            stroke={gridColor}
            strokeWidth={isExporting ? 1 : 2}
            radialLines={true}
          />
          <PolarAngleAxis
            dataKey="subject"
            tick={<CustomRadarTick fontSize={12} fontWeight={800} fill={tickColor} />}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, maxScore]}
            tickCount={6}
            tick={{ fontSize: 10, fontWeight: 700, fill: isExporting ? "#64748b" : tickColor, opacity: isExporting ? 1 : 0.8 }}
            axisLine={{ stroke: gridColor, strokeWidth: isExporting ? 1 : 2 }}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke={color}
            strokeWidth={3}
            fill={color}
            fillOpacity={0.25}
            animationDuration={isExporting ? 0 : 1500}
            dot={{ r: 5, fill: color, stroke: "#fff", strokeWidth: 2 }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={((value: any, _name: any, props: any) => [
              `${Number(value).toFixed(2)} / ${maxScore}`,
              props.payload?.fullName || "Score",
            ]) as any}
            itemStyle={{ color: "#ffffff", fontWeight: "bold" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Multi-Candidate Radar Comparison ─────────────────────────────
export function MultiCriteriaRadarChart({
  criteriaNames,
  candidatesData,
  maxScore = 10,
  isExporting = false,
}: {
  criteriaNames: string[];
  candidatesData: { name: string; scores: Record<string, number>; color: string }[];
  maxScore?: number;
  isExporting?: boolean;
}) {
  const data = criteriaNames.map((name) => {
    const row: any = {
      subject: name,
      fullName: name,
      fullMark: maxScore,
    };
    candidatesData.forEach((c) => {
      row[c.name] = c.scores[name] || 0;
    });
    return row;
  });

  const tickColor = isExporting ? "#1e293b" : "currentColor";
  const gridColor = isExporting ? "#94a3b8" : "rgba(148, 163, 184, 0.6)";
  const { outerRadius, margin } = getRadarChartLayout(isExporting);

  return (
    <div
      className={cn("w-full", !isExporting && RESULTS_MULTI_RADAR_HEIGHT_CLASS)}
      style={isExporting ? { height: 400 } : undefined}
    >
      <ResponsiveContainer width="100%" height="100%" debounce={1} minWidth={0} minHeight={0}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius={outerRadius} margin={margin}>
        <PolarGrid gridType="polygon" stroke={gridColor} strokeWidth={isExporting ? 1 : 2} strokeDasharray="0" />
        <PolarAngleAxis
          dataKey="subject"
          tick={<CustomRadarTick fontSize={11} fontWeight={800} fill={tickColor} />}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, maxScore]}
          tickCount={6}
          tick={{ fontSize: 9, fill: isExporting ? "#64748b" : tickColor, opacity: isExporting ? 1 : 0.5 }}
          axisLine={{ stroke: gridColor, strokeOpacity: isExporting ? 1 : 0.2 }}
        />
        {candidatesData.map((c) => (
          <Radar
            key={c.name}
            name={c.name}
            dataKey={c.name}
            stroke={c.color}
            fill={c.color}
            fillOpacity={0.25}
            strokeWidth={3}
            animationDuration={isExporting ? 0 : 1500}
            dot={{ r: 5, fill: c.color, stroke: "#fff", strokeWidth: 2 }}
          />
        ))}
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={((value: any) => [`${Number(value).toFixed(2)} / ${maxScore}`, "Score"]) as any}
          itemStyle={{ color: "#ffffff", fontWeight: "bold" }}
        />
        <Legend 
          verticalAlign="bottom" 
          height={36} 
          wrapperStyle={{ fontSize: "12px", paddingTop: "20px" }}
        />
      </RadarChart>
    </ResponsiveContainer>
    </div>
  );
}

// ─── Horizontal Bar Chart for Per-Question Scores ─────────────────
export function QuestionScoresBarChart({
  evaluations,
  maxScore = 10,
  isExporting = false,
}: {
  evaluations: { question: string; score: number }[];
  maxScore?: number;
  isExporting?: boolean;
}) {
  const data = evaluations.map((e, i) => ({
    name: `Q${i + 1}`,
    fullQuestion: e.question,
    score: e.score,
  }));

  const tickColor = isExporting ? "#1e293b" : "currentColor";

  return (
    <div
      className={cn("w-full", !isExporting && "min-h-[280px] md:min-h-[360px]")}
      style={
        isExporting
          ? { height: EXPORT_BAR_LINE_HEIGHT }
          : { height: Math.max(280, data.length * 56 + 48) }
      }
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid
          strokeDasharray="4 4"
          stroke="rgba(148, 163, 184, 0.4)"
          strokeWidth={1.5}
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={[0, maxScore]}
          tick={{ fontSize: 11, fontWeight: 700, fill: isExporting ? "#64748b" : tickColor, opacity: isExporting ? 1 : 0.8 }}
          tickCount={6}
          axisLine={{ stroke: isExporting ? "#94a3b8" : "rgba(148, 163, 184, 0.6)", strokeWidth: isExporting ? 1 : 2 }}
        />
        <YAxis
          dataKey="name"
          type="category"
          tick={{ fontSize: 12, fontWeight: 600, fill: tickColor, opacity: isExporting ? 1 : 0.9 }}
          width={36}
          axisLine={{ stroke: isExporting ? "#94a3b8" : "currentColor", strokeOpacity: 0.1 }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={((value: any) => [`${Number(value).toFixed(2)} / ${maxScore}`, "Score"]) as any}
          itemStyle={{ color: "#ffffff", fontWeight: "bold" }}
          labelFormatter={((_label: any, payload: any[]) =>
            payload[0]?.payload?.fullQuestion || _label
          ) as any}
          cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
        />
        <Bar
          dataKey="score"
          radius={[0, 6, 6, 0]}
          animationDuration={isExporting ? 0 : 800}
          barSize={36}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={getScoreColor(entry.score)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

// ─── Benchmarking Horizontal Bar Chart ───────────────────────────
export function BenchmarkingBarChart({
  candidateScore,
  targetScore = 7.0,
  peerAverage = 6.2,
  maxScore = 10,
  isExporting = false,
}: {
  candidateScore: number;
  targetScore?: number;
  peerAverage?: number;
  maxScore?: number;
  isExporting?: boolean;
}) {
  const data = [
    { name: "Candidate", value: candidateScore, fill: COLORS.primary },
    { name: "Target", value: targetScore, fill: COLORS.accent3 },
    { name: "Peer Average", value: peerAverage, fill: COLORS.accent2 },
  ];

  const tickColor = isExporting ? "#1e293b" : "currentColor";

  return (
    <div
      className={cn("w-full", !isExporting && RESULTS_BAR_LINE_HEIGHT_CLASS)}
      style={isExporting ? { height: EXPORT_BAR_LINE_HEIGHT } : undefined}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} layout="vertical" margin={{ left: 80, right: 30, top: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="rgba(148, 163, 184, 0.4)" strokeWidth={1.5} />
        <XAxis type="number" domain={[0, maxScore]} hide />
        <YAxis 
          dataKey="name" 
          type="category" 
          axisLine={{ stroke: isExporting ? "#94a3b8" : "currentColor", strokeOpacity: 0.1 }} 
          tickLine={false}
          tick={{ fontSize: 12, fontWeight: 700, fill: tickColor, opacity: isExporting ? 1 : 0.9 }}
          width={80}
        />
        <Tooltip 
          cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} 
          contentStyle={tooltipStyle} 
          itemStyle={{ color: "#ffffff" }}
        />
        <Bar 
          dataKey="value" 
          radius={[0, 4, 4, 0]} 
          barSize={40}
          animationDuration={isExporting ? 0 : 1000}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

// ─── Sentiment & Tone Bar Chart ─────────────────────────────────
export function SentimentScoreBarChart({
  positivity,
  professionalism,
  confidence,
  isExporting = false,
}: {
  positivity: number;
  professionalism: number;
  confidence: number;
  isExporting?: boolean;
}) {
  const data = [
    { name: "Positivity", value: positivity, fill: COLORS.success },
    { name: "Professionalism", value: professionalism, fill: COLORS.primary },
    { name: "Confidence", value: confidence, fill: COLORS.warning },
  ];

  const tickColor = isExporting ? "#1e293b" : "currentColor";

  return (
    <div
      className={cn("w-full", !isExporting && RESULTS_BAR_LINE_HEIGHT_CLASS)}
      style={isExporting ? { height: EXPORT_BAR_LINE_HEIGHT } : undefined}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(148, 163, 184, 0.4)" strokeWidth={1.5} />
        <XAxis 
          dataKey="name" 
          axisLine={{ stroke: isExporting ? "#94a3b8" : "rgba(148, 163, 184, 0.6)", strokeWidth: 2 }} 
          tickLine={false}
          tick={{ fontSize: 12, fontWeight: 700, fill: tickColor, opacity: isExporting ? 1 : 0.9 }}
        />
        <YAxis domain={[0, 10]} axisLine={{ stroke: isExporting ? "#94a3b8" : "rgba(148, 163, 184, 0.6)", strokeWidth: 2 }} hide />
        <Tooltip 
          cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }} 
          contentStyle={tooltipStyle} 
          itemStyle={{ color: "#ffffff" }}
        />
        <Bar 
          dataKey="value" 
          radius={[6, 6, 0, 0]} 
          barSize={56}
          animationDuration={isExporting ? 0 : 1200}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

// ─── Helper: aggregate emotions from face analysis results ────────
export function aggregateEmotions(
  faceResults: any[],
): { emotion: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const r of faceResults) {
    const emotion = (r.dominantEmotion || r.dominant_emotion || "unknown") as string;
    const capitalized = emotion.charAt(0).toUpperCase() + emotion.slice(1);
    counts[capitalized] = (counts[capitalized] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([emotion, count]) => ({ emotion, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── Helper: derive verdict from score ────────────────────────────
export function getVerdict(score: number | null): "pass" | "review" | "fail" | null {
  if (score === null) return null;
  if (score >= 7) return "pass";
  if (score >= 4) return "review";
  return "fail";
}

function normalizeEmotionKey(emotion: string): string {
  const key = emotion.toLowerCase();
  if (key === "surprise") return "surprised";
  if (key === "disgust") return "disgusted";
  return key;
}

export function translateEmotionLabel(
  emotion: string,
  t: (key: string) => string,
): string {
  const normalized = normalizeEmotionKey(emotion);
  const translationKey = `results.emotions.${normalized}`;
  const translated = t(translationKey);
  if (translated !== translationKey) return translated;
  return emotion.charAt(0).toUpperCase() + emotion.slice(1);
}

export function translateSentimentLabel(
  sentiment: string | null | undefined,
  t: (key: string) => string,
): string {
  const value = (sentiment || "neutral").toLowerCase();
  if (value === "positive") return t("results.tone.positive");
  if (value === "negative") return t("results.tone.negative");
  return t("results.tone.neutral");
}

// ─── Big 5 Behavioral Radar Chart ────────────────────────────────
export function Big5RadarChart({
  big5,
  isExporting = false,
  height,
}: {
  big5: {
    openness?: number;
    conscientiousness?: number;
    extraversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  };
  isExporting?: boolean;
  height?: number;
}) {
  const { t } = useAppLocale();

  const data = useMemo(
    () => [
      { subject: t("results.personality.openness"), score: big5?.openness || 0, fullMark: 10 },
      { subject: t("results.personality.conscientiousness"), score: big5?.conscientiousness || 0, fullMark: 10 },
      { subject: t("results.personality.extraversion"), score: big5?.extraversion || 0, fullMark: 10 },
      { subject: t("results.personality.agreeableness"), score: big5?.agreeableness || 0, fullMark: 10 },
      { subject: t("results.personality.neuroticism"), score: big5?.neuroticism || 0, fullMark: 10 },
    ],
    [big5, t],
  );

  const tickColor = isExporting ? "#1e293b" : "currentColor";
  const gridColor = isExporting ? "#94a3b8" : "rgba(148, 163, 184, 0.6)";
  const { outerRadius, margin } = getRadarChartLayout(isExporting);

  return (
    <div
      className={cn(
        "relative w-full flex items-center justify-center",
        height == null && !isExporting && RESULTS_RADAR_HEIGHT_CLASS,
      )}
      style={height != null ? { height } : isExporting ? { height: EXPORT_RADAR_HEIGHT } : undefined}
    >
      <ResponsiveContainer width="100%" height="100%" debounce={1} minWidth={0} minHeight={0}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius={outerRadius} margin={margin}>
          <PolarGrid
            gridType="polygon"
            stroke={gridColor}
            strokeWidth={isExporting ? 1 : 2}
            radialLines={true}
          />
          <PolarAngleAxis
            dataKey="subject"
            tick={<CustomRadarTick fontSize={12} fontWeight={800} fill={tickColor} />}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 10]}
            tickCount={6}
            tick={{ fontSize: 10, fontWeight: 700, fill: isExporting ? "#64748b" : tickColor, opacity: isExporting ? 1 : 0.8 }}
            axisLine={{ stroke: gridColor, strokeWidth: isExporting ? 1 : 2 }}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#7c3aed"
            strokeWidth={3}
            fill="#7c3aed"
            fillOpacity={0.25}
            animationDuration={isExporting ? 0 : 1500}
            dot={{ r: 5, fill: "#7c3aed", stroke: "#fff", strokeWidth: 2 }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={((value: any, _name: any, props: any) => [
              `${Number(value).toFixed(1)} / 10`,
              props.payload?.subject || "Score",
            ]) as any}
            itemStyle={{ color: "#ffffff", fontWeight: "bold" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Communication Tone Line Chart ──────────────────────────────
export function CommunicationToneLineChart({
  segments,
  isExporting = false,
  height,
}: {
  segments: any[];
  isExporting?: boolean;
  height?: number;
}) {
  const { t, locale } = useAppLocale();
  const tickColor = isExporting ? "#1e293b" : "currentColor";
  const gridColor = isExporting ? "rgba(148, 163, 184, 0.4)" : "rgba(148, 163, 184, 0.2)";

  const formatYAxis = (val: number) => {
    if (val === 2) return t("results.tone.positive");
    if (val === 1) return t("results.tone.neutral");
    if (val === 0) return t("results.tone.negative");
    return "";
  };

  // Filter or map segments to data points
  const data = useMemo(() => (segments || []).map((seg, idx) => {
    let val = 1; // Neutral
    let sentimentLabel = "neutral";
    let emotionLabel = "";
    
    // Check if it's raw face_analysis_results (dominantEmotion)
    if (seg.dominantEmotion) {
      const e = seg.dominantEmotion.toLowerCase();
      emotionLabel = e;
      if (["happy", "surprise"].includes(e)) {
        val = 2;
        sentimentLabel = "positive";
      } else if (["sad", "angry", "fear", "disgust"].includes(e)) {
        val = 0;
        sentimentLabel = "negative";
      }
    } else {
      // Fallback to old toneAnalysis format
      const s = (seg.sentiment || seg.tone || "").toLowerCase();
      sentimentLabel = s;
      emotionLabel = s;
      if (s === "positive" || ["confident", "enthusiastic", "excited", "happy"].includes(s)) val = 2;
      else if (s === "negative" || ["hesitant", "uncertain", "anxious", "frustrated"].includes(s)) val = 0;
    }
    
    // Format start time if available
    const timeSec = seg.start !== undefined ? seg.start : (seg.startTime !== undefined ? seg.startTime : idx * 15);
    const m = Math.floor(timeSec / 60);
    const sec = Math.floor(timeSec % 60);
    const timeLabel = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

    return {
      time: timeLabel,
      value: val,
      sentiment: sentimentLabel,
      emotion: emotionLabel,
    };
  }), [segments]);

  if (data.length === 0) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center text-center w-full",
        !isExporting && RESULTS_BAR_LINE_HEIGHT_CLASS,
      )}
      style={isExporting ? { height: height ?? EXPORT_BAR_LINE_HEIGHT } : height != null ? { height } : undefined}
      >
        <p className="text-sm font-bold uppercase text-slate-500">{t("results.dataUnavailable")}</p>
      </div>
    );
  }

  return (
    <div
      className={cn("w-full", height == null && !isExporting && RESULTS_BAR_LINE_HEIGHT_CLASS)}
      style={
        height != null
          ? { height }
          : isExporting
            ? { height: EXPORT_BAR_LINE_HEIGHT }
            : undefined
      }
    >
      <ResponsiveContainer key={locale} width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={gridColor} strokeWidth={1} />
        <XAxis 
          dataKey="time" 
          axisLine={{ stroke: isExporting ? "#94a3b8" : "rgba(148, 163, 184, 0.6)", strokeWidth: 2 }} 
          tickLine={false}
          tick={{ fontSize: 10, fontWeight: 700, fill: tickColor, opacity: isExporting ? 1 : 0.7 }}
        />
        <YAxis 
          domain={[-0.5, 2.5]} 
          axisLine={false} 
          tickLine={false}
          ticks={[0, 1, 2]}
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fontWeight: 700, fill: tickColor, opacity: isExporting ? 1 : 0.9 }}
          width={70}
        />
        <Tooltip 
          contentStyle={tooltipStyle} 
          itemStyle={{ color: "#ffffff", fontWeight: "bold" }}
          formatter={(value: any, _name: any, props: any) => [
            props.payload.emotion
              ? translateEmotionLabel(props.payload.emotion, t)
              : formatYAxis(value as number),
            t("results.tone"),
          ]}
          labelFormatter={(label) => t("results.chartTime", { time: label })}
        />
        <Line 
          type="stepAfter" 
          dataKey="value" 
          stroke="#0891b2"
          strokeWidth={3} 
          dot={{ r: 4, fill: "#0891b2", stroke: "#fff", strokeWidth: 2 }}
          activeDot={{ r: 6, fill: "#0891b2", stroke: "#fff", strokeWidth: 2 }}
          animationDuration={isExporting ? 0 : 1500}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}

import { Star, StarHalf } from "lucide-react";

export function StarRating({
  score,
  size = "sm",
}: {
  score: number | null | undefined;
  size?: "sm" | "md";
}) {
  const safeScore = typeof score === "number" && Number.isFinite(score) ? score : 0;
  const starValue = safeScore / 2;
  const iconClass = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  const scoreClass = size === "md" ? "ml-2 text-sm font-black" : "ml-1.5 text-[11px] font-black";
  
  let colorClass = "text-red-500 fill-red-500";
  if (safeScore >= 8) {
    colorClass = "text-emerald-500 fill-emerald-500";
  } else if (safeScore >= 5) {
    colorClass = "text-amber-500 fill-amber-500";
  }

  return (
    <div className={cn("flex items-center", size === "md" ? "gap-1" : "gap-0.5")}>
      {Array.from({ length: 5 }).map((_, i) => {
        const starIndex = i + 1;
        if (starValue >= starIndex) {
          return <Star key={i} className={cn(iconClass, colorClass)} />;
        } else if (starValue >= starIndex - 0.5) {
          return <StarHalf key={i} className={cn(iconClass, colorClass)} />;
        } else {
          return <Star key={i} className={cn(iconClass, "text-slate-300 dark:text-slate-600 fill-transparent")} />;
        }
      })}
      <span className={cn(scoreClass, safeScore >= 8 ? "text-emerald-600 dark:text-emerald-400" : safeScore >= 5 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")}>
        {safeScore.toFixed(1)}
      </span>
    </div>
  );
}

export function CvRadarChart({
  data,
  height,
}: {
  data: { subject: string; score: number }[];
  height?: number;
}) {
  const { outerRadius, margin } = getRadarChartLayout(false);

  return (
    <div
      className={cn(
        "relative w-full flex items-center justify-center animate-fade-in",
        height == null && RESULTS_RADAR_HEIGHT_CLASS,
      )}
      style={height != null ? { height } : undefined}
    >
      <ResponsiveContainer width="100%" height="100%" debounce={1} minWidth={0} minHeight={0}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius={outerRadius} margin={margin}>
          <PolarGrid gridType="polygon" stroke="rgba(148, 163, 184, 0.4)" strokeWidth={1.5} />
          <PolarAngleAxis
            dataKey="subject"
            tick={<CustomRadarTick fontSize={12} fontWeight={750} fill="currentColor" />}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 10]}
            tickCount={6}
            tick={{ fontSize: 8, fill: "#64748b" }}
            axisLine={false}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#0d9488"
            strokeWidth={2.5}
            fill="#2dd4bf"
            fillOpacity={0.25}
            dot={{ r: 4, fill: "#0d9488", stroke: "#fff", strokeWidth: 1.5 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CvScoreGauge({ score }: { score: number }) {
  const percentage = score;
  const data = [{ name: "Score", value: percentage, fill: "#ea580c" }]; // orange circle
  return (
    <div className="relative h-36 w-36 md:h-44 md:w-44 flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="75%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          data={data}
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "rgba(148, 163, 184, 0.15)" }} dataKey="value" cornerRadius={6} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-slate-800 dark:text-white leading-none">{score}</span>
        <span className="text-[11px] font-bold text-slate-400 mt-1">/ 100</span>
      </div>
    </div>
  );
}
