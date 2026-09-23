export { LANGUAGES } from "./languages";

export const AI_TONES = [
  { value: "CASUAL", label: "Casual" },
  { value: "PROFESSIONAL", label: "Professional" },
  { value: "FORMAL", label: "Formal" },
  { value: "FRIENDLY", label: "Friendly" },
] as const;

/** Follow-ups are disabled; kept for API compatibility (always LIGHT / 0). */
export const FOLLOW_UP_DEPTHS = [
  { value: "LIGHT", label: "No follow-up", description: "0 follow-ups" },
] as const;
