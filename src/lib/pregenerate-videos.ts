import { createClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";
import {
  generateViduVideoAndWait,
  resolveViduAvatarUrl,
  resolvePublicAssetUrl,
} from "@/lib/vidu-client";
import {
  getActiveUrl,
  normalizePregeneratedStore,
  replaceClipVersion,
  setActiveClipVersion,
  type PregeneratedStoreV2,
  type VersionedClip,
} from "@/lib/pregenerated-videos";
import { getLlmLanguageName, resolveLanguage } from "@/lib/languages";
import { getProvider } from "@/lib/ai/registry";
import { findAvatarPresetByImageUrl } from "@/lib/avatar-voices";

const log = createLogger("pregenerate");

/**
 * Translate spoken text into the target interview language using the LLM.
 * Returns the original text unchanged if language is English or translation fails.
 */
async function translateForVideo(text: string, language?: string | null): Promise<string> {
  const lang = resolveLanguage(language);
  if (lang.code === "en") return text; // Already English

  const langName = getLlmLanguageName(language);
  try {
    const provider = getProvider();

    // For Cantonese (yue), LLMs tend to default to Mandarin — be very explicit.
    const cantoneseWarning =
      lang.code === "yue"
        ? " IMPORTANT: This is Cantonese (廣東話), NOT Mandarin (普通話). " +
          "Write in natural spoken Hong Kong Cantonese using traditional Chinese characters. " +
          "Use Cantonese vocabulary and grammar (e.g. 我係, 唔係, 咁, 點解, 呢個). " +
          "Do NOT produce Mandarin (普通話). Do NOT use simplified Chinese characters."
        : "";

    const result = await provider.generateResponse({
      messages: [
        {
          role: "system",
          content:
            `You are a professional translator. Translate the following spoken interview script into ${langName}.${cantoneseWarning} ` +
            `Keep the same professional tone and meaning. Output ONLY the translated text, nothing else.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.2,
      maxTokens: 1024,
    });
    const translated = result.content.trim();
    if (translated) {
      log.info("Translated clip text", { language: lang.code, originalLength: text.length, translatedLength: translated.length });
      return translated;
    }
  } catch (err) {
    log.warn("Translation failed; using original English text", { language: lang.code, err });
  }
  return text;
}

export type PregeneratedVideos = {
  intro: string;
  questions: string[];
  outro: string;
  headNod?: string;
};

export type QuestionInput = {
  id?: string;
  text: string;
  order?: number;
};

export type PregenerateTarget =
  | { type: "intro" }
  | { type: "outro" }
  | { type: "question"; questionIndex: number; questionId?: string }
  | { type: "all" }
  | { type: "stale_or_missing" }
  | { type: "headNod" };

export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials are not configured");
  }
  return createClient(url, key);
}

async function loadStore(
  supabase: ReturnType<typeof getServiceSupabase>,
  interviewId: string,
  questions: QuestionInput[],
  dbTable: "interviews" | "trainings" = "interviews",
): Promise<PregeneratedStoreV2> {
  const { data } = await supabase
    .from(dbTable)
    .select("pregenerated_videos")
    .eq("id", interviewId)
    .single();
  return normalizePregeneratedStore(
    (data as { pregenerated_videos?: unknown } | null)?.pregenerated_videos,
    questions.map((q) => ({ id: q.id || "", text: q.text, order: q.order })),
  );
}

async function saveStore(
  supabase: ReturnType<typeof getServiceSupabase>,
  interviewId: string,
  store: PregeneratedStoreV2,
  dbTable: "interviews" | "trainings" = "interviews",
): Promise<void> {
  const updateData: any = { pregenerated_videos: store };
  if (dbTable === "trainings") {
    if (store.status === "ready") {
      updateData.generation_status = "READY";
    } else if (store.status === "processing") {
      updateData.generation_status = "GENERATING";
    } else {
      updateData.generation_status = "IDLE";
    }
  }

  const { error } = await supabase
    .from(dbTable)
    .update(updateData)
    .eq("id", interviewId);
  if (error) {
    throw new Error(`Failed to save pregenerated videos: ${error.message}`);
  }
}

function storeToPlayback(store: PregeneratedStoreV2): PregeneratedVideos {
  return {
    intro: getActiveUrl(store.intro) || "",
    questions: store.questions.map((q) => getActiveUrl(q) || "").filter(Boolean),
    outro: getActiveUrl(store.outro) || "",
    headNod: getActiveUrl(store.headNod) || undefined,
  };
}

function findQuestionClip(
  store: PregeneratedStoreV2,
  question: QuestionInput,
  index: number,
): VersionedClip | undefined {
  if (question.id) {
    const byId = store.questions.find((c) => c.questionId === question.id);
    if (byId) return byId;
  }
  return store.questions[index];
}

function upsertQuestionClip(
  store: PregeneratedStoreV2,
  question: QuestionInput,
  index: number,
  clip: VersionedClip,
): PregeneratedStoreV2 {
  const nextClip = { ...clip, questionId: question.id || clip.questionId };
  const questions = [...store.questions];
  const byIdIdx = question.id
    ? questions.findIndex((c) => c.questionId === question.id)
    : -1;

  if (byIdIdx >= 0) {
    questions[byIdIdx] = nextClip;
    return { ...store, questions };
  }
  if (index < questions.length) {
    questions[index] = nextClip;
    return { ...store, questions };
  }
  questions.push(nextClip);
  return { ...store, questions };
}

function computeStatus(
  store: PregeneratedStoreV2,
  questionCount: number,
): "ready" | "partial" {
  // Intro/outro are not generated — readiness is question clips only.
  const qCount = store.questions.filter((c) => getActiveUrl(c)).length;
  if (qCount >= questionCount) return "ready";
  return "partial";
}

/**
 * Generate or regenerate Vidu clips for interview questions only.
 * Intro/outro are never submitted to Runware (questions already include any greeting).
 * - `all`: (re)generate every question clip.
 * - `stale_or_missing`: only question clips missing or whose active text ≠ live text.
 * - `question`: one question clip.
 * - `intro` / `outro`: no-ops (kept for API compat; no Runware task).
 */
export async function pregenerateInterviewVideos(params: {
  interviewId: string;
  introText?: string;
  questions: Array<string | QuestionInput>;
  outroText?: string;
  avatarUrl?: string;
  /** Interview language code (e.g. yue / zh / en) for spoken clips. */
  language?: string | null;
  /** Pruna speech.voice (e.g. "Aoede (Female)"). */
  voice?: string | null;
  target?: PregenerateTarget;
  dbTable?: "interviews" | "trainings";
}): Promise<PregeneratedVideos> {
  const {
    interviewId,
    language,
    voice,
    target = { type: "all" },
    dbTable = "interviews",
  } = params;

  const questions: QuestionInput[] = params.questions.map((q, i) =>
    typeof q === "string" ? { text: q, order: i } : { ...q, text: q.text, order: q.order ?? i },
  );

  const isSingleClipTarget = ["intro", "outro", "headNod"].includes(target.type);

  if (!isSingleClipTarget && !questions.length) {
    throw new Error("Cannot pregenerate videos without questions");
  }

  const avatarUrl = params.avatarUrl || resolveViduAvatarUrl();
  const supabase = getServiceSupabase();
  let store = await loadStore(supabase, interviewId, questions, dbTable);

  // Never generate separate intro/outro Runware tasks.
  // Generate Intro, Questions 1..N, Outro, and Head Nod when target is "all" or specific target.
  // Coaching trainings never need separate intro/outro/headNod — questions-only videos.
  const isCoaching = dbTable === "trainings";
  const doIntro = !isCoaching && (target.type === "all" || target.type === "intro" || (target.type === "stale_or_missing" && !getActiveUrl(store.intro)));
  const doOutro = !isCoaching && (target.type === "all" || target.type === "outro" || (target.type === "stale_or_missing" && !getActiveUrl(store.outro)));
  const doHeadNod = !isCoaching && (target.type === "all" || target.type === "headNod" || (target.type === "stale_or_missing" && !getActiveUrl(store.headNod)));

  const questionIndices: number[] = [];
  if (target.type === "question") {
    questionIndices.push(target.questionIndex);
  } else if (target.type === "all" || target.type === "stale_or_missing") {
    for (let i = 0; i < questions.length; i++) {
      if (target.type === "all") {
        questionIndices.push(i);
      } else {
        const q = questions[i];
        const clip = findQuestionClip(store, q, i);
        const active = clip?.versions.find((v) => v.v === clip.activeVersion);
        if (!active?.url || active.text.trim() !== q.text.trim()) {
          questionIndices.push(i);
        }
      }
    }
  }

  log.info("Starting avatar video pre-generation", {
    interviewId,
    target,
    questionIndices,
    doIntro,
    doOutro,
    doHeadNod,
    avatarUrl,
    language: language ?? "en",
    voice: voice ?? "Aoede (Female)",
  });

  store = {
    ...store,
    schemaVersion: 2,
    status: "processing",
    startedAt: new Date().toISOString(),
    processingTarget:
      target.type === "question"
        ? `question:${target.questionIndex}`
        : target.type,
    error: undefined,
  };
  await saveStore(supabase, interviewId, store, dbTable);

  try {
    // Step 1: Head Nod (listening video) generated/retrieved first (instant for presets)
    if (doHeadNod) {
      log.info("Generating/Retrieving Head Nod (listening) video clip", { interviewId });
      try {
        const nodText = "..."; // Silent attentive listening clip
        let url: string;

        const matchingPreset = findAvatarPresetByImageUrl(avatarUrl);
        if (matchingPreset?.listeningVideoPath) {
          log.info("Using pre-saved preset listening video", {
            presetId: matchingPreset.id,
            listeningVideoPath: matchingPreset.listeningVideoPath,
          });
          url = resolvePublicAssetUrl(matchingPreset.listeningVideoPath);
        } else if (process.env.RUNWARE_API_KEY?.trim()) {
          try {
            log.info("Using SeedDance (bytedance:2@2) for silent head nod", { interviewId });
            const { generatePrunaVideoAndWait } = await import("@/lib/runware-pruna-video");
            url = await generatePrunaVideoAndWait(avatarUrl, { durationSeconds: 7 });
          } catch (prunaErr) {
            log.warn("SeedDance failed; falling back to Vidu silent", { err: prunaErr });
            url = await generateViduVideoAndWait({ imageUrl: avatarUrl, text: nodText, language, voice, silent: true });
          }
        } else {
          url = await generateViduVideoAndWait({ imageUrl: avatarUrl, text: nodText, language, voice, silent: true });
        }

        store = { ...store, headNod: replaceClipVersion(store.headNod, url, nodText), progress: "Head Nod" };
        await saveStore(supabase, interviewId, store, dbTable);
      } catch (err) {
        log.warn("Failed to generate head nod video clip", { err });
      }
    }

    // Step 2: Intro video
    if (doIntro) {
      log.info("Generating Intro video clip", { interviewId });
      try {
        const introTextEn = params.introText?.trim() ||
          "Welcome to your non-interactive interview. Please note that for each question, you should click Unmute, answer your question clearly, and click Submit when you are finished to proceed to the next question. If there are coding questions, please keep the total number of questions and total time in mind as you work. Good luck!";
        const introText = await translateForVideo(introTextEn, language);
        const url = await generateViduVideoAndWait({
          imageUrl: avatarUrl,
          text: introText,
          language,
          voice,
        });
        store = { ...store, intro: replaceClipVersion(store.intro, url, introText), progress: "Intro" };
        await saveStore(supabase, interviewId, store);
      } catch (err) {
        log.warn("Failed to generate intro video clip", { err });
      }
    }

    // Step 3: Questions 1..N
    for (const i of questionIndices) {
      const q = questions[i];
      if (!q?.text) continue;
      log.info(`Generating video for question ${i + 1}/${questions.length}`, {
        questionId: q.id,
      });
      try {
        // Spoken clip uses question text translated into interview language.
        const spokenText = await translateForVideo(q.text, language);
        const url = await generateViduVideoAndWait({
          imageUrl: avatarUrl,
          text: spokenText,
          language,
          voice,
        });
        const existing = findQuestionClip(store, q, i);
        const next = replaceClipVersion(existing, url, spokenText, q.id);
        store = upsertQuestionClip(store, q, i, next);
        store = {
          ...store,
          progress: `Question ${i + 1}/${questions.length}`,
        };
        await saveStore(supabase, interviewId, store, dbTable);
      } catch (error) {
        store = {
          ...store,
          status: "partial",
          error: error instanceof Error ? error.message : String(error),
          failedAt: new Date().toISOString(),
          note: `Stopped while generating question ${i + 1}.`,
          missingQuestions: questions.slice(i).map((x) => x.text),
        };
        await saveStore(supabase, interviewId, store, dbTable);
        if (store.questions.some((c) => getActiveUrl(c))) {
          log.warn("Saving partial pregenerated videos after failure", {
            interviewId,
            savedQuestions: store.questions.length,
          });
          return storeToPlayback(store);
        }
        throw error;
      }
    }

    // Step 4: Outro video
    if (doOutro) {
      log.info("Generating Outro video clip", { interviewId });
      try {
        const outroTextEn = params.outroText?.trim() ||
          "You have reached the end of the interview. Thank you for your responses. If the interview session does not complete automatically in a moment, you can click the red end button in the top right to complete your session.";
        const outroText = await translateForVideo(outroTextEn, language);
        const url = await generateViduVideoAndWait({
          imageUrl: avatarUrl,
          text: outroText,
          language,
          voice,
        });
        store = { ...store, outro: replaceClipVersion(store.outro, url, outroText), progress: "Outro" };
        await saveStore(supabase, interviewId, store, dbTable);
      } catch (err) {
        log.warn("Failed to generate outro video clip", { err });
      }
    }

    store = {
      ...store,
      status: computeStatus(store, questions.length),
      completedAt: new Date().toISOString(),
      processingTarget: undefined,
      error: undefined,
      progress: undefined,
      missingQuestions: undefined,
      note: undefined,
    };
    await saveStore(supabase, interviewId, store, dbTable);
    log.info("Successfully saved pregenerated videos", {
      interviewId,
      status: store.status,
    });
    return storeToPlayback(store);
  } catch (error) {
    throw error;
  }
}

/** Switch which version is active for a clip (no Vidu call). */
export async function setPregeneratedActiveVersion(params: {
  interviewId: string;
  target: "intro" | "outro" | { questionId: string } | { questionIndex: number };
  version: number;
  questions?: QuestionInput[];
  dbTable?: "interviews" | "trainings";
}): Promise<PregeneratedStoreV2> {
  const dbTable = params.dbTable || "interviews";
  const supabase = getServiceSupabase();
  let store = await loadStore(supabase, params.interviewId, params.questions || [], dbTable);

  if (params.target === "intro" && store.intro) {
    store = { ...store, intro: setActiveClipVersion(store.intro, params.version) };
  } else if (params.target === "outro" && store.outro) {
    store = { ...store, outro: setActiveClipVersion(store.outro, params.version) };
  } else if (typeof params.target === "object" && "questionId" in params.target) {
    const questionId = params.target.questionId;
    store = {
      ...store,
      questions: store.questions.map((c) =>
        c.questionId === questionId
          ? setActiveClipVersion(c, params.version)
          : c,
      ),
    };
  } else if (typeof params.target === "object" && "questionIndex" in params.target) {
    const idx = params.target.questionIndex;
    store = {
      ...store,
      questions: store.questions.map((c, i) =>
        i === idx ? setActiveClipVersion(c, params.version) : c,
      ),
    };
  }

  await saveStore(supabase, params.interviewId, store, dbTable);
  return store;
}

/** Fire-and-forget wrapper that records failures without wiping prior versions. */
export function startPregenerateInterviewVideos(
  params: Parameters<typeof pregenerateInterviewVideos>[0],
): Promise<any> {
  const dbTable = params.dbTable || "interviews";
  return pregenerateInterviewVideos(params).catch(async (error) => {
    log.error("Pregeneration failed", { interviewId: params.interviewId, error });
    try {
      const supabase = getServiceSupabase();
      const questions: QuestionInput[] = (params.questions || []).map((q, i) =>
        typeof q === "string" ? { text: q, order: i } : q,
      );
      const existing = await loadStore(supabase, params.interviewId, questions, dbTable);
      const hasPartial = existing.questions.some((c) => !!getActiveUrl(c));
      await saveStore(supabase, params.interviewId, {
        ...existing,
        status: hasPartial ? "partial" : "failed",
        error: error instanceof Error ? error.message : String(error),
        failedAt: new Date().toISOString(),
        processingTarget: undefined,
      }, dbTable);
    } catch (updateError) {
      log.error("Failed to persist pregeneration error", { updateError });
    }
  });
}
