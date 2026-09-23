/**
 * Runware-hosted SeedDance (bytedance:2@2) for silent video generation.
 * This model generates video from a reference image + prompt WITHOUT any TTS/audio.
 * Used exclusively for the silent head-nod idle clip.
 */

import { randomUUID } from "crypto";
import { createLogger } from "@/lib/logger";

const log = createLogger("runware-seeddance-video");

const RUNWARE_API = "https://api.runware.ai/v1";
const SEEDDANCE_MODEL = "bytedance:2@2";

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

/** Prompt for the silent head nod clip — no audio, no speech, camera locked. */
export function buildPrunaVideoHeadNodPrompt(): string {
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
  ].join("\n");
}

/**
 * Generate a silent head-nod clip using SeedDance (bytedance:2@2) on Runware.
 * This model accepts a reference image + text prompt and generates a silent video.
 */
export async function generatePrunaVideoAndWait(
  imageUrl: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number; durationSeconds?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? 5000;
  const duration = options?.durationSeconds ?? 7;
  const taskUUID = randomUUID();

  log.info("Submitting SeedDance silent head nod task", {
    taskUUID,
    imageUrl,
    duration,
  });

  await runwareRequest([
    {
      taskType: "videoInference",
      taskUUID,
      model: SEEDDANCE_MODEL,
      positivePrompt: buildPrunaVideoHeadNodPrompt(),
      width: 640,
      height: 640,
      duration,
      numberResults: 1,
      outputType: "URL",
      outputFormat: "MP4",
      outputQuality: 95,
      deliveryMethod: "async",
      inputs: {
        frameImages: [imageUrl],
      },
    },
  ]);

  const started = Date.now();
  while (true) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `SeedDance task timed out after ${timeoutMs}ms: ${taskUUID}`,
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
      log.info("SeedDance head nod generated", { taskUUID, url: item.videoURL });
      return item.videoURL;
    }
    if (status === "error") {
      const err =
        (item.error as { message?: string } | undefined)?.message ||
        "SeedDance head nod generation failed";
      throw new Error(`${err} (${taskUUID})`);
    }
    log.info("SeedDance polling", { taskUUID, status });
  }
}
