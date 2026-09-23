/** Years-of-experience tier for tie-breaking (higher = more experience). */
export function getExperienceTier(workExperience?: string | null): number {
  if (!workExperience) return 0;
  const exp = workExperience.toLowerCase();
  if (exp.includes("more than 10")) return 5;
  if (exp.includes("5 - 10") || exp.includes("5-10")) return 4;
  if (exp.includes("3 - 5") || exp.includes("3-5")) return 3;
  if (exp.includes("1 - 3") || exp.includes("1-3")) return 2;
  if (exp.includes("less than")) return 1;
  return 0;
}

/** Education tier for tie-breaking when experience is equal (higher = more advanced). */
export function getEducationTier(education?: string | null): number {
  if (!education) return 0;
  const edu = education.toLowerCase();
  if (edu.includes("phd") || edu.includes("doctorate")) return 4;
  if (edu.includes("master") || edu.includes("mba")) return 3;
  if (edu.includes("bachelor")) return 2;
  if (edu.includes("college") || edu.includes("associate")) return 1;
  return 0;
}

export interface CandidateTieBreakProfile {
  workExperience?: string | null;
  education?: string | null;
}

/**
 * When scores are tied, rank higher experience first, then higher education.
 * Returns negative if `a` should rank above `b`.
 */
export function compareCandidateTieBreakers(
  a: CandidateTieBreakProfile,
  b: CandidateTieBreakProfile,
): number {
  const experienceCmp =
    getExperienceTier(b.workExperience) - getExperienceTier(a.workExperience);
  if (experienceCmp !== 0) return experienceCmp;
  return getEducationTier(b.education) - getEducationTier(a.education);
}
