import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { type LLMProvider, type GenerationParams, type LLMResponse, type LLMMessage } from "../types";
import {
  GEMINI_FLASH_MODEL,
  GEMINI_LITE_MODEL,
  GEMINI_OPENAI_BASE_URL,
  hasGeminiApiKey,
  resolveGeminiModel,
} from "../models";

export class OpenAIProvider implements LLMProvider {
  id = "openai";
  name = "Gemini (OpenAI-compat)";
  models = [
    GEMINI_FLASH_MODEL,
    GEMINI_LITE_MODEL,
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    // Legacy gpt names kept so DB values still resolve to this provider
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-5-mini",
  ];
  defaultModel = GEMINI_FLASH_MODEL;

  private client: OpenAI;

  constructor() {
    const googleKey = process.env.GOOGLE_API_KEY?.trim();

    if (googleKey) {
      this.client = new OpenAI({
        apiKey: googleKey,
        baseURL: GEMINI_OPENAI_BASE_URL,
      });
      this.defaultModel = GEMINI_FLASH_MODEL;
      return;
    }

    // ── Azure OpenAI (DISABLED — Gemini migration) ──────────────────────────
    // Re-enable if leadership wants to roll back. Requires AZURE_OPENAI_* envs.
    /*
    import { AzureOpenAI } from "openai";
    if (process.env.AZURE_OPENAI_API_KEY?.startsWith("3PtGX")) {
      process.env.AZURE_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    }
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const azureKey = process.env.AZURE_OPENAI_API_KEY;
    const azureDeployment =
      process.env.AZURE_OPENAI_DEPLOYMENT_CHAT ||
      process.env.AZURE_OPENAI_DEPLOYMENT ||
      "gpt-5-mini";
    if (azureEndpoint && azureKey) {
      this.client = new AzureOpenAI({
        endpoint: azureEndpoint,
        apiKey: azureKey,
        apiVersion: "2024-10-01-preview",
        deployment: azureDeployment,
      });
      this.defaultModel = azureDeployment;
      return;
    }
    */

    // Last-resort plain OpenAI (should not be primary after Gemini migration)
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (!openaiKey && !hasGeminiApiKey()) {
      throw new Error(
        "No Gemini LLM configured. Set GOOGLE_API_KEY (preferred) for gemini-3.5-flash / gemini-3.1-flash-lite.",
      );
    }
    this.client = new OpenAI({
      apiKey: openaiKey ?? "",
      baseURL: process.env.OPENAI_BASE_URL,
    });
    this.defaultModel = "gpt-4o-mini";
  }

  private toOpenAIMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content as string & Array<unknown>,
    })) as ChatCompletionMessageParam[];
  }

  private resolveModel(paramsModel?: string): string {
    if (hasGeminiApiKey()) {
      return resolveGeminiModel(paramsModel ?? this.defaultModel, "flash");
    }
    return paramsModel ?? this.defaultModel;
  }

  async generateResponse(
    params: GenerationParams & { model?: string }
  ): Promise<LLMResponse> {
    const model = this.resolveModel(params.model);
    console.log(`[OpenAIProvider/Gemini] Using model: ${model}`);

    const response = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(params.messages),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
    } as any);

    const choice = response.choices[0];
    return {
      content: choice.message.content ?? "",
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
    const model = this.resolveModel(params.model);
    console.log(`[OpenAIProvider/Gemini] Using model: ${model}`);

    const stream = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(params.messages),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
      stream: true,
    } as any);

    for await (const chunk of stream as any) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
