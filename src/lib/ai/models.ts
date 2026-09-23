/**
 * Gemini model defaults after Azure OpenAI migration.
 * Override via env without code changes.
 *
 * Flash  → interview gen, reports, resume scoring/parse (quality / JSON)
 * Lite   → chat + voice turns (cheaper / lower latency)
 */

export const GEMINI_FLASH_MODEL =
  process.env.GEMINI_FLASH_MODEL?.trim() || "gemini-3.5-flash";

export const GEMINI_LITE_MODEL =
  process.env.GEMINI_LITE_MODEL?.trim() || "gemini-3.1-flash-lite";

/** OpenAI-compatible Gemini endpoint (same as Python resume scoring). */
export const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

/** True when a Gemini API key is available (preferred LLM stack). */
export function hasGeminiApiKey(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY?.trim());
}

/**
 * Map leftover gpt/Azure deployment names (or unset) onto Gemini.
 * Explicit `gemini-*` ids are kept as-is.
 */
export function resolveGeminiModel(
  requested: string | null | undefined,
  tier: "flash" | "lite" = "flash",
): string {
  const fallback = tier === "lite" ? GEMINI_LITE_MODEL : GEMINI_FLASH_MODEL;
  if (!requested?.trim()) return fallback;
  const m = requested.trim();
  if (m.toLowerCase().startsWith("gemini")) return m;
  // gpt-*, o3-*, Azure deployment aliases → Gemini
  return fallback;
}
