import { type LLMProvider } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { KimiProvider } from "./providers/kimi";
import { MinimaxProvider } from "./providers/minimax";
import { RunwareProvider } from "./providers/runware";
import { OpenRouterProvider } from "./providers/openrouter";
import { GEMINI_FLASH_MODEL, GEMINI_LITE_MODEL, hasGeminiApiKey } from "./models";

const providers = new Map<string, LLMProvider>();

function registerProvider(provider: LLMProvider) {
  providers.set(provider.id, provider);
}

registerProvider(new OpenAIProvider());
registerProvider(new KimiProvider());
registerProvider(new MinimaxProvider());
registerProvider(new RunwareProvider());
registerProvider(new OpenRouterProvider());

/** Alias so interview.llmProvider = "gemini" also resolves. */
providers.set("gemini", providers.get("openai")!);

/** Resolve the right provider for a given model name or provider id. */
export function getProvider(idOrModel?: string | null): LLMProvider {
  if (idOrModel) {
    if (providers.has(idOrModel)) return providers.get(idOrModel)!;
    const allProviders = Array.from(providers.values());
    for (const p of allProviders) {
      if (p.models.some((m: string) => m.toLowerCase() === idOrModel.toLowerCase())) {
        return p;
      }
    }
  }
  // Default: Gemini (via OpenAIProvider) → Kimi → MiniMax
  // We want to test Runware Deepseek right now, so default to it
  return providers.get("runware")!;
  /*
  if (hasGeminiApiKey() || process.env.OPENAI_API_KEY) return providers.get("openai")!;
  if (process.env.KIMI_API_KEY) return providers.get("kimi")!;
  if (process.env.MINIMAX_API_KEY) return providers.get("minimax")!;
  throw new Error(
    "No LLM provider configured. Set GOOGLE_API_KEY for Gemini (preferred), or KIMI_API_KEY / MINIMAX_API_KEY.",
  );
  */
}

export function listProviders(): LLMProvider[] {
  return Array.from(providers.values());
}

/**
 * Model used for post-interview report generation (quality / multimodal).
 */
export const REPORT_MODEL =
  process.env.GEMINI_FLASH_MODEL?.trim() ||
  // AZURE_OPENAI_DEPLOYMENT_CHAT / AZURE_OPENAI_DEPLOYMENT — disabled (Gemini migration)
  // process.env.AZURE_OPENAI_DEPLOYMENT_CHAT || process.env.AZURE_OPENAI_DEPLOYMENT ||
  GEMINI_FLASH_MODEL;

/**
 * Model used for interview question generation and refinement.
 */
export const GENERATOR_MODEL =
  process.env.GEMINI_FLASH_MODEL?.trim() ||
  // process.env.AZURE_OPENAI_DEPLOYMENT_CHAT || process.env.AZURE_OPENAI_DEPLOYMENT ||
  GEMINI_FLASH_MODEL;

/**
 * Model used for chat / conversational turns (cheaper Lite tier).
 */
export const CHAT_MODEL =
  process.env.GEMINI_LITE_MODEL?.trim() || GEMINI_LITE_MODEL;
