import { getProvider, GENERATOR_MODEL } from "@/lib/ai/registry";
import { createLogger } from "@/lib/logger";
import { extractJson } from "@/lib/ai/extract-json";
import type { LLMMessage } from "@/lib/ai/types";
import { shouldSkipScriptGeneration, type ScriptSlide } from "@/lib/slide-media";

const log = createLogger("lib/coaching-script");

/** Build a per-slide script generation prompt. */
function buildSlideScriptPrompt(
  slideNumber: number,
  totalSlides: number,
  slideTitle: string,
  presentationText: string,
  imageUrl: string | undefined,
  language = "en",
  userSlideNotes?: string,
): LLMMessage[] {
  const languageInstruction =
    language && language !== "en"
      ? `\nLANGUAGE: Write the script in ${language}. JSON keys must stay in English.\n`
      : "";

  const slideContext =
    slideTitle && slideTitle !== `Slide ${slideNumber}`
      ? `Slide title: "${slideTitle}"`
      : `Slide ${slideNumber} of ${totalSlides}`;

  const hasImage = !!imageUrl && imageUrl.startsWith("data:");

  const promptWordCount = userSlideNotes?.trim() 
    ? "approx 120-180 words, making it a detailed 1-to-1.5 minute spoken script" 
    : "approx 50-70 words, or 2-3 sentences";

  const notesInstruction = userSlideNotes?.trim()
    ? `\nCRITICAL INPUT: The user has provided specific script notes/ideas for this slide:\n"""\n${userSlideNotes}\n"""\nYou MUST use these notes as the primary foundation of the script. Do NOT discard this human input. Integrate their specific details, examples, and storyline with the main points of this slide. Elaborate on their points naturally.`
    : "";

  const systemPrompt = `You are an expert AI Trainer generating a narration script for a single presentation slide.
${languageInstruction}
TASK: Write a natural, professional training narration for slide ${slideNumber} of ${totalSlides}.
The script is what an AI trainer speaks aloud while the learner views this slide.
- Write a natural spoken paragraph (${promptWordCount}).${notesInstruction}
- Start directly with a spoken transition like "On this slide...", "Here we can see...", or "This section covers..."
- Be engaging and professional, as if delivering a live training.
- Do NOT output word numbers, parentheses, indexes, or annotations. Just output the clean speech text.
- Slide Title Rule: Keep the slide title EXACTLY as "${slideTitle}". Do NOT translate or modify the slide title.
- Output a valid JSON object matching this structure:
\`\`\`json
{
  "slide": ${slideNumber},
  "title": "${slideTitle}",
  "script": "Narration text here."
}
\`\`\``;

  const userContent: any = hasImage
    ? [
        { type: "image_url", image_url: { url: imageUrl } },
        { type: "text", text: `${slideContext}\n\nGenerate the narration script JSON for this slide now.` },
      ]
    : `${slideContext}\n\nPresentation context:\n${presentationText?.slice(0, 3000) || "(no text available)"}\n\nGenerate the narration script JSON for slide ${slideNumber} now.`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

/** Generate script for a single slide. */
export async function generateSlideScript(
  slideNumber: number,
  totalSlides: number,
  slideTitle: string,
  presentationText: string,
  imageUrl: string | undefined,
  language: string,
  userSlideNotes?: string,
): Promise<{ title: string; script: string }> {
  const provider = getProvider(GENERATOR_MODEL);
  const messages = buildSlideScriptPrompt(
    slideNumber,
    totalSlides,
    slideTitle,
    presentationText,
    imageUrl,
    language,
    userSlideNotes,
  );

  let fullContent = "";
  try {
    for await (const chunk of provider.streamResponse({
      messages,
      temperature: 0.7,
      maxTokens: 2048,
      model: GENERATOR_MODEL,
    })) {
      fullContent += chunk;
    }

    // Log raw content for diagnostic visibility
    console.log(`[AI Response Slide ${slideNumber}]:`, fullContent);

    // Strip <think> tags
    const thinkEnd = fullContent.indexOf("</think>");
    if (thinkEnd >= 0) {
      fullContent = fullContent.slice(thinkEnd + "</think>".length).trim();
    }

    // Strip markdown code fences if present
    fullContent = fullContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    // Simplify sanitization: collapse newlines to space if we detect a raw open quote but missing closing quote on same line
    // or simply replace literal newlines that occur within values
    const cleanedContent = fullContent.replace(/\n/g, " ").replace(/\r/g, "").replace(/\s+/g, " ").trim();

    let parsed: { slide?: number; title?: string; script?: string };
    try {
      parsed = JSON.parse(cleanedContent);
    } catch {
      try {
        parsed = extractJson<{ slide?: number; title?: string; script?: string }>(cleanedContent);
      } catch {
        // Last-resort: try to regex-extract just the script text
        const scriptMatch = cleanedContent.match(/"script"\s*:\s*"([^"]+)"/);
        const titleMatch = cleanedContent.match(/"title"\s*:\s*"([^"]+)"/);
        return {
          title: (titleMatch?.[1] || slideTitle).trim(),
          script: (scriptMatch?.[1] || cleanedContent.replace(/[{}"]/g, " ")).trim(),
        };
      }
    }

    const result = {
      title: (parsed.title || slideTitle).trim(),
      script: (parsed.script || cleanedContent).trim(),
    };
    log.info(`[AI Response Slide ${slideNumber} parsed result]:`, JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    log.error(`Failed to generate script for slide ${slideNumber}:`, err);
    return {
      title: slideTitle,
      script: `On slide ${slideNumber}, we cover the key concepts and learning objectives for this section of the training.`,
    };
  }
}

/**
 * Generate coaching scripts for all slides individually.
 * Each slide is its own AI request — no output token limit issue.
 * If a slide has an imageUrl (data URL), it's sent as visual context to Gemini.
 */
export async function generateCoachingScript(
  presentationText: string,
  language = "en",
  existingSlides?: Array<Partial<ScriptSlide> & { slide: number; title: string; script?: string }>,
): Promise<ScriptSlide[]> {
  // If no existing slides, infer structure from presentation text first
  if (!existingSlides || existingSlides.length === 0) {
    log.info(`No existing slides provided. Inferring slide structure from presentation text...`);
    existingSlides = await inferSlideStructure(presentationText, language);
    log.info(`Inferred slide structure resulted in ${existingSlides.length} slides:`, JSON.stringify(existingSlides, null, 2));
  } else {
    log.info(`Received ${existingSlides.length} existing slides as input:`, JSON.stringify(existingSlides, null, 2));
  }

  const totalSlides = existingSlides.length;
  log.info(`Generating scripts for ${totalSlides} slides individually (parallel)...`);

  const results = await Promise.all(
    existingSlides.map(async (slide) => {
      if (shouldSkipScriptGeneration(slide)) {
        return {
          ...slide,
          slide: slide.slide,
          title: slide.title,
          script: slide.script ?? "",
        } as ScriptSlide;
      }
      const { title, script } = await generateSlideScript(
        slide.slide,
        totalSlides,
        slide.title,
        presentationText,
        slide.imageUrl,
        language,
        slide.script,
      );
      return {
        ...slide,
        slide: slide.slide,
        title,
        script,
      } as ScriptSlide;
    }),
  );

  log.info(`Successfully generated ${results.length} slide scripts.`);
  return results;
}

/** Infer slide structure from raw presentation text when no slides exist yet. */
async function inferSlideStructure(
  presentationText: string,
  language: string,
): Promise<Array<{ slide: number; title: string }>> {
  const provider = getProvider(GENERATOR_MODEL);
  const languageInstruction =
    language && language !== "en" ? `\nWrite all slide titles in ${language}.\n` : "";

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: `You are analyzing a presentation document to identify its logical slide sections.${languageInstruction}
Return a JSON array of slide objects. Each object has "slide" (number) and "title" (string).
Create one entry per distinct topic or section in the document.
Output ONLY valid JSON array, no markdown, no explanation:
[{"slide": 1, "title": "Section Title"}, ...]`,
    },
    {
      role: "user",
      content: `Identify all the slides/sections in this presentation:\n\n${presentationText.slice(0, 8000)}`,
    },
  ];

  let fullContent = "";
  try {
    for await (const chunk of provider.streamResponse({
      messages,
      temperature: 0.3,
      maxTokens: 2048,
      model: GENERATOR_MODEL,
    })) {
      fullContent += chunk;
    }
    
    log.info(`[inferSlideStructure RAW AI Response]:\n`, fullContent);

    const thinkEnd = fullContent.indexOf("</think>");
    if (thinkEnd >= 0) fullContent = fullContent.slice(thinkEnd + "</think>".length).trim();

    const parsed = extractJson<Array<{ slide: number; title: string }>>(fullContent);
    log.info(`[inferSlideStructure PARSED Output]:\n`, JSON.stringify(parsed, null, 2));
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (err) {
    log.error("Failed to infer slide structure:", err);
  }

  // Generic fallback
  return [
    { slide: 1, title: "Introduction & Overview" },
    { slide: 2, title: "Key Concepts & Analysis" },
    { slide: 3, title: "Strategy & Implementation" },
    { slide: 4, title: "Summary & Next Steps" },
  ];
}
