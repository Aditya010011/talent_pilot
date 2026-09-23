/**
 * Timeline helpers for interview results QA pairing.
 *
 * Coding questions often have little/no speech. Voice answers tagged during a
 * coding segment (or from a mic turn that started before the next spoken
 * question) can spill under the following verbal question with timestamps that
 * predate that question — producing "answer at 4:39 under question at 6:31".
 */

export type QaTimelineMessage = {
  role?: string;
  content?: string;
  timestamp?: string | null;
  questionId?: string | null;
  type?: string;
  [key: string]: unknown;
};

export type QaTimelinePair = {
  question: QaTimelineMessage | null;
  responses: QaTimelineMessage[];
};

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isCodingType(type: unknown): boolean {
  const t = String(type ?? "").toUpperCase();
  return t === "CODING" || t === "CODE";
}

/**
 * Clamp response timestamps so they never appear before their parent question,
 * and ensure question start markers are monotonic across the interview order
 * (coding gaps keep their duration via the gap between consecutive starts).
 */
export function normalizeQaTimeline(
  pairs: QaTimelinePair[],
  sessionStartMs = 0,
): QaTimelinePair[] {
  if (pairs.length === 0) return pairs;

  let prevQuestionMs = Number.isFinite(sessionStartMs) ? sessionStartMs : 0;

  return pairs.map((pair) => {
    const question = pair.question ? { ...pair.question } : null;
    let questionMs = parseMs(question?.timestamp ?? null);

    // Keep question starts monotonic so coding→spoken ordering stays sane.
    if (questionMs == null || questionMs < prevQuestionMs) {
      questionMs = prevQuestionMs;
      if (question) {
        question.timestamp = new Date(questionMs).toISOString();
      }
    } else {
      prevQuestionMs = questionMs;
    }

    // Coding questions have no spoken answer in this list; still advance the
    // floor so the next verbal question cannot collapse back into the coding
    // window when its assistant timestamp is missing/early.
    if (question && isCodingType(question.type)) {
      prevQuestionMs = questionMs;
    }

    const responses = (pair.responses ?? []).map((resp) => {
      const respMs = parseMs(resp?.timestamp ?? null);
      if (respMs == null) return resp;
      if (respMs >= questionMs) return resp;
      return {
        ...resp,
        timestamp: new Date(questionMs).toISOString(),
        _timestampClamped: true,
      };
    });

    // Floor for the next question: at least this question start. Prefer the
    // latest in-window response so coding spillover that was clamped still
    // leaves room for later questions.
    let nextFloor = questionMs;
    for (const resp of responses) {
      const ms = parseMs(resp?.timestamp ?? null);
      if (ms != null && ms > nextFloor) nextFloor = ms;
    }
    prevQuestionMs = Math.max(prevQuestionMs, nextFloor);

    return { question, responses };
  });
}

/** Format session start/end for the snapshot card (includes date when span crosses midnight). */
export function formatSessionClock(
  iso: string | null | undefined,
  opts?: { includeDate?: boolean },
): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  if (opts?.includeDate) {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function sessionSpanCrossesLocalDay(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): boolean {
  const a = parseMs(startIso);
  const b = parseMs(endIso);
  if (a == null || b == null) return false;
  const start = new Date(a);
  const end = new Date(b);
  return (
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate()
  );
}

/**
 * Prefer stored duration; if start/end are inverted or missing duration, fall back
 * to a non-negative wall span so the snapshot never shows nonsense like 1360 min
 * from a mis-ordered clock display alone.
 */
export function resolveDisplayDurationMinutes(
  totalDurationSeconds: number | null | undefined,
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
): number | null {
  if (
    typeof totalDurationSeconds === "number" &&
    Number.isFinite(totalDurationSeconds) &&
    totalDurationSeconds >= 0
  ) {
    return Math.floor(totalDurationSeconds / 60);
  }
  const start = parseMs(startedAt);
  const end = parseMs(completedAt);
  if (start == null || end == null || end < start) return null;
  return Math.floor((end - start) / 1000 / 60);
}
