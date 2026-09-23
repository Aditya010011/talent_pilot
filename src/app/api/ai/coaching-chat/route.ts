import { getProvider } from "@/lib/ai/registry";
import { stripThinking } from "@/lib/ai/strip-thinking";
import { getLlmLanguageName } from "@/lib/languages";
import { createLogger } from "@/lib/logger";
import { NextResponse } from "next/server";

const log = createLogger("api/ai/coaching-chat");

/** Coaching chatbot uses OpenRouter (Nemotron). Override with COACHING_CHAT_MODEL / OPENROUTER_MODEL. */
const COACHING_MODEL =
  process.env.COACHING_CHAT_MODEL?.trim() ||
  process.env.OPENROUTER_MODEL?.trim() ||
  "nvidia/nemotron-3.5-lightning:free";

export async function POST(req: Request) {
  try {
    const { messages, slides, trainingTitle, language } = await req.json();

    if (!slides || !Array.isArray(slides)) {
      return NextResponse.json({ error: "Slides context required" }, { status: 400 });
    }

    // Build a concise context from slide summaries + scripts
    const slideContext = slides
      .map((s: any, i: number) => {
        const parts: string[] = [`--- Slide ${i + 1}: ${s.title || "Untitled"} ---`];
        if (s.summary) parts.push(`Summary: ${s.summary}`);
        if (s.script) parts.push(`Narration: ${s.script}`);
        return parts.join("\n");
      })
      .join("\n\n");

    const languageInstruction =
      language && language !== "en"
        ? `\nLANGUAGE: Respond in ${getLlmLanguageName(language)}. Keep slide references and formatting clear.\n`
        : "";

    const systemPrompt = `You are a helpful AI learning assistant for the training module: "${trainingTitle}".
${languageInstruction}
Your role is to answer learners' questions about the training material. You have been provided with the full content from each slide including summaries and narration scripts.

TRAINING MATERIAL:
${slideContext}

INSTRUCTIONS:
- Answer questions based ONLY on the provided training material.
- Be clear, concise, and educational in your responses.
- When relevant, reference specific slide numbers so learners can review them (e.g., "As covered in Slide 3...").
- If a question is not covered in the material, say so honestly and suggest reviewing specific slides that may be related.
- Use a friendly, encouraging, teacher-like tone.
- Format responses with line breaks for readability. Use bullet points when listing items.
- Keep responses focused and no longer than necessary.
- Do NOT invent information not present in the slides.
- Reply with the final answer only. Do NOT show chain-of-thought, a thinking process, reasoning steps, analysis of the user input, or outlines like "Here's a thinking process" / "Thinking:". Never dump internal reasoning.`;

    const provider = getProvider("openrouter");

    const conversationMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const response = await provider.generateResponse({
      messages: conversationMessages,
      temperature: 0.5,
      maxTokens: 800,
      model: COACHING_MODEL,
    });

    const content = stripThinking(response.content ?? "");
    return NextResponse.json({
      content: content || "Sorry, I couldn't generate a response. Please try again.",
    });
  } catch (error) {
    log.error("Coaching chat error:", error);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
  }
}
