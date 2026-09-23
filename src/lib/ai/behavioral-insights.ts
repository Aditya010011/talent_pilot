export interface FaceAnalysisResultRecord {
  dominantEmotion?: string | null;
  emotions?: Record<string, number>;
  timestamp?: string;
  eyeContact?: boolean;
}

export interface ToneSegment {
  question?: string;
  tone?: string;
  confidence?: string | number;
  notes?: string;
  start?: number;
  dominantEmotion?: string;
}

export function getEmotionConfidence(record: FaceAnalysisResultRecord): number {
  const emotion = record.dominantEmotion;
  if (!emotion || !record.emotions) return 0;
  return Number(record.emotions[emotion] ?? 0);
}

export function buildFaceAnalysisInput(
  metadata: Record<string, unknown> | null | undefined,
) {
  if (!metadata) return null;

  const results =
    (metadata.face_analysis_results as FaceAnalysisResultRecord[] | undefined) ??
    [];

  const emotions = results
    .filter((r) => r.dominantEmotion)
    .map((r) => ({
      emotion: r.dominantEmotion as string,
      confidence: getEmotionConfidence(r),
    }));

  if (
    emotions.length === 0 &&
    metadata.eye_contact_score === undefined &&
    metadata.missed_count === undefined &&
    metadata.multiple_faces_count === undefined
  ) {
    return null;
  }

  return {
    eyeContactScore: Number(metadata.eye_contact_score ?? 0),
    missedCount: Number(metadata.missed_count ?? 0),
    multipleFacesCount: Number(metadata.multiple_faces_count ?? 0),
    emotions,
  };
}

function mapEmotionToTone(emotion: string): string {
  const e = emotion.toLowerCase();
  if (["happy", "surprise"].includes(e)) return "enthusiastic";
  if (["sad", "fear", "angry", "disgust"].includes(e)) return "hesitant";
  return "neutral";
}

function formatConfidenceLevel(confidence: number): string {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

export function buildToneSegmentsFromFace(
  results: FaceAnalysisResultRecord[],
  questions?: { text: string }[],
  sessionStart?: string | null,
): ToneSegment[] {
  const withEmotion = results.filter((r) => r.dominantEmotion);
  if (withEmotion.length === 0) return [];

  const startMs = sessionStart ? new Date(sessionStart).getTime() : null;

  return withEmotion.map((record, idx) => {
    const conf = getEmotionConfidence(record);
    const questionIdx =
      questions && questions.length > 0
        ? Math.min(
            Math.floor((idx * questions.length) / withEmotion.length),
            questions.length - 1,
          )
        : 0;

    let start = idx * 60;
    if (record.timestamp && startMs && !Number.isNaN(startMs)) {
      const ts = new Date(record.timestamp).getTime();
      if (!Number.isNaN(ts)) {
        start = Math.max(0, Math.round((ts - startMs) / 1000));
      }
    }

    return {
      question: questions?.[questionIdx]?.text ?? `Segment ${idx + 1}`,
      tone: mapEmotionToTone(record.dominantEmotion as string),
      confidence: formatConfidenceLevel(conf),
      notes: `${record.dominantEmotion} detected (${Math.round(conf * 100)}% confidence)`,
      start,
      dominantEmotion: record.dominantEmotion ?? undefined,
    };
  });
}

function buildEmotionalPresenceFeedback(
  results: FaceAnalysisResultRecord[],
): string | undefined {
  const withEmotion = results.filter((r) => r.dominantEmotion);
  if (withEmotion.length === 0) return undefined;

  const counts = new Map<string, { total: number; n: number }>();
  for (const record of withEmotion) {
    const emotion = record.dominantEmotion as string;
    const conf = getEmotionConfidence(record);
    const prev = counts.get(emotion) ?? { total: 0, n: 0 };
    counts.set(emotion, { total: prev.total + conf, n: prev.n + 1 });
  }

  const summary = Array.from(counts.entries())
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 3)
    .map(([emotion, stats]) => {
      const avg = Math.round((stats.total / stats.n) * 100);
      return `${emotion} (${avg}% avg confidence, ${stats.n} reading${stats.n === 1 ? "" : "s"})`;
    })
    .join("; ");

  return `Detected emotional presence during the interview: ${summary}.`;
}

function inferOverallTone(results: FaceAnalysisResultRecord[]): string {
  const withEmotion = results.filter((r) => r.dominantEmotion);
  if (withEmotion.length === 0) return "neutral";

  let positive = 0;
  let negative = 0;
  for (const record of withEmotion) {
    const tone = mapEmotionToTone(record.dominantEmotion as string);
    if (tone === "enthusiastic") positive++;
    else if (tone === "hesitant") negative++;
  }

  if (positive > negative) return "confident";
  if (negative > positive) return "hesitant";
  return "neutral";
}

export function enrichInsightsFromMetadata(
  parsed: Record<string, unknown>,
  metadata: Record<string, unknown> | null | undefined,
  questions?: { text: string }[],
  sessionStart?: string | null,
): Record<string, unknown> {
  const faceResults =
    (metadata?.face_analysis_results as FaceAnalysisResultRecord[] | undefined) ??
    [];
  const eyeScore = Number(metadata?.eye_contact_score ?? 0);
  const missed = Number(metadata?.missed_count ?? 0);

  const toneAnalysis = (parsed.toneAnalysis as Record<string, unknown>) ?? {};
  const existingSegments = Array.isArray(toneAnalysis.segments)
    ? (toneAnalysis.segments as ToneSegment[])
    : [];
  const faceSegments = buildToneSegmentsFromFace(
    faceResults,
    questions,
    sessionStart,
  );
  const mergedSegments =
    existingSegments.length > 0 ? existingSegments : faceSegments;

  const behavioral = (parsed.behavioralAnalysis as Record<string, string>) ?? {};
  const emotionalFeedback =
    behavioral.emotionalPresenceFeedback ||
    buildEmotionalPresenceFeedback(faceResults);
  const eyeFeedback =
    behavioral.eyeContactFeedback ||
    (eyeScore > 0
      ? `Maintained ${eyeScore}% eye contact; gaze diverged ${missed} time${missed === 1 ? "" : "s"}.`
      : undefined);

  return {
    ...parsed,
    toneAnalysis: {
      overall:
        toneAnalysis.overall ??
        (mergedSegments.length > 0 ? inferOverallTone(faceResults) : "neutral"),
      details:
        toneAnalysis.details ||
        (mergedSegments.length > 0
          ? "Tone progression derived from live emotional presence readings and transcript patterns."
          : "Insufficient tone data available."),
      segments: mergedSegments,
    },
    behavioralAnalysis: {
      ...behavioral,
      ...(eyeFeedback ? { eyeContactFeedback: eyeFeedback } : {}),
      ...(emotionalFeedback
        ? { emotionalPresenceFeedback: emotionalFeedback }
        : {}),
      overallBehavioralInsight:
        behavioral.overallBehavioralInsight ||
        (faceResults.length > 0 || eyeScore > 0
          ? "Behavioral signals combine live video analysis with transcript-based communication patterns."
          : behavioral.overallBehavioralInsight),
    },
  };
}

export function resolveCommunicationToneSegments(options: {
  faceResults?: FaceAnalysisResultRecord[];
  toneSegments?: ToneSegment[];
  questions?: { text: string }[];
  sessionStart?: string | null;
}): ToneSegment[] {
  const faceResults = options.faceResults ?? [];
  if (faceResults.some((r) => r.dominantEmotion)) {
    return buildToneSegmentsFromFace(
      faceResults,
      options.questions,
      options.sessionStart,
    );
  }
  return options.toneSegments ?? [];
}
