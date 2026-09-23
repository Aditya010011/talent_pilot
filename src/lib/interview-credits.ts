/**
 * Session / create-flow credit costs by interview type and duration.
 *
 * Default billing is 5 credits per 15 minutes (ceil to whole blocks), for
 * every type that currently spends credits. SYSTEM_ADMIN can change the
 * credits/minutes pair per type in Project Settings.
 *
 * Non-interactive interviews are charged at first pregeneration, not per
 * session. Chat-only interviews stay free unless a Chat rate with credits > 0
 * is saved. Regenerating a single pregenerated question clip remains 1 credit.
 *
 * Premium Vidu S1 Live is temporarily disabled in the create-interview UI.
 * Existing sessions with avatarMode="vidu" use the Real Time rate.
 */

export const DEFAULT_CREDITS_PER_BLOCK = 5;
export const DEFAULT_MINUTES_PER_BLOCK = 15;

/** @deprecated Duration is billed in configurable blocks, not a 10-minute threshold. */
export const CREDIT_DURATION_THRESHOLD_MINUTES = 10;

export type AvatarModeForCredits = "none" | "static" | "simli" | "vidu" | string;

export type InterviewCreditType =
  | "realtime_avatar"
  | "voice_only"
  | "non_interactive"
  | "chat"
  | "cv_analysis";

export interface CreditRate {
  credits: number;
  minutes: number;
}

export type CreditRates = Record<InterviewCreditType, CreditRate>;

export const INTERVIEW_CREDIT_TYPE_META: {
  type: InterviewCreditType;
  label: string;
  description: string;
}[] = [
  {
    type: "realtime_avatar",
    label: "Real Time",
    description: "Interactive live video avatar interviews (Simli / Vidu).",
  },
  {
    type: "voice_only",
    label: "Voice Only",
    description: "Live voice interviews with a static avatar photo.",
  },
  {
    type: "non_interactive",
    label: "Non-Interactive",
    description: "Pre-recorded avatar clips. Charged when videos are generated, not per session.",
  },
  {
    type: "chat",
    label: "Chat",
    description: "Chat-only interviews (no voice). Free unless credits are set above 0.",
  },
  {
    type: "cv_analysis",
    label: "CV Analysis",
    description: "Scanning and grading resumes against criteria (credits per candidate).",
  },
];

/** Matches current production charging: 5 credits / 15 minutes. Chat stays free. */
export const DEFAULT_CREDIT_RATES: CreditRates = {
  realtime_avatar: {
    credits: DEFAULT_CREDITS_PER_BLOCK,
    minutes: DEFAULT_MINUTES_PER_BLOCK,
  },
  voice_only: {
    credits: DEFAULT_CREDITS_PER_BLOCK,
    minutes: DEFAULT_MINUTES_PER_BLOCK,
  },
  non_interactive: {
    credits: DEFAULT_CREDITS_PER_BLOCK,
    minutes: DEFAULT_MINUTES_PER_BLOCK,
  },
  chat: { credits: 0, minutes: DEFAULT_MINUTES_PER_BLOCK },
  cv_analysis: { credits: 2, minutes: 10 },
};

export interface InterviewCreditInput {
  voiceEnabled?: boolean | null;
  videoEnabled?: boolean | null;
  avatarMode?: AvatarModeForCredits | null;
  is_voice_only?: boolean | null;
  isVoiceOnly?: boolean | null;
  /** Interview time limit in minutes; billed in ceil(minutes / rate.minutes) blocks. */
  timeLimitMinutes?: number | null;
  durationMinutes?: number | null;
}

/** Recruiter-facing interview type names. Chat is hidden from the product surface. */
export type InterviewTypeName = "Real Time" | "Voice Only" | "Non-Interactive";

export function getInterviewTypeLabel(
  interview: InterviewCreditInput,
): InterviewTypeName | null {
  // Chat-only (no voice) stays off recruiter badges. Missing voiceEnabled
  // still classifies from avatar / non-interactive flags.
  if (interview.voiceEnabled === false) return null;
  const type = resolveInterviewCreditType({
    ...interview,
    voiceEnabled: interview.voiceEnabled ?? true,
  });
  if (type === "chat") return null;
  if (type === "non_interactive") return "Non-Interactive";
  if (type === "realtime_avatar") return "Real Time";
  return "Voice Only";
}

export function interviewTypeI18nKey(type: InterviewTypeName): string {
  if (type === "Real Time") return "dashboard.video";
  if (type === "Voice Only") return "dashboard.voice";
  return "dashboard.nonInteractive";
}

const CREDIT_TYPE_SET = new Set<string>(
  INTERVIEW_CREDIT_TYPE_META.map((m) => m.type),
);

export function isInterviewCreditType(value: string): value is InterviewCreditType {
  return CREDIT_TYPE_SET.has(value);
}

export function normalizeCreditRate(raw?: Partial<CreditRate> | null): CreditRate {
  const credits = Number(raw?.credits);
  const minutes = Number(raw?.minutes);
  return {
    credits:
      Number.isFinite(credits) && credits >= 0
        ? credits
        : DEFAULT_CREDITS_PER_BLOCK,
    minutes:
      Number.isFinite(minutes) && minutes > 0
        ? Math.floor(minutes)
        : DEFAULT_MINUTES_PER_BLOCK,
  };
}

export function mergeCreditRates(
  rows?:
    | Array<{
        interviewType?: string | null;
        interview_type?: string | null;
        credits?: number | null;
        minutes?: number | null;
      }>
    | null,
): CreditRates {
  const merged: CreditRates = {
    realtime_avatar: { ...DEFAULT_CREDIT_RATES.realtime_avatar },
    voice_only: { ...DEFAULT_CREDIT_RATES.voice_only },
    non_interactive: { ...DEFAULT_CREDIT_RATES.non_interactive },
    chat: { ...DEFAULT_CREDIT_RATES.chat },
    cv_analysis: { ...DEFAULT_CREDIT_RATES.cv_analysis },
  };
  for (const row of rows ?? []) {
    const key = row.interviewType ?? row.interview_type;
    if (!key || !isInterviewCreditType(key)) continue;
    merged[key] = normalizeCreditRate({
      credits: row.credits ?? undefined,
      minutes: row.minutes ?? undefined,
    });
  }
  return merged;
}

export function getCreditDurationMinutes(
  interview: Pick<InterviewCreditInput, "timeLimitMinutes" | "durationMinutes">,
): number | null {
  const raw = interview.timeLimitMinutes ?? interview.durationMinutes;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Credits for a duration using ceil(minutes / rate.minutes) * rate.credits. */
export function costFromRate(
  rate: CreditRate,
  durationMinutes?: number | null,
): number {
  const resolved = normalizeCreditRate(rate);
  if (resolved.credits <= 0) return 0;
  const minutes = durationMinutes == null ? null : Number(durationMinutes);
  if (minutes != null && Number.isFinite(minutes) && minutes > 0) {
    const blocks = Math.max(1, Math.ceil(minutes / resolved.minutes));
    return blocks * resolved.credits;
  }
  return resolved.credits;
}

/**
 * Calculate cost from a duration. Optional `rate` overrides the default
 * 5 credits / 15 minutes. A non-positive `baseCost` with no rate stays free
 * (legacy callers).
 */
export function applyDurationCreditMultiplier(
  baseCost: number,
  durationMinutes?: number | null,
  rate?: CreditRate | null,
): number {
  if (rate == null && baseCost <= 0) return 0;
  return costFromRate(rate ?? DEFAULT_CREDIT_RATES.realtime_avatar, durationMinutes);
}

export function resolveInterviewCreditType(
  interview: InterviewCreditInput,
): InterviewCreditType {
  if (!interview.voiceEnabled) return "chat";

  const isVoiceOnly = Boolean(interview.is_voice_only ?? interview.isVoiceOnly);
  if (isVoiceOnly) return "non_interactive";

  const mode = interview.avatarMode ?? "none";
  if (mode === "simli" || mode === "vidu") return "realtime_avatar";
  return "voice_only";
}

/** Session charge sentinel (0 for chat / non-interactive). Unused by billing math. */
export function getSessionCreditBase(interview: InterviewCreditInput): number {
  const type = resolveInterviewCreditType(interview);
  if (type === "chat" || type === "non_interactive") return 0;
  return DEFAULT_CREDITS_PER_BLOCK;
}

export function getSessionCreditCost(
  interview: InterviewCreditInput,
  rates?: CreditRates | null,
): number {
  const type = resolveInterviewCreditType(interview);
  // Non-interactive is billed at pregeneration, not per live session.
  if (type === "non_interactive") return 0;
  const resolved = rates ?? DEFAULT_CREDIT_RATES;
  return costFromRate(resolved[type], getCreditDurationMinutes(interview));
}

/** First full pregen when creating a non-interactive interview (or coaching clips). */
export function getPregenerateInitialCreditCost(
  durationMinutes?: number | null,
  rates?: CreditRates | null,
): number {
  const rate = (rates ?? DEFAULT_CREDIT_RATES).non_interactive;
  return costFromRate(rate, durationMinutes);
}

const CREDIT_PRECISION_FACTOR = 10;

/** Round credit amounts to one decimal for storage / display math. */
export function normalizeCreditAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(
    (Math.round(value * CREDIT_PRECISION_FACTOR) / CREDIT_PRECISION_FACTOR).toFixed(1),
  );
}

/** Display org/header balance: whole numbers without decimals, else one decimal place. */
export function formatCreditBalance(value: number): string {
  const normalized = normalizeCreditAmount(value);
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

export function formatCreditRateBadge(rate?: CreditRate | null): string {
  const resolved = normalizeCreditRate(rate ?? DEFAULT_CREDIT_RATES.realtime_avatar);
  if (resolved.credits <= 0) return "Free";
  return `${resolved.credits} credits / ${resolved.minutes} minutes`;
}

/** Short UI badge text for a base cost, noting the configured block price. */
export function formatBaseCreditBadge(
  baseCost: number,
  rate?: CreditRate | null,
): string {
  if (baseCost <= 0 && rate == null) return "Free";
  return formatCreditRateBadge(rate);
}

export function getInterviewTypeCreditLabel(
  interview: InterviewCreditInput,
  rates?: CreditRates | null,
): string {
  const type = resolveInterviewCreditType({
    ...interview,
    voiceEnabled: interview.voiceEnabled ?? true,
  });
  const duration = getCreditDurationMinutes(interview);
  const resolved = rates ?? DEFAULT_CREDIT_RATES;

  if (type === "non_interactive") {
    const cost = getPregenerateInitialCreditCost(duration, resolved);
    return `Non-Interactive (${cost} credits)`;
  }

  const cost = getSessionCreditCost({ ...interview, voiceEnabled: true }, resolved);
  if (type === "realtime_avatar") return `Real Time (${cost} credits)`;
  return `Voice Only (${cost} credits)`;
}

export function getCvAnalysisCost(rates?: CreditRates | null): number {
  const resolved = (rates ?? DEFAULT_CREDIT_RATES).cv_analysis;
  if (!resolved || resolved.minutes <= 0) return 0.2; // fallback default
  return normalizeCreditAmount(resolved.credits / resolved.minutes);
}
