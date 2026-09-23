/**
 * Head-nod video comparison script.
 *
 * Generates a silent nodding-head clip from BOTH providers in parallel:
 *   1. Pruna p-video@0 via Runware  (primary path)
 *   2. Vidu img2video (direct)      (fallback path)
 *
 * Run:
 *   npx tsx test-head-nod.ts
 *
 * Reads API keys from .env.local automatically.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { generatePrunaVideoAndWait } from "./src/lib/runware-pruna-video";
import {
  createViduVideoTask,
  getViduTaskStatus,
  buildSpeakingPrompt,
} from "./src/lib/vidu-client";

const AVATAR_IMAGE_URL = "https://app.inluwa.com/avatars/woman-v1.png";

// ─── helpers ────────────────────────────────────────────────────────────────

function elapsed(startMs: number): string {
  const s = ((Date.now() - startMs) / 1000).toFixed(1);
  return `${s}s`;
}

function separator(label: string) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(`${line}`);
}

// ─── Pruna runner ────────────────────────────────────────────────────────────

async function runPruna(): Promise<{ url: string; ms: number }> {
  separator("🟣  Pruna p-video@0  (via Runware)");
  console.log("  Starting generation...");
  const start = Date.now();
  const url = await generatePrunaVideoAndWait(AVATAR_IMAGE_URL, {
    durationSeconds: 5,
    timeoutMs: 5 * 60 * 1000,
    pollIntervalMs: 4000,
  });
  const ms = Date.now() - start;
  console.log(`  ✅  Done in ${elapsed(start)}`);
  console.log(`  URL: ${url}`);
  return { url, ms };
}

// ─── Vidu runner (direct API, NOT Runware) ────────────────────────────────────

async function runVidu(): Promise<{ url: string; ms: number }> {
  separator("🔵  Vidu img2video  (direct API, movement_amplitude=subtle)");
  const prompt = buildSpeakingPrompt("", "en", true /* silent */);
  console.log("  Prompt:", prompt);

  console.log("\n  Starting generation...");

  const start = Date.now();

  // Create task directly so we always hit Vidu (not Runware Vidu wrapper)
  const taskId = await createViduVideoTask({
    imageUrl: AVATAR_IMAGE_URL,
    text: "",
    durationSeconds: 5,
    language: "en",
    silent: true,
  });

  console.log(`  Task ID: ${taskId}`);
  console.log("  Polling for result...");

  const TIMEOUT = 5 * 60 * 1000;
  const POLL = 5000;
  const deadline = Date.now() + TIMEOUT;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL));
    const status = await getViduTaskStatus(taskId);
    process.stdout.write(`  [${elapsed(start)}] state=${status.state}\r`);

    if (status.state === "success" && status.videoUrl) {
      const ms = Date.now() - start;
      process.stdout.write("\n");
      console.log(`  ✅  Done in ${elapsed(start)}`);
      console.log(`  URL: ${status.videoUrl}`);
      return { url: status.videoUrl, ms };
    }

    if (status.state === "failed") {
      throw new Error(`Vidu task failed: ${taskId} (${status.errCode ?? "unknown"})`);
    }
  }

  throw new Error(`Vidu task timed out after ${TIMEOUT / 1000}s: ${taskId}`);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🎬  Head-nod video comparison");
  console.log(`   Avatar image: ${AVATAR_IMAGE_URL}`);
  console.log("   Running Pruna + Vidu in parallel...\n");

  const wallStart = Date.now();

  const [pruna, vidu] = await Promise.allSettled([runPruna(), runVidu()]);

  separator("📊  Results summary");

  if (pruna.status === "fulfilled") {
    console.log(`  Pruna  ✅  ${(pruna.value.ms / 1000).toFixed(1)}s`);
    console.log(`         ${pruna.value.url}`);
  } else {
    console.error(`  Pruna  ❌  ${pruna.reason}`);
  }

  console.log();

  if (vidu.status === "fulfilled") {
    console.log(`  Vidu   ✅  ${(vidu.value.ms / 1000).toFixed(1)}s`);
    console.log(`         ${vidu.value.url}`);
  } else {
    console.error(`  Vidu   ❌  ${vidu.reason}`);
  }

  separator(`Total wall time: ${elapsed(wallStart)}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
