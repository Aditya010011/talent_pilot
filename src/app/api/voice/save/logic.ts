export type VoiceSavePayload = {
  sessionId?: string;
  messages?: Array<{
    role: string;
    content: string;
    questionId?: string | null;
    questionIndex?: number;  // per-message question index stamped at record time
    source?: string;
    timestamp?: string;
  }>;
  complete?: boolean;
  currentQuestionIndex?: number;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
};

export type ActivitySegment = { enteredAt: string; leftAt: string | null };

const ACTIVITY_GAP_CAP_MS = 5 * 60 * 1000;
const STALE_SESSION_GRACE_MS = 10 * 60 * 1000;

/**
 * For IN_PROGRESS sessions, caps the effective "now" so that abandoned
 * sessions don't accumulate unbounded duration. If the session's last
 * activity was more than STALE_SESSION_GRACE_MS ago, we treat the session
 * as having ended shortly after that last activity.
 */
export function effectiveNowForSession(
  lastActivityAt: string | null | undefined,
  nowMs: number,
): number {
  if (!lastActivityAt) return nowMs;
  const lastMs = new Date(lastActivityAt).getTime();
  if (Number.isNaN(lastMs)) return nowMs;
  return Math.min(nowMs, lastMs + STALE_SESSION_GRACE_MS);
}

export function computeSegmentDuration(
  segments: ActivitySegment[],
  nowMs: number,
): number {
  let totalMs = 0;
  for (const seg of segments) {
    const start = new Date(seg.enteredAt).getTime();
    const end = seg.leftAt ? new Date(seg.leftAt).getTime() : nowMs;
    if (end > start) totalMs += end - start;
  }
  return Math.round(totalMs / 1000);
}

/**
 * Fallback for pre-migration sessions without activity segments.
 * Sums gaps between consecutive message timestamps, capping each gap
 * at 5 minutes to exclude idle periods.
 */
export function computeMessageBasedDuration(
  sessionStartMs: number,
  messageTimestamps: number[],
  endMs: number,
): number {
  const points = [sessionStartMs, ...messageTimestamps, endMs].sort(
    (a, b) => a - b,
  );
  let totalMs = 0;
  for (let i = 1; i < points.length; i++) {
    totalMs += Math.min(points[i] - points[i - 1], ACTIVITY_GAP_CAP_MS);
  }
  return Math.round(totalMs / 1000);
}

export type CompletionSession = {
  startedAt: string;
  status?: string | null;
  language?: string | null;
  interview: {
    title: string;
    objective: string | null;
    language: string;
    userId: string;
    projectId: string;
    assessmentCriteria: { name: string; description: string }[] | null;
    questions: { text: string; order: number; type?: string }[];
  };
};

export type ProgressSession = {
  currentQuestionId?: string | null;
  questionsAsked?: string[];
  interview: {
    questions: { id: string; order?: number }[];
  };
};

export type VoiceSaveOps = {
  insertMessages: (
    sessionId: string,
    messages: NonNullable<VoiceSavePayload["messages"]>,
  ) => Promise<void>;
  loadSessionForCompletion: (
    sessionId: string,
  ) => Promise<CompletionSession | null>;
  loadFirstMessageTimestamp: (sessionId: string) => Promise<string | null>;
  loadSessionForProgress: (sessionId: string) => Promise<ProgressSession | null>;
  updateSession: (
    sessionId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  generateSummary: (
    sessionId: string,
    interviewTitle: string,
    objective?: string | null,
    language?: string | null,
    questions?: { text: string; order: number; type?: string }[] | null,
    assessmentCriteria?: { name: string; description: string }[] | null,
  ) => Promise<void>;
  log: {
    info: (message: string) => void;
    error: (...args: unknown[]) => void;
  };
  now: () => Date;
};

export async function handleVoiceSave(
  payload: VoiceSavePayload,
  ops: VoiceSaveOps,
): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
  const { sessionId, messages, complete, currentQuestionIndex } = payload;
  ops.log.info(`handleVoiceSave: session=${sessionId}, msgs=${messages?.length}, complete=${complete}, qIdx=${currentQuestionIndex}`);

  if (!sessionId) {
    return { status: 400, body: { error: "Missing sessionId" } };
  }

  try {
    if (messages && Array.isArray(messages) && messages.length > 0) {
      // Resolve questionIds: load questions once if any message carries a questionIndex
      const needsQuestionLookup = messages.some((m) => typeof m.questionIndex === "number");
      let questionIdMap: string[] = [];
      if (needsQuestionLookup) {
        const session = await ops.loadSessionForProgress(sessionId);
        questionIdMap = (session?.interview?.questions ?? [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((q) => q.id);
      }
      const enrichedMessages = messages.map((m) => ({
        ...m,
        // Prefer explicit questionId, then resolve from per-message questionIndex
        questionId: m.questionId ||
          (typeof m.questionIndex === "number" ? (questionIdMap[m.questionIndex] ?? null) : null),
      }));
      await ops.insertMessages(sessionId, enrichedMessages);
    }

    if (complete) {
      const session = await ops.loadSessionForCompletion(sessionId);
      const now = ops.now();

      // Messages may still flush after /api/session/complete already flipped status.
      // Never rewrite startedAt/completedAt/duration on an already-terminal session —
      // that race produced "end before start" snapshots and huge durations.
      if (session?.status === "COMPLETED" || session?.status === "ABANDONED") {
        if (payload.tokenUsage) {
          await ops.updateSession(sessionId, { tokenUsage: payload.tokenUsage });
        }
        ops.log.info(
          `Session ${sessionId} already ${session.status} — skipped completion rewrite`,
        );
        return { status: 200, body: { ok: true } };
      }

      // Always flip status even if interview/metadata load fails or there are zero messages
      if (session) {
        const firstMessageTimestamp =
          await ops.loadFirstMessageTimestamp(sessionId);

        const originalStartMs = new Date(session.startedAt).getTime();
        const firstMsgMs = firstMessageTimestamp
          ? new Date(firstMessageTimestamp).getTime()
          : NaN;
        const completedMs = now.getTime();
        // Trim pre-speech idle via first message only when that stamp sits inside
        // [startedAt, completedAt]. Skewed client clocks must not push start past end.
        let safeStart = Number.isFinite(originalStartMs) ? originalStartMs : completedMs;
        if (
          Number.isFinite(firstMsgMs) &&
          firstMsgMs >= safeStart &&
          firstMsgMs <= completedMs
        ) {
          safeStart = firstMsgMs;
        }
        const duration = Math.max(
          0,
          Math.round((completedMs - safeStart) / 1000),
        );

        const progressSession = await ops.loadSessionForProgress(sessionId);
        let finalQuestionsAsked = progressSession?.questionsAsked ?? [];
        const finalQId = progressSession?.currentQuestionId;
        if (finalQId && !finalQuestionsAsked.includes(finalQId)) {
          finalQuestionsAsked = [...finalQuestionsAsked, finalQId];
        }

        await ops.updateSession(sessionId, {
          status: "COMPLETED" as const,
          completedAt: now.toISOString(),
          startedAt: new Date(safeStart).toISOString(),
          totalDurationSeconds: duration,
          questionsAsked: finalQuestionsAsked,
          ...(payload.tokenUsage ? { tokenUsage: payload.tokenUsage } : {}),
        });

        ops.log.info(`Session ${sessionId} marked COMPLETED (${duration}s)`);

        const interview = session.interview;
        const reportLanguage = session.language || interview.language;
        ops
          .generateSummary(
            sessionId,
            interview.title,
            interview.objective,
            reportLanguage,
            interview.questions,
            interview.assessmentCriteria,
          )
          .catch((err) => {
            ops.log.error("Background summary generation failed:", err);
          });
      } else {
        // Minimal unconditional completion — no speech/transcript required
        await ops.updateSession(sessionId, {
          status: "COMPLETED" as const,
          completedAt: now.toISOString(),
          ...(payload.tokenUsage ? { tokenUsage: payload.tokenUsage } : {}),
        });
        ops.log.info(
          `Session ${sessionId} marked COMPLETED (minimal — no interview join)`,
        );
      }
    } else if (typeof currentQuestionIndex === "number") {
      const session = await ops.loadSessionForProgress(sessionId);

      if (session) {
        const questions = session.interview?.questions ?? [];
        const question = questions[currentQuestionIndex];
        
        let updatedQuestionsAsked = session.questionsAsked ?? [];
        if (session.currentQuestionId && session.currentQuestionId !== question?.id) {
          if (!updatedQuestionsAsked.includes(session.currentQuestionId)) {
            updatedQuestionsAsked = [...updatedQuestionsAsked, session.currentQuestionId];
          }
        }
        
        await ops.updateSession(sessionId, {
          ...(question ? { currentQuestionId: question.id } : {}),
          questionsAsked: updatedQuestionsAsked,
          lastActivityAt: ops.now().toISOString(),
        });

        ops.log.info(
          `Progress saved for session ${sessionId} at question ${currentQuestionIndex + 1}`,
        );
      }
    } else {
      await ops.updateSession(sessionId, {
        lastActivityAt: ops.now().toISOString(),
      });

      ops.log.info(`Heartbeat saved for session ${sessionId}`);
    }

    return { status: 200, body: { ok: true } };
  } catch (error) {
    ops.log.error("Voice save error:", error);
    return { status: 500, body: { error: "Failed to save voice data" } };
  }
}
