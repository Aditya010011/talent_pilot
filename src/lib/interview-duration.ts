/** Interview duration options (minutes) and question budgets. */

export const INTERVIEW_DURATION_MINUTES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as readonly number[];

export function formatDurationOption(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** ~90–120s per question cycle: candidate answer + AI acknowledgement + optional follow-up. */
export function normalizeDurationMinutes(minutes?: number | null): number {
  const m = Math.round(Number(minutes) || 15);
  return Math.min(60, Math.max(1, m));
}

export function getQuestionBudget(minutes?: number | null): {
  min: number;
  max: number;
  target: number;
  label: string;
} {
  const dur = normalizeDurationMinutes(minutes);
  const target = Math.max(
    1,
    Math.min(12, Math.round(1 + ((dur - 1) * 7) / 19)),
  );
  const pad = dur >= 5 ? 1 : 0;
  const min = Math.max(1, target - pad);
  const max = Math.min(12, target + pad);
  const label = min === max ? `${target}` : `${min}–${max}`;
  return { min, max, target, label };
}

export function durationQuestionCountInstruction(minutes?: number | null): string {
  const budget = getQuestionBudget(minutes);
  const dur = normalizeDurationMinutes(minutes);
  return `Target duration: ${dur} minutes. Generate EXACTLY ${budget.target} questions (acceptable range: ${budget.label}). Each question needs time for the candidate to answer AND for the AI interviewer to acknowledge and transition (~2 minutes per question). Do NOT exceed ${budget.max} questions for a ${dur}-minute interview. Manual additions by the user may increase count later, but your generated set must fit the time budget.`;
}

export function trimQuestionsToDuration<T>(questions: T[], minutes?: number | null): T[] {
  if (!Array.isArray(questions) || questions.length === 0) return questions;
  const { max } = getQuestionBudget(minutes);
  if (questions.length <= max) return questions;
  return questions.slice(0, max);
}
