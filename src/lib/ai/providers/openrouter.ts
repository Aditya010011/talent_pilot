import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { type LLMProvider, type GenerationParams, type LLMResponse, type LLMMessage } from "../types";
import { stripThinking } from "../strip-thinking";

/** Ask OpenRouter / Nemotron not to return a reasoning channel. */
const REASONING_OFF = {
  reasoning: { enabled: false, exclude: true },
  include_reasoning: false,
} as const;

const DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning:free";

export class OpenRouterProvider implements LLMProvider {
  id = "openrouter";
  name = "OpenRouter Nemotron";
  models = [DEFAULT_MODEL];
  defaultModel =
    process.env.OPENROUTER_MODEL?.trim() ||
    process.env.COACHING_CHAT_MODEL?.trim() ||
    DEFAULT_MODEL;

  private client: OpenAI;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
    if (!this.apiKey) {
      console.warn("OPENROUTER_API_KEY not set. OpenRouterProvider may fail.");
    }
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
    });
  }

  private ensureConfigured() {
    if (!this.apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Add it to .env.local to use the OpenRouter provider.",
      );
    }
  }

  private toOpenAIMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content as string & Array<unknown>,
    })) as ChatCompletionMessageParam[];
  }

  async generateResponse(
    params: GenerationParams & { model?: string }
  ): Promise<LLMResponse> {
    this.ensureConfigured();
    const model = params.model ?? this.defaultModel;
    console.log(`[OpenRouterProvider] Using model: ${model}`);

    const response = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(params.messages),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
      ...REASONING_OFF,
    } as any);

    const choice = response.choices[0];
    const raw = choice.message.content ?? "";
    return {
      content: stripThinking(String(raw)),
      finishReason: choice.finish_reason ?? "stop",
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *streamResponse(
    params: GenerationParams & { model?: string }
  ): AsyncIterable<string> {
    this.ensureConfigured();
    const model = params.model ?? this.defaultModel;
    console.log(`[OpenRouterProvider] Using model: ${model}`);

    const stream = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(params.messages),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
      stream: true,
      ...REASONING_OFF,
    } as any);

    let buffer = "";
    let flushed = false;
    for await (const chunk of stream as any) {
      const content = chunk.choices[0]?.delta?.content;
      if (!content) continue;
      if (flushed) {
        yield content;
        continue;
      }
      buffer += content;
      const hadThinking =
        /(?:here'?s\s+a\s+thinking\s+process|thinking\s+process|<think\b)/i.test(buffer);
      const cleaned = stripThinking(buffer);
      if (hadThinking && cleaned.length === 0 && buffer.length < 8000) continue;
      if (!hadThinking && buffer.length < 24) continue;
      flushed = true;
      buffer = "";
      if (cleaned) yield cleaned;
    }
    if (!flushed && buffer) {
      const cleaned = stripThinking(buffer);
      if (cleaned) yield cleaned;
    }
  }
}
