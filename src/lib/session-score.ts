type ScoreEntry =
  | {
      score?: number | string | null;
      evaluation?: string | null;
    }
  | null
  | undefined;

export type SessionScoreInsights =
  | {
      insufficientData?: boolean | null;
      questionEvaluations?: ScoreEntry[] | null;
      criteriaEvaluations?: ScoreEntry[] | null;
    }
  | null
  | undefined;

function parseScore(entry: ScoreEntry): number | null {
  if (!entry || entry.score == null) return null;
  const n =
    typeof entry.score === "number" ? entry.score : Number(entry.score);
  return Number.isFinite(n) ? n : null;
}

/** Unanswered / not-reached items — based on evaluation text, not score===0. */
function isUnansweredQuestion(entry: ScoreEntry): boolean {
  if (!entry) return true;
  const evaluation = (entry.evaluation ?? "").toLowerCase();
  return (
    evaluation.includes("no substantive answer") ||
    evaluation.includes("not substantively answered") ||
    evaluation.includes("unanswered") ||
    evaluation.includes("did not answer") ||
    evaluation.includes("not reached")
  );
}

function averageScore(
  entries: ScoreEntry[] | null | undefined,
  options?: { excludeUnanswered?: boolean },
): number | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const allScores = entries
    .map(parseScore)
    .filter((score): score is number => score !== null);

  if (allScores.length === 0) return null;

  if (options?.excludeUnanswered) {
    const answeredScores = entries
      .filter((entry) => !isUnansweredQuestion(entry))
      .map(parseScore)
      .filter((score): score is number => score !== null);
    if (answeredScores.length > 0) {
      return (
        answeredScores.reduce((sum, score) => sum + score, 0) /
        answeredScores.length
      );
    }
    // Every question marked unanswered — still a real overall of 0, not "no score"
    return 0;
  }

  return allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
}

export function getSessionOverallScore(
  insights: SessionScoreInsights,
): number | null {
  if (!insights || Array.isArray(insights)) return null;

  const questionScore = averageScore(insights.questionEvaluations, {
    excludeUnanswered: true,
  });
  if (questionScore !== null) return questionScore;

  const criteriaScore = averageScore(insights.criteriaEvaluations);
  if (criteriaScore !== null) return criteriaScore;

  // Analyzed session with no scoreable answers — show 0, not blank
  if (insights.insufficientData === true) return 0;

  return null;
}

export function usesQuestionEvaluationScore(
  insights: SessionScoreInsights,
): boolean {
  return averageScore(insights?.questionEvaluations) !== null;
}
