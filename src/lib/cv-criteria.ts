/**
 * CV Assessment / JD Alignment criteria used in resume analysis.
 * Graph labels stay short (max 2 words); dropdown shows a one-sentence description.
 */

export type CvCriterion = {
  name: string;
  description: string;
};

/** Accepts legacy string[] or {name, description}[] from AI / DB. */
export function normalizeCvCriteria(raw: unknown): CvCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): CvCriterion | null => {
      if (typeof item === "string") {
        const name = clampCriterionName(item);
        return name ? { name, description: item.trim() === name ? "" : item.trim() } : null;
      }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const rawName =
          typeof obj.name === "string"
            ? obj.name
            : typeof obj.label === "string"
              ? obj.label
              : "";
        const name = clampCriterionName(rawName);
        if (!name) return null;
        const description =
          typeof obj.description === "string"
            ? obj.description.trim()
            : typeof obj.requirement === "string"
              ? obj.requirement.trim()
              : "";
        return { name, description };
      }
      return null;
    })
    .filter((c): c is CvCriterion => !!c);
}

/** Keep graph labels to at most two words. */
export function clampCriterionName(value: string): string {
  const cleaned = value
    .replace(/[_/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ").filter(Boolean);
  return words.slice(0, 2).join(" ");
}

export function findCvCriterionDescription(
  criteria: CvCriterion[],
  name: string,
): string {
  const needle = name.trim().toLowerCase();
  const hit = criteria.find((c) => c.name.trim().toLowerCase() === needle);
  return hit?.description?.trim() || "";
}

function normalizeCriterionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function criterionTokens(value: string): string[] {
  return normalizeCriterionText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function tokenOverlapScore(a: string, b: string): number {
  const aTokens = criterionTokens(a);
  const bTokens = criterionTokens(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const token of Array.from(aSet)) {
    if (bSet.has(token)) overlap += 1;
  }

  if (overlap === 0) return 0;
  return overlap / Math.max(Math.min(aSet.size, bSet.size), 1);
}

function criterionMatchScore(a: string, b: string): number {
  const na = normalizeCriterionText(a);
  const nb = normalizeCriterionText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const overlap = tokenOverlapScore(na, nb);
  if (overlap >= 0.75) return 0.75;
  if (overlap >= 0.5) return 0.5;
  return 0;
}

/** Case-insensitive exact, normalized, or high-overlap match for criteria. */
export function cvCriterionNamesMatch(a: string, b: string): boolean {
  return criterionMatchScore(a, b) >= 0.5;
}

function findBestCriterionMatch<T>(
  configured: CvCriterion,
  scored: T[],
  getCandidateTexts: (item: T) => string[],
): T | undefined {
  let bestIndex = -1;
  let bestScore = 0;

  for (let idx = 0; idx < scored.length; idx += 1) {
    const item = scored[idx];
    const texts = getCandidateTexts(item).filter(Boolean);
    let score = 0;

    for (const text of texts) {
      score = Math.max(score, criterionMatchScore(text, configured.name));
      if (configured.description) {
        score = Math.max(score, criterionMatchScore(text, configured.description));
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = idx;
    }
  }

  if (bestIndex >= 0 && bestScore >= 0.5) {
    return scored.splice(bestIndex, 1)[0];
  }

  return undefined;
}

export type CvRubricScore = {
  subject: string;
  score: number;
  description: string;
};

export type CvJdAlignmentScore = {
  subject: string;
  score: number;
  fullRequirement: string;
  description: string;
  coverage?: string;
  evidence?: string;
};

/**
 * Always show every configured resume-assessment criterion.
 * Use the scored value when present; otherwise fill score 0.
 */
export function mergeCvAssessmentRubrics(
  configured: CvCriterion[],
  scored: CvRubricScore[],
): CvRubricScore[] {
  if (configured.length === 0) return scored;
  const remaining = [...scored];
  return configured.map((c) => {
    const hit = findBestCriterionMatch(c, remaining, (s) => [s.subject, s.description]);
    return {
      subject: c.name,
      score: hit ? Math.max(0, Math.min(10, hit.score)) : 0,
      description: (c.description || hit?.description || "").trim(),
    };
  });
}

/**
 * Always show every configured JD-alignment criterion.
 * Use the scored value when present; otherwise fill score 0 / Missing.
 */
export function mergeJdAlignmentProfile(
  configured: CvCriterion[],
  scored: CvJdAlignmentScore[],
): CvJdAlignmentScore[] {
  if (configured.length === 0) return scored;
  const remaining = [...scored];
  const canFallbackByIndex = scored.length === configured.length;
  return configured.map((c, idx) => {
    let hit = findBestCriterionMatch(
      c,
      remaining,
      (s) => [s.subject, s.fullRequirement, s.description, s.evidence || ""],
    );

    if (!hit && canFallbackByIndex) {
      hit = remaining.splice(Math.min(idx, remaining.length - 1), 1)[0];
    }

    return {
      subject: c.name,
      score: hit ? Math.max(0, Math.min(10, hit.score)) : 0,
      fullRequirement: (hit?.fullRequirement || c.description || c.name).trim(),
      description: (c.description || hit?.description || "").trim(),
      coverage: hit?.coverage || "Missing",
      evidence: (hit?.evidence || "No evidence found in CV analysis.").trim(),
    };
  });
}

/** Map matching-matrix coverage to a 0–10 radar score. */
export function coverageToRadarScore(coverage: string | undefined): number {
  const cov = (coverage || "").toLowerCase();
  if (cov === "yes") return 9.0;
  if (cov === "partial") return 6.0;
  if (cov === "missing" || cov === "no") return 0;
  return 0;
}

/** Zod-friendly union for create/update inputs. */
export const cvCriterionInputSchema = {
  // Used inline in routers as z.union([...])
};

/**
 * Calculates the dynamic CV score based on configured assessment and JD alignment criteria.
 * This ensures the score shown on candidate lists matches the detailed interview results view.
 */
export function getDynamicCvScore(
  cvAnalysis: any,
  sessionSummary: any
): number | null {
  if (!cvAnalysis) return null;
  
  const configuredAssessment = normalizeCvCriteria(sessionSummary?.cvAssessmentCriteria);
  const defaultCriteria = [
    { name: "Grammar & Spelling", description: "Absence of typos, grammatical errors, and poor formatting." },
    { name: "Clarity & Formatting", description: "Easy to read, logical flow, and professional layout." },
    { name: "Impact Metrics", description: "Use of quantifiable results and specific achievements." },
  ];

  const breakdownRubrics = (cvAnalysis.scoreBreakdown || [])
    .filter((f: any) => f?.factor && typeof f?.points === 'number')
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

  const fallbackRubrics = (() => {
    const interviewCriteria = (sessionSummary?.assessmentCriteria || [])
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
    return rubricsList.map(c => {
      const b = breakdownRubrics.find((br: any) => br.subject.toLowerCase() === c.name.toLowerCase());
      const score = b ? b.score : Math.max(1, Math.min(10, (cvAnalysis.overallScore || 65) / 10));
      return {
        subject: c.name,
        score,
        description: c.description || "",
      };
    });
  })();

  const scoredRubrics = breakdownRubrics.length > 0 ? breakdownRubrics : fallbackRubrics;

  const rubrics = configuredAssessment.length > 0
    ? mergeCvAssessmentRubrics(configuredAssessment, scoredRubrics)
    : scoredRubrics.length >= 3 ? scoredRubrics : fallbackRubrics;

  const configuredJd = normalizeCvCriteria(sessionSummary?.cvJdAlignmentCriteria);

  const matrixRows = (cvAnalysis.matchingMatrix || []).slice(0, 8).map((m: any) => ({
    subject: m.label || (m.requirement?.length > 28 ? m.requirement.slice(0, 28) + "…" : m.requirement || "Requirement"),
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

  const profile = configuredJd.length > 0
    ? mergeJdAlignmentProfile(configuredJd, scoredJd)
    : matrixRows.length >= 2 ? matrixRows : defaultJdParams;

  const allScores = [...rubrics, ...profile].map(item => item.score);
  if (allScores.length === 0) return cvAnalysis.overallScore || 0;
  const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  return Math.round(avg * 10);
}
