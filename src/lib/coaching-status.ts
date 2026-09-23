/* eslint-disable @typescript-eslint/no-explicit-any */

export function resolveCoachingSession(raw: unknown): any | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function isCoachingQuizEnabled(training: any): boolean {
  if (!training) return false;
  let settings = training.quiz_settings;
  if (typeof settings === "string") {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = {};
    }
  }
  if (settings?.enabled === false) return false;
  const questions = Array.isArray(training.quiz_questions) ? training.quiz_questions : [];
  return questions.length > 0;
}

export function hasCoachingQuizResults(session: any): boolean {
  const qr = session?.quiz_results;
  if (!qr) return false;
  return qr.completed === true || qr.percentageScore !== undefined && qr.percentageScore !== null;
}

function progressOf(session: any): any {
  const meta = session?.metadata;
  if (!meta || typeof meta !== "object") return null;
  return (meta as any).progress ?? null;
}

/** True when the learner finished the slides (training content), regardless of quiz. */
export function hasFinishedCoachingSlides(session: any): boolean {
  if (!session) return false;
  if (session.status === "COMPLETED") return true;
  const progress = progressOf(session);
  if (progress?.slidesCompleted) return true;
  if (progress?.quizState && progress.quizState !== "not_started") return true;
  return false;
}

/**
 * Display status for the coaching candidates table.
 * QUIZ PENDING only when the training currently has an enabled quiz
 * and the learner finished slides but has not submitted quiz results.
 */
export function getCoachingDisplayStatus(session: any, training?: any): string {
  const s = resolveCoachingSession(session);
  if (!s) return "Not Started";

  const quizOn = isCoachingQuizEnabled(training);
  const slidesDone = hasFinishedCoachingSlides(s);
  const quizDone = hasCoachingQuizResults(s);

  if (quizOn && slidesDone && !quizDone) return "QUIZ PENDING";
  if (s.status === "COMPLETED") return "COMPLETED";
  return s.status || "IN_PROGRESS";
}

export function isCoachingFullyComplete(session: any, training?: any): boolean {
  const s = resolveCoachingSession(session);
  if (!s) return false;
  if (s.status !== "COMPLETED") return false;
  if (!isCoachingQuizEnabled(training)) return true;
  return hasCoachingQuizResults(s);
}
