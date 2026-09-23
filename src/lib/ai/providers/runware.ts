import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { type LLMProvider, type GenerationParams, type LLMResponse, type LLMMessage } from "../types";

export class RunwareProvider implements LLMProvider {
  id = "runware";
  name = "Runware Deepseek";
  models = ["deepseek:v4@flash"];
  defaultModel = "deepseek:v4@flash";

  private client: OpenAI;

  constructor() {
    const runwareKey = process.env.RUNWARE_API_KEY?.trim();
    if (!runwareKey) {
      console.warn("RUNWARE_API_KEY not set. RunwareProvider may fail.");
    }
    this.client = new OpenAI({
      apiKey: runwareKey ?? "",
      baseURL: "https://api.runware.ai/v1",
    });
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
    const model = params.model ?? this.defaultModel;
    console.log(`[RunwareProvider] Using model: ${model}`);

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
    const model = params.model ?? this.defaultModel;
    console.log(`[RunwareProvider] Using model: ${model}`);

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
