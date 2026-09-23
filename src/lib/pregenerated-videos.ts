/**
 * Pregenerated Vidu clip store — versioned clips (v1, v2, …) so edits
 * can regenerate one question without discarding prior credit spend.
 */

export type ClipVersion = {
  v: number;
  url: string;
  text: string;
  createdAt: string;
};

export type VersionedClip = {
  versions: ClipVersion[];
  activeVersion: number;
  /** Present for question clips so reorder/edit stays stable. */
  questionId?: string;
};

export type PregeneratedStoreV2 = {
  schemaVersion: 2;
  status?: string;
  intro?: VersionedClip;
  /** Parallel to interview question order when generated; prefer questionId. */
  questions: VersionedClip[];
  outro?: VersionedClip;
  headNod?: VersionedClip;
  error?: string;
  note?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  progress?: string;
  processingTarget?: string;
  missingQuestions?: string[];
};

/** Flat playback shape consumed by PregeneratedInterface. */
export type PregeneratedPlayback = {
  intro: string;
  questions: string[];
  outro: string;
  headNod?: string;
  status?: string;
};

export type PregeneratedVideosPayload = PregeneratedStoreV2 & {
  // Legacy flat fields (schemaVersion missing / 1)
  intro?: VersionedClip | string;
  questions?: VersionedClip[] | string[];
  questionTexts?: string[];
  outro?: VersionedClip | string;
  headNod?: VersionedClip | string;
};

function isVersionedClip(value: unknown): value is VersionedClip {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as VersionedClip).versions) &&
    typeof (value as VersionedClip).activeVersion === "number"
  );
}

export function wrapUrlAsV1(
  url: string,
  text: string,
  questionId?: string,
  createdAt = new Date().toISOString(),
): VersionedClip {
  return {
    questionId,
    activeVersion: 1,
    versions: [{ v: 1, url, text, createdAt }],
  };
}

export function getActiveVersion(clip: VersionedClip | undefined | null): ClipVersion | undefined {
  if (!clip?.versions?.length) return undefined;
  return (
    clip.versions.find((x) => x.v === clip.activeVersion) ||
    clip.versions[clip.versions.length - 1]
  );
}

export function getActiveUrl(clip: VersionedClip | undefined | null): string | undefined {
  const active = getActiveVersion(clip);
  return active?.url || undefined;
}

export function replaceClipVersion(
  existing: VersionedClip | undefined | null,
  url: string,
  text: string,
  questionId?: string,
): VersionedClip {
  return wrapUrlAsV1(url, text, questionId ?? existing?.questionId);
}

export function appendClipVersion(
  existing: VersionedClip | undefined | null,
  url: string,
  text: string,
  questionId?: string,
): VersionedClip {
  const createdAt = new Date().toISOString();
  if (!existing?.versions?.length) {
    return wrapUrlAsV1(url, text, questionId ?? existing?.questionId, createdAt);
  }
  const nextV = Math.max(...existing.versions.map((x) => x.v)) + 1;
  return {
    questionId: questionId ?? existing.questionId,
    activeVersion: nextV,
    versions: [...existing.versions, { v: nextV, url, text, createdAt }],
  };
}

export function setActiveClipVersion(clip: VersionedClip, version: number): VersionedClip {
  if (!clip.versions.some((x) => x.v === version)) return clip;
  return { ...clip, activeVersion: version };
}

/** Convert legacy flat OR v2 payloads into a consistent v2 store. */
export function normalizePregeneratedStore(
  raw: unknown,
  currentQuestions?: Array<{ id: string; text?: string; order?: number }>,
): PregeneratedStoreV2 {
  if (!raw || typeof raw !== "object") {
    return { schemaVersion: 2, status: undefined, questions: [] };
  }

  const r = raw as PregeneratedVideosPayload;

  if (r.schemaVersion === 2 || (Array.isArray(r.questions) && r.questions.some(isVersionedClip))) {
    const questions = (Array.isArray(r.questions) ? r.questions : []).map((q, i) => {
      if (isVersionedClip(q)) {
        const id = q.questionId || currentQuestions?.[i]?.id;
        return id && !q.questionId ? { ...q, questionId: id } : q;
      }
      if (typeof q === "string" && q) {
        return wrapUrlAsV1(
          q,
          (r.questionTexts && r.questionTexts[i]) || currentQuestions?.[i]?.text || "",
          currentQuestions?.[i]?.id,
        );
      }
      return wrapUrlAsV1("", "", currentQuestions?.[i]?.id);
    });
    return {
      schemaVersion: 2,
      status: r.status,
      intro: isVersionedClip(r.intro)
        ? r.intro
        : typeof r.intro === "string" && r.intro
          ? wrapUrlAsV1(r.intro, "Intro")
          : undefined,
      questions: questions.filter((q) => q.versions.some((v) => v.url)),
      outro: isVersionedClip(r.outro)
        ? r.outro
        : typeof r.outro === "string" && r.outro
          ? wrapUrlAsV1(r.outro, "Outro")
          : undefined,
      headNod: isVersionedClip(r.headNod)
        ? r.headNod
        : typeof r.headNod === "string" && r.headNod
          ? wrapUrlAsV1(r.headNod, "Head Nod")
          : undefined,
      error: r.error,
      note: r.note,
      startedAt: (r as PregeneratedStoreV2).startedAt,
      completedAt: (r as PregeneratedStoreV2).completedAt,
      failedAt: (r as PregeneratedStoreV2).failedAt,
      progress: (r as PregeneratedStoreV2).progress,
      processingTarget: (r as PregeneratedStoreV2).processingTarget,
      missingQuestions: r.missingQuestions,
    };
  }

  // Legacy flat
  const questionTexts = r.questionTexts || [];
  const urls = Array.isArray(r.questions)
    ? (r.questions as string[]).filter((u) => typeof u === "string")
    : [];
  const questions: VersionedClip[] = urls.map((url, i) =>
    wrapUrlAsV1(url, questionTexts[i] || currentQuestions?.[i]?.text || "", currentQuestions?.[i]?.id),
  );

  return {
    schemaVersion: 2,
    status: r.status,
    intro:
      typeof r.intro === "string" && r.intro ? wrapUrlAsV1(r.intro, "Intro") : isVersionedClip(r.intro) ? r.intro : undefined,
    questions,
    outro:
      typeof r.outro === "string" && r.outro ? wrapUrlAsV1(r.outro, "Outro") : isVersionedClip(r.outro) ? r.outro : undefined,
    headNod:
      typeof r.headNod === "string" && r.headNod ? wrapUrlAsV1(r.headNod, "Head Nod") : isVersionedClip(r.headNod) ? r.headNod : undefined,
    error: r.error,
    note: r.note,
    missingQuestions: r.missingQuestions,
  };
}

/**
 * Resolve active URLs in the current interview question order.
 * Prefers questionId match; falls back to index for legacy clips.
 */
export function resolvePlaybackClips(
  raw: unknown,
  currentQuestions?: Array<{ id: string; text?: string; order?: number }>,
): PregeneratedPlayback | null {
  const store = normalizePregeneratedStore(raw, currentQuestions);
  // Intro/outro are optional — questions alone are enough to start a session.

  const ordered =
    currentQuestions && currentQuestions.length > 0
      ? [...currentQuestions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : null;

  let questionUrls: string[] = [];
  if (ordered) {
    questionUrls = ordered
      .map((q, i) => {
        const byId = store.questions.find((c) => c.questionId === q.id);
        const byIndex = store.questions[i];
        return getActiveUrl(byId || byIndex) || "";
      })
      .filter(Boolean);
  } else {
    questionUrls = store.questions.map((c) => getActiveUrl(c) || "").filter(Boolean);
  }

  if (questionUrls.length === 0) return null;

  return {
    intro: getActiveUrl(store.intro) || "",
    questions: questionUrls,
    outro: getActiveUrl(store.outro) || "",
    headNod: getActiveUrl(store.headNod) || "",
    status: store.status,
  };
}

/** Enough clips to run a non-interactive session (intro/outro optional).
 * Still usable while a clip is regenerating — active URLs stay until replaced.
 */
export function hasUsablePregeneratedVideos(
  value: unknown,
  currentQuestions?: Array<{ id: string; text?: string; order?: number }>,
): boolean {
  if (!value || typeof value !== "object") return false;
  const playback = resolvePlaybackClips(value, currentQuestions);
  return !!playback && playback.questions.length > 0;
}

/** True when active clip text differs from live question text (needs new version). */
export function isQuestionClipStale(
  clip: VersionedClip | undefined,
  liveText: string,
): boolean {
  const active = getActiveVersion(clip);
  if (!active?.url) return true;
  return active.text.trim() !== liveText.trim();
}
