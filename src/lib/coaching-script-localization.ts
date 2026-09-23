/**
 * Translates coaching slide narration scripts to the session's target language.
 * Used by the coaching TTS route when the candidate's chosen language differs
 * from the language the training was originally authored in.
 */

import { getProvider } from "@/lib/ai/registry";
import { stripThinking } from "@/lib/ai/strip-thinking";
import { getLlmLanguageName, resolveLanguage } from "@/lib/languages";

/** In-memory cache: `${sourceLang}::${targetLang}::${text}` → translated text */
const scriptCache = new Map<string, string>();

function cacheKey(source: string, target: string, text: string): string {
  return `${source}::${target}::${text}`;
}

/**
 * Translates a coaching narration script from `sourceLanguage` to `targetLanguage`.
 * Returns the original text on any error so TTS is never silently broken.
 *
 * @param text           The original script text (in the training's authoring language)
 * @param sourceLanguage BCP-47 / language code of the original script
 * @param targetLanguage BCP-47 / language code to translate into
 */
export async function translateCoachingScript(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  if (!text?.trim()) return text;

  const sourceLang = resolveLanguage(sourceLanguage);
  const targetLang = resolveLanguage(targetLanguage);

  // No translation needed if source === target
  if (sourceLang.code === targetLang.code) return text;

  const key = cacheKey(sourceLang.code, targetLang.code, text);
  const cached = scriptCache.get(key);
  if (cached) return cached;

  const langName = getLlmLanguageName(targetLang.code);

  const cantoneseWarning =
    targetLang.code === "yue"
      ? " IMPORTANT: This is Cantonese (廣東話), NOT Mandarin (普通話). Use natural Hong Kong Cantonese in traditional Chinese characters."
      : "";

  try {
    const provider = getProvider();
    const result = await provider.generateResponse({
      messages: [
        {
          role: "system",
          content:
            `You are a professional translator. Translate the following narration script to ${langName}.` +
            ` Write entirely in the native script of ${langName}; do not leave any source-language text untranslated, and do not transliterate into Latin letters unless the target language is English.${cantoneseWarning}` +
            ` Preserve the tone, pacing, and natural spoken quality of the original. Return only the translated text with no extra commentary.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      maxTokens: 2000,
    });

    const translated = stripThinking(result.content).trim();
    if (translated) {
      scriptCache.set(key, translated);
      return translated;
    }
  } catch (err) {
    console.error("[coaching-script-localization] Translation failed, falling back to original:", err);
  }

  // Fallback: return the original text so TTS still works
  return text;
}
