import type { LLMMessage } from "../types";

/** Prompt guidelines for generating the slide-by-slide AI Coaching script from a presentation document text. */
export function buildCoachingScriptPrompt(
  presentationText: string,
  language = "en",
): LLMMessage[] {
  const languageInstruction = language && language !== "en"
    ? `\nLANGUAGE: All generated coaching slide scripts (title, header, script speech content) MUST be written in ${language}. Only the JSON keys and structural identifiers should remain in English.\n`
    : "";

  return [
    {
      role: "system",
      content: `You are an expert AI Trainer and presentation narration specialist. Your task is to analyze the extracted presentation document text and generate a structured, professional slide-by-slide TRAINING script, as if you are an AI trainer delivering a live training session to learners watching your video alongside the slides.
${languageInstruction}
TRAINING SCRIPT RULES:
- Break down the presentation into logical slides or sections. Create ONE slide entry per slide/section in the source material — cover EVERY section without exception.
- For each slide, write a clear, descriptive slide title.
- For each slide, write a TRAINING NARRATION SCRIPT — this is what the AI trainer speaks out loud while the learner views that slide.
- LENGTH: Each script should be 50–70 words (approximately 30 seconds of spoken audio). Keep each script concise but informative.
- CRITICAL: You MUST generate a script for EVERY SINGLE slide in the presentation. Do NOT stop after a few slides. The JSON array must include ALL slides from start to finish, no exceptions.
- Write in a warm, engaging, instructional tone — as if you are a knowledgeable trainer speaking directly to learners.
- Reference the slide content explicitly (e.g. "As you can see on this slide...", "This diagram shows...", "Notice how...").

OUTPUT VALID JSON ONLY (no markdown backticks, no explanation, no extra text before or after):
[
  {
    "slide": 1,
    "title": "Slide Title",
    "script": "50-70 word narration script for this slide, written as spoken audio by the AI trainer."
  }
]
`,
    },
    {
      role: "user",
      content: `Here is the extracted presentation document text. Generate the full slide-by-slide training narration script JSON now:

"${presentationText}"`,
    },
  ];
}
