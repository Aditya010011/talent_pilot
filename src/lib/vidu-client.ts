/**
 * Vidu image-to-video client (Q3 Turbo with native audio).
 * Docs: https://platform.vidu.com/docs/image-to-video
 *
 * Pregeneration prefers Runware Pruna p-video-avatar when RUNWARE_API_KEY is set,
 * then Runware Vidu img2video, then direct Vidu `/ent/v2/img2video` (not Digital Human).
 */

import { createLogger } from "@/lib/logger";
import { resolveLanguage } from "@/lib/languages";

const log = createLogger("vidu-client");

const VIDU_BASE = "https://api.vidu.com/ent/v2";

function getViduApiKey(): string {
  const key = process.env.VIDU_API_KEY?.trim();
  if (!key) {
    throw new Error("VIDU_API_KEY is not configured");
  }
  return key;
}

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Token ${getViduApiKey()}`,
  };
}

export interface ViduVideoGenerationRequest {
  imageUrl: string;
  /** Exact spoken script for the avatar */
  text: string;
  /** Optional override; otherwise derived from text length (1–13s). Vidu only; Pruna omits. */
  durationSeconds?: number;
  /** Interview language code (e.g. yue / zh / en) — steers spoken language. */
  language?: string | null;
  /** Pruna speech.voice (e.g. "Aoede (Female)"). Ignored by Vidu fallback. */
  voice?: string | null;
  /** If true, generates a silent video (bypasses TTS/audio). */
  silent?: boolean;
}

export interface ViduTaskStatus {
  state: "created" | "queueing" | "processing" | "success" | "failed" | string;
  videoUrl?: string;
  errCode?: string;
}

/** Rough speaking pace for estimating clip length. */
export function estimateSpeechDurationSeconds(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 4;
  // CJK (and similar) scripts rarely use spaces — count characters, not Latin words.
  const cjkChars = (trimmed.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || [])
    .length;
  const latinWords = trimmed.split(/\s+/).filter(Boolean).length;
  // ~3.5 chars/sec for CJK; ~2.2 words/sec for space-delimited languages
  const seconds =
    cjkChars >= latinWords
      ? Math.ceil(cjkChars / 3.5) + 2
      : Math.ceil(latinWords / 2.2) + 1;
  return Math.min(13, Math.max(4, seconds));
}

/** Clear spoken-language cue so CJK scripts (yue vs zh) are not ambiguous. */
export function speakingLanguageCue(language?: string | null): string {
  const lang = resolveLanguage(language);
  if (lang.code === "yue") {
    return (
      "Speak in Hong Kong Cantonese (廣東話 / 粤语) ONLY. " +
      "Do NOT speak Mandarin (普通话). " +
      "Pronounce as natural spoken Cantonese, not Mandarin reading of the characters."
    );
  }
  if (lang.code === "zh") {
    return (
      "Speak in Mandarin Chinese (普通话) ONLY. " +
      "Do NOT speak Cantonese."
    );
  }
  return `Speak in ${lang.llmLanguageName} only.`;
}

/**
 * Jul 15 gallery-style prompt (mild): put the spoken line first so Vidu
 * prioritizes speech + lip sync. Keep visual constraints short — long
 * English instruction blocks hurt script fidelity. Language cue sits
 * right after the script so speech language is unambiguous.
 */
export function buildSpeakingPrompt(
  text: string,
  language?: string | null,
  silent?: boolean,
  voice?: string | null,
): string {
  if (silent) {
    return [
      "A professional interviewer sitting and actively listening, facing the camera.",
      "ONLY the head moves: very subtle, slow, natural head nods — tiny gentle movements only, NOT exaggerated.",
      "Soft attentive expression, eyes open, mouth completely closed, no speaking, no lip movement.",
      "Hands are completely still — NO hand movement, NO gesturing, NO arm movement of any kind.",
      "Body is completely frozen — NO shoulder movement, NO torso movement, NO body shifting.",
      "ABSOLUTELY NO camera movement. The camera is 100% static and locked in place.",
      "ABSOLUTELY NO zoom of any kind — no zoom in, no zoom out, not even a fraction.",
      "The person's head and shoulders must occupy the EXACT SAME portion of frame from the first frame to the last frame.",
      "The face must be the EXACT SAME SIZE throughout — if it grows larger at all, that is a failure.",
      "Preserve original framing, distance, background, and lighting exactly as in the source image.",
      "NO subtitles, NO captions, NO text overlays of any kind on the video.",
    ].join(" ");
  }

  // Derive gender from voice name, e.g. "Puck (Male)" → male.
  const isMale = /\(male\)/i.test(voice ?? "");
  const isFemale = /\(female\)/i.test(voice ?? "");
  const genderCue = isMale
    ? "The speaker is MALE. Use ONLY a male voice — do NOT switch to a female voice."
    : isFemale
    ? "The speaker is FEMALE. Use ONLY a female voice — do NOT switch to a male voice."
    : "Maintain a consistent single voice throughout — do NOT switch voices mid-clip.";

  const script = text
    .replace(/\bInlu\s+wa\b/gi, "Inluwa")
    .replace(/[\u2014\u2013]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  return [
    `She says exactly: "${script}"`,
    speakingLanguageCue(language),
    "A professional woman interviewer facing the camera and speaking naturally.",
    "Calm expression, clear lip sync to the dialogue.",
    "Locked camera, no movement, preserve the original image framing.",
    "No zooming in, no camera movement, lock the camera exactly to the original image framing, maintain exact original distance.",
    genderCue,
    "NO subtitles, NO captions, NO text overlays, NO words on screen, NO lower thirds of any kind on the video. Strictly clean video without captions.",
  ].join(" ");
}

export async function createViduVideoTask({
  imageUrl,
  text,
  durationSeconds,
  language,
  silent,
  voice,
}: ViduVideoGenerationRequest): Promise<string> {
  const duration = durationSeconds ?? estimateSpeechDurationSeconds(text);
  const response = await fetch(`${VIDU_BASE}/img2video`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: "viduq3-turbo",
      images: [imageUrl],
      prompt: buildSpeakingPrompt(text, language, silent, voice),
      audio: !silent,
      duration,
      resolution: "720p",
      // Use "subtle" for silent clips to prevent camera drift/zoom on the head-nod loop.
      // "auto" is fine for speaking clips where some natural movement is expected.
      movement_amplitude: silent ? "subtle" : "auto",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create Vidu task: ${response.status} ${response.statusText} — ${errorText}`,
    );
  }

  const data = (await response.json()) as { task_id?: string };
  if (!data.task_id) {
    throw new Error("Vidu create response missing task_id");
  }
  return data.task_id;
}

export async function getViduTaskStatus(taskId: string): Promise<ViduTaskStatus> {
  const response = await fetch(`${VIDU_BASE}/tasks/${taskId}/creations`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to check Vidu task status: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    state?: string;
    err_code?: string;
    creations?: Array<{ url?: string }>;
  };

  return {
    state: data.state ?? "processing",
    errCode: data.err_code,
    videoUrl: data.creations?.[0]?.url,
  };
}

async function generateDirectViduVideoAndWait(
  request: ViduVideoGenerationRequest,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? 5000;
  // Fallback direct creation
  const taskId = await createViduVideoTask(request);
  const started = Date.now();

  while (true) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Vidu task timed out after ${timeoutMs}ms: ${taskId}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const status = await getViduTaskStatus(taskId);

    if (status.state === "success" && status.videoUrl) {
      return status.videoUrl;
    }

    if (status.state === "failed") {
      throw new Error(
        `Vidu task failed: ${taskId}${status.errCode ? ` (${status.errCode})` : ""}`,
      );
    }
  }
}

/**
 * Prefer Pruna avatar on Runware; fall back to Vidu img2video (Runware, then direct)
 * only if Pruna/Runware fails.
 */
export async function generateViduVideoAndWait(
  request: ViduVideoGenerationRequest,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<string> {
  if (process.env.RUNWARE_API_KEY?.trim()) {
    if (!request.silent) {
      try {
        const { generateRunwarePrunaAvatarAndWait } = await import(
          "@/lib/runware-pruna-avatar"
        );
        return await generateRunwarePrunaAvatarAndWait(request, options);
      } catch (prunaError) {
        const message =
          prunaError instanceof Error ? prunaError.message : String(prunaError);
        log.warn("Pruna avatar failed; falling back to Vidu img2video", {
          error: message,
          language: request.language ?? null,
          voice: request.voice ?? null,
          imageUrl: request.imageUrl,
        });
      }
    } else {
      log.info("Silent video requested; skipping Pruna avatar (TTS required) and using Vidu", {
        imageUrl: request.imageUrl,
      });
    }

    try {
      const { generateRunwareViduVideoAndWait } = await import("@/lib/runware-vidu");
      return await generateRunwareViduVideoAndWait(request, options);
    } catch (viduRunwareError) {
      log.warn("Runware Vidu failed; trying direct Vidu API", {
        error:
          viduRunwareError instanceof Error
            ? viduRunwareError.message
            : String(viduRunwareError),
      });
    }
  }

  return generateDirectViduVideoAndWait(request, options);
}

/** Default interviewer still used for non-interactive Vidu clips. */
export const DEFAULT_VIDU_AVATAR_PATH = "/avatars/f1.jpg";

export function resolvePublicAssetUrl(
  pathOrUrl: string,
  baseUrl?: string | null,
): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  const origin = (baseUrl || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!origin) {
    throw new Error("NEXT_PUBLIC_APP_URL is required to resolve public asset URL");
  }
  return `${origin}${path}`;
}

export function resolveViduAvatarUrl(baseUrl?: string | null): string {
  return resolvePublicAssetUrl(DEFAULT_VIDU_AVATAR_PATH, baseUrl);
}
