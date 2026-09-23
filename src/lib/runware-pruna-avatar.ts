/**
 * Runware-hosted Pruna P-Video-Avatar for non-interactive clip pregeneration.
 * Docs: https://runware.ai/docs/models/prunaai-p-video-avatar
 *
 * Prefer this over Vidu img2video when RUNWARE_API_KEY is set.
 */

import { randomUUID } from "crypto";
import {
  DEFAULT_AVATAR_VOICE,
  resolveAvatarVoice,
  toPrunaSpeechLanguage,
} from "@/lib/avatar-voices";
import { getLlmLanguageName, resolveLanguage } from "@/lib/languages";
import { createLogger } from "@/lib/logger";
import type { ViduVideoGenerationRequest } from "@/lib/vidu-client";

const log = createLogger("runware-pruna-avatar");

const RUNWARE_API = "https://api.runware.ai/v1";
const RUNWARE_PRUNA_AVATAR_MODEL = "prunaai:p-video@avatar";

export type PrunaAvatarGenerationRequest = ViduVideoGenerationRequest & {
  /** Exact Pruna speech.voice string; defaults to Aoede (Female). */
  voice?: string | null;
};

function getRunwareApiKey(): string {
  const key = process.env.RUNWARE_API_KEY?.trim();
  if (!key) {
    throw new Error("RUNWARE_API_KEY is not configured");
  }
  return key;
}

async function runwareRequest(tasks: unknown[]): Promise<{
  data?: Array<Record<string, unknown>>;
  errors?: Array<{ message?: string; code?: string; taskUUID?: string }>;
}> {
  const response = await fetch(RUNWARE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getRunwareApiKey()}`,
    },
    body: JSON.stringify(tasks),
  });

  const payload = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
    errors?: Array<{ message?: string; code?: string; taskUUID?: string }>;
  };

  if (!response.ok) {
    const msg =
      payload.errors?.[0]?.message ||
      `Runware HTTP ${response.status} ${response.statusText}`;
    throw new Error(msg);
  }

  if (payload.errors?.length) {
    throw new Error(
      payload.errors.map((e) => e.message || e.code || "error").join("; "),
    );
  }

  return payload;
}

/** Gender-neutral visual prompt; spoken script lives in speech.text. */
export function buildPrunaAvatarPrompt(language?: string | null, voice?: string | null): string {
  const lang = resolveLanguage(language);
  const languageName = lang.llmLanguageName;
  // Derive gender from the voice name, e.g. "Aoede (Female)" → female.
  const isMale = /\(male\)/i.test(voice ?? "");
  const isFemale = /\(female\)/i.test(voice ?? "");
  const genderCue = isMale
    ? "The speaker is MALE. Use ONLY a male voice — do NOT switch to a female voice."
    : isFemale
    ? "The speaker is FEMALE. Use ONLY a female voice — do NOT switch to a male voice."
    : "Maintain a consistent single voice throughout — do NOT switch voices mid-clip.";

  const langCue = lang.code === "yue"
    ? "CRITICAL: Spoken language is Cantonese (廣東話 / yue-HK). Speak ONLY in spoken Cantonese (廣東話). Do NOT speak Mandarin (普通話) under ANY circumstances."
    : `Says exactly in ${languageName} tone.`;

  return [
    langCue,
    "A professional interviewer facing the camera and speaking naturally.",
    "Calm expression, clear lip sync to the dialogue.",
    "Keep the head completely still: no nodding, no tilting, minimal head movement; only the lips move for speech.",
    "Locked camera, no movement, preserve the original image framing.",
    "No zooming in, no camera movement, lock the camera exactly to the original image framing, maintain exact original distance.",
    genderCue,
    "NO subtitles, NO captions, NO text overlays, NO words on screen, NO lower thirds, NO text of any kind on the video. Strictly clean video without captions.",
  ].join(" ");
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/\bInlu\s+wa\b/gi, "Inluwa")
    .replace(/[\u2014\u2013]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Create + poll a Pruna avatar clip on Runware. Duration follows speech length (no duration field). */
export async function generateRunwarePrunaAvatarAndWait(
  request: PrunaAvatarGenerationRequest,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? 5000;
  const taskUUID = randomUUID();
  const speechText = normalizeSpeechText(request.text);
  if (!speechText) {
    throw new Error("Pruna avatar requires non-empty speech.text");
  }

  const voice = resolveAvatarVoice(request.voice) || DEFAULT_AVATAR_VOICE;
  // Send speech.language when mapped. zh/yue map to "ko" (Pruna allowlist
  // workaround); other unsupported langs still omit the field.
  const speechLanguage = toPrunaSpeechLanguage(request.language);

  const speech: { text: string; voice: string; language?: string } = {
    text: speechText,
    voice,
  };
  if (speechLanguage) {
    speech.language = speechLanguage;
  }

  log.info("Submitting Pruna avatar task", {
    taskUUID,
    interviewLanguage: request.language ?? null,
    speechLanguage: speechLanguage ?? "(omitted — unsupported by Pruna allowlist)",
    voice,
    imageUrl: request.imageUrl,
    speechTextLength: speechText.length,
  });

  await runwareRequest([
    {
      taskType: "videoInference",
      taskUUID,
      model: RUNWARE_PRUNA_AVATAR_MODEL,
      positivePrompt: buildPrunaAvatarPrompt(request.language, request.voice),
      numberResults: 1,
      outputType: "URL",
      outputFormat: "MP4",
      outputQuality: 95,
      deliveryMethod: "async",
      includeCost: true,
      speech,
      inputs: {
        frameImages: [request.imageUrl],
      },
    },
  ]);

  const started = Date.now();
  while (true) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `Runware Pruna avatar task timed out after ${timeoutMs}ms: ${taskUUID}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const poll = await runwareRequest([
      {
        taskType: "getResponse",
        taskUUID,
      },
    ]);

    const item = poll.data?.find((d) => d.taskUUID === taskUUID) ?? poll.data?.[0];
    if (!item) continue;

    const status = String(item.status || "");
    if (status === "success" && typeof item.videoURL === "string" && item.videoURL) {
      return item.videoURL;
    }
    if (status === "error") {
      const err =
        (item.error as { message?: string } | undefined)?.message ||
        "Runware Pruna avatar generation failed";
      throw new Error(`${err} (${taskUUID})`);
    }
  }
}
