/**
 * Runware-hosted Vidu Q3 Turbo for non-interactive clip pregeneration.
 * Docs: https://runware.ai/docs/models/vidu-q3-turbo
 *
 * Live/Premium Vidu S1 still uses platform.vidu.com via VIDU_API_KEY.
 */

import { randomUUID } from "crypto";
import {
  buildSpeakingPrompt,
  estimateSpeechDurationSeconds,
  type ViduVideoGenerationRequest,
} from "@/lib/vidu-client";

const RUNWARE_API = "https://api.runware.ai/v1";
/** Vidu Q3 Turbo on Runware */
const RUNWARE_VIDU_MODEL = "vidu:4@2";

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

/** Create + poll a Vidu Q3 Turbo image-to-video clip on Runware. */
export async function generateRunwareViduVideoAndWait(
  request: ViduVideoGenerationRequest,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? 5000;
  const duration = Math.min(
    13,
    Math.max(1, request.durationSeconds ?? estimateSpeechDurationSeconds(request.text)),
  );
  const taskUUID = randomUUID();

  await runwareRequest([
    {
      taskType: "videoInference",
      taskUUID,
      model: RUNWARE_VIDU_MODEL,
      positivePrompt: buildSpeakingPrompt(request.text, request.language, request.silent, request.voice),
      negativePrompt: "subtitles, captions, text, watermark, text overlay, closed captions, lower thirds, speech bubbles, words on screen, transcription text, burned-in subtitles, hard-coded captions",
      width: 1280,
      height: 720,
      duration,
      deliveryMethod: "async",
      includeCost: true,
      providerSettings: {
        vidu: {
          audio: !request.silent,
        },
      },
      inputs: {
        frameImages: [
          {
            image: request.imageUrl,
            frame: "first",
          },
        ],
      },
    },
  ]);

  const started = Date.now();
  while (true) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Runware Vidu task timed out after ${timeoutMs}ms: ${taskUUID}`);
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
        "Runware video generation failed";
      throw new Error(`${err} (${taskUUID})`);
    }
  }
}
