/**
 * Low-Latency Google Voice Relay
 *
 * Browser ←→ this relay ←→ Google STT + Gemini Lite Chat + Google TTS
 *
 * Replaces the expensive OpenAI Realtime API with high-performance,
 * low-latency alternatives:
 *   - Google Cloud STT
 *   - Gemini 3.1 Flash-Lite (LLM, streaming completions via OpenAI-compat)
 *   - Google Cloud TTS
 *
 * Same WebSocket protocol as openai-voice-relay.ts — no frontend changes needed.
 * Usage: npm run dev:google-voice
 */

import { config } from "dotenv";
import { WebSocket, WebSocketServer } from "ws";
import OpenAI from "openai";
import { createLogger } from "../src/lib/logger";
import {
  getGoogleSttCode,
  getGoogleTtsConfig,
  getLlmLanguageName,
  resolveLanguage,
} from "../src/lib/languages";
import {
  buildClarificationRestateSpeech,
  isCandidateClarificationUtterance,
  isSubstantiveInterviewAnswer,
} from "./voice-relay-helpers";
import speech from "@google-cloud/speech";
import textToSpeech from "@google-cloud/text-to-speech";

config({ path: ".env.local", override: true });
config({ path: ".env" });

const log = createLogger("voice-relay");

const GOOGLE_KEY_FILENAME = "single-quanta-461104-i7-af0effe9cc10.json";

// ── Config ──────────────────────────────────────────────────────────────

const RELAY_PORT =
  Number(process.env.GOOGLE_VOICE_RELAY_PORT || process.env.OPENAI_VOICE_RELAY_PORT) || 8082;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";
// Voice / chat turns → Lite. Override with GOOGLE_RELAY_LLM_MODEL if needed.
const LLM_MODEL =
  process.env.GOOGLE_RELAY_LLM_MODEL ||
  process.env.GEMINI_LITE_MODEL ||
  "gemini-3.1-flash-lite";
const TTS_SAMPLE_RATE = 24000;

// ── Azure TTS config (Cantonese opt-in fallback) ─────────────────────────
// Default: Google TTS for all languages (yue → Chirp3 HD; no yue-HK-Wavenet exists).
// Set USE_AZURE_TTS_YUE=true to force Azure Neural for Cantonese instead.
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || "";
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || "southeastasia";
const AZURE_TTS_VOICE_YUE = process.env.AZURE_TTS_VOICE_YUE || "zh-HK-HiuGaaiNeural";
const USE_AZURE_TTS_YUE = process.env.USE_AZURE_TTS_YUE === "true";

function getAzureTtsVoice(language?: string | null): string {
  if (!USE_AZURE_TTS_YUE) return "";
  const lang = resolveLanguage(language);
  return lang.code === "yue" ? AZURE_TTS_VOICE_YUE : "";
}

// ── Azure OpenAI LLM (DISABLED — Gemini migration) ────────────────────────
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
// const AZURE_ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
// const AZURE_API_VERSION = "2024-10-01-preview";
// const AZURE_CHAT_DEPLOYMENT =
//   process.env.AZURE_OPENAI_DEPLOYMENT_CHAT ||
//   process.env.AZURE_OPENAI_DEPLOYMENT ||
//   "gpt-4o-realtime-preview";
// const USE_AZURE = !!AZURE_ENDPOINT;

if (!GOOGLE_API_KEY) {
  log.error("Missing GOOGLE_API_KEY in .env.local (required for Gemini Lite LLM)");
  process.exit(1);
}

if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
  log.warn("AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not set — Azure TTS unavailable (Cantonese will fall back to Google TTS).");
}

// ── Clients ──────────────────────────────────────────────────────────────

const openai = new OpenAI({
  apiKey: GOOGLE_API_KEY,
  baseURL: GEMINI_OPENAI_BASE_URL,
});
// Azure rollback:
// const openai = USE_AZURE
//   ? new OpenAI({
//       apiKey: OPENAI_API_KEY,
//       baseURL: `${AZURE_ENDPOINT}/openai/deployments/${AZURE_CHAT_DEPLOYMENT}`,
//       defaultQuery: { "api-version": AZURE_API_VERSION },
//       defaultHeaders: { "api-key": OPENAI_API_KEY },
//     })
//   : new OpenAI({ apiKey: OPENAI_API_KEY });

const speechClient = new speech.SpeechClient({ keyFilename: GOOGLE_KEY_FILENAME });
const ttsClient = new textToSpeech.TextToSpeechClient({ keyFilename: GOOGLE_KEY_FILENAME });

log.info(`Voice relay starting on ws://localhost:${RELAY_PORT}`);
log.info(
  USE_AZURE_TTS_YUE
    ? `LLM: Gemini/${LLM_MODEL} | TTS: Google Cloud (Cantonese → Azure ${AZURE_SPEECH_REGION})`
    : `LLM: Gemini/${LLM_MODEL} | TTS: Google Cloud (Cantonese → Chirp3 HD)`
);

// ── Types ────────────────────────────────────────────────────────────────

interface InterviewContext {
  title: string;
  objective?: string | null;
  aiName: string;
  aiTone: string;
  language: string;
  followUpDepth: string;
  isVoiceOnly?: boolean;
  startQuestionIndex?: number;
  questionsAsked?: string[];
  timeLimitMinutes?: number | null;
  /** When true: STT + transcripts only — no Gemini greeting/TTS/turn replies (Vidu brain). */
  skipLlm?: boolean;
  questions: Array<{
    id?: string;
    text: string;
    type: string;
    description?: string | null;
    options?: { options: string[]; allowMultiple?: boolean } | null;
    starterCode?: { language: string; code: string } | null;
    order: number;
  }>;
}

// ── Audio helpers ────────────────────────────────────────────────────────

/** 16-bit signed LE PCM → 32-bit float LE PCM (browser AudioContext format) */
function linear16ToFloat32(buf: Buffer): Buffer {
  const samples = Math.floor(buf.length / 2);
  const out = Buffer.alloc(samples * 4);
  for (let i = 0; i < samples; i++) {
    out.writeFloatLE(buf.readInt16LE(i * 2) / 32768.0, i * 4);
  }
  return out;
}

// ── Sentence splitter ────────────────────────────────────────────────────

function extractSentences(text: string, eager: boolean = false): { complete: string[]; remainder: string } {
  // Split on sentence-ending punctuation followed by space or end-of-string
  // If eager is true, also split on commas and semicolons for faster first-response
  const re = eager 
    ? /([^.!?。！？,，;；]*[.!?。！？,，;；]+)\s*/g
    : /([^.!?。！？]*[.!?。！？]+)\s*/g;
  const complete: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    complete.push(match[1].trim());
    lastIndex = re.lastIndex;
  }
  return { complete, remainder: text.slice(lastIndex) };
}

function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function speechAlreadyCovered(spoken: string, addition: string): boolean {
  const a = normalizeSpeechText(spoken);
  const b = normalizeSpeechText(addition);
  if (!b) return true;
  if (a.includes(b)) return true;
  if (b.length > 30 && a.length > 15) {
    const tail = a.slice(Math.max(0, a.length - 80));
    if (b.startsWith(tail) || tail.includes(b.slice(0, 40))) return true;
  }
  return false;
}

function enqueueSpeechIfNew(
  text: string,
  alreadySpoken: string,
  enqueue: (t: string) => void,
): void {
  const trimmed = text.trim();
  if (!trimmed || speechAlreadyCovered(alreadySpoken, trimmed)) return;
  enqueue(trimmed);
}

function getMaxFollowUps(_followUpDepth: string): number {
  // Hard-coded: follow-ups disabled regardless of interview followUpDepth setting.
  // Also covers voice-only / non-interactive sessions.
  return 0;
}

/** Normalize for loose "does spoken include exact question" checks. */
function normalizeSpeech(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Ensure spoken transition/greeting matches the on-screen question word-for-word.
 * Voice-only: ONLY the exact question text (no ack / paraphrase).
 * Interactive: keep short leading ack if present, then exact question (coding/whiteboard unchanged).
 */
function buildVerbatimQuestionSpeech(
  llmSpeech: string,
  question: { text: string; type: string } | undefined,
  isVoiceOnly: boolean,
): string {
  const exact = question?.text?.trim() || "";
  if (!exact) return llmSpeech.trim();
  if (isVoiceOnly) return exact;
  const spoken = llmSpeech.trim();
  if (!spoken) return exact;
  if (normalizeSpeech(spoken).includes(normalizeSpeech(exact))) return spoken;
  const parts = spoken.split(/(?<=[。！？.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const lead = parts[0];
  if (
    lead &&
    lead.length <= 80 &&
    !/[?？]/.test(lead) &&
    !normalizeSpeech(lead).includes(normalizeSpeech(exact).slice(0, Math.min(12, exact.length)))
  ) {
    return `${lead} ${exact}`;
  }
  return exact;
}
// ── Fallback greeting per language ────────────────────────────────────────

function getFallbackGreeting(language: string, interviewLanguage: string): string {
  const code = resolveLanguage(language).code;
  const greetings: Record<string, string> = {
    en: "Let's get started. Please answer the first question on your screen.",
    zh: "我们开始吧。请回答您屏幕上的第一个问题。",
    es: "Empecemos. Por favor, responda a la primera pregunta en su pantalla.",
    fr: "Commençons. Veuillez répondre à la première question sur votre écran.",
    de: "Lassen Sie uns beginnen. Bitte beantworten Sie die erste Frage auf Ihrem Bildschirm.",
    pt: "Vamos começar. Por favor, responda à primeira pergunta no seu ecrã.",
    it: "Cominciamo. Rispondi alla prima domanda sullo schermo.",
    ja: "始めましょう。画面の最初の質問に答えてください。",
    ko: "시작하겠습니다. 화면에 있는 첫 번째 질문에 답해 주세요.",
    hi: "शुरू करते हैं। कृपया अपनी स्क्रीन पर पहले प्रश्न का उत्तर दें।",
    ru: "Давайте начнем. Пожалуйста, ответьте на первый вопрос на экране.",
    ar: "دعنا نبدأ. يرجى الإجابة على السؤال الأول الذي يظهر على شاشتك.",
    tr: "Başlayalım. Lütfen ekranınızdaki ilk soruyu yanıtlayın.",
    nl: "Laten we beginnen. Beantwoord de eerste vraag op uw scherm.",
  };
  return greetings[code] ?? `Let's get started. Please answer the first question on your screen. (Please respond in ${interviewLanguage}.)`;
}

// ── OpenAI tool definition ────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "signal_question_change",
      description:
        "Signal that the interview should move to a different question. Call ONLY when the current question has been substantively discussed or the participant explicitly asks to skip/go back. ALWAYS include the `speech` field — it is what you will say aloud as you transition. Do NOT call this tool silently.",
      parameters: {
        type: "object",
        properties: {
          questionIndex: {
            type: "integer",
            description:
              "Zero-based index of the question to move to. Use current+1 for next, current-1 for previous, or total_questions to signal interview end.",
          },
          userRequested: {
            type: "boolean",
            description: "True only if participant explicitly asked to skip or go back.",
          },
          speech: {
            type: "string",
            description:
              "What you say aloud while transitioning. For a normal transition: brief acknowledgement of the previous answer + the new question. For interview end: a warm farewell. Always 1-3 sentences. Required.",
          },
        },
        required: ["questionIndex", "speech"],
      },
    },
  },
];

// ── System prompt ────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: InterviewContext, startIdx: number, userTurnsOnCurrentQ: number = 0): string {
  const interviewLanguage = getLlmLanguageName(ctx.language);
  const sorted = [...ctx.questions].sort((a, b) => a.order - b.order);

  const maxFollowUps = getMaxFollowUps(ctx.followUpDepth);

  const langObj = resolveLanguage(ctx.language);
  const languageBlock = langObj.code === "yue"
    ? `## CRITICAL LANGUAGE REQUIREMENT — CANTONESE ONLY (廣東話)
- You MUST speak ONLY in authentic Hong Kong Cantonese (廣東話 / yue-HK).
- Do NOT speak Mandarin (普通話) under ANY circumstances.
- Use natural Cantonese vocabulary and grammar (e.g. 我係, 唔係, 咁, 點解, 呢個, 佢, 咗, 緊, 嘅, 呢度, 嗰度).
- Do NOT output Mandarin phrasing (e.g. do NOT use 是, 不是, 為什麼, 這個, 他/她).
- Every sentence you generate MUST be natural spoken Cantonese.`
    : `## Language Requirement
- Speak strictly in ${interviewLanguage}.
- Use the native writing system of ${interviewLanguage}. Never speak English, and never transliterate into Latin letters, unless ${interviewLanguage} is English.
- The question script is already in ${interviewLanguage}; read those questions as written.`;

  const questionList = sorted.map((q, i) => {
    const isCompleted = q.id && ctx.questionsAsked?.includes(q.id) ? " [COMPLETED - DO NOT REPEAT]" : "";
    let entry = `  ${i + 1}. [${q.type}]${isCompleted} ${q.text}`;
    if (q.description) entry += `\n     Context: ${q.description}`;
    if (q.options?.options?.length) {
      const labels = q.options.options
        .map((o, j) => `${String.fromCharCode(65 + j)}) ${o}`)
        .join(", ");
      const multi = q.options.allowMultiple ? " (multiple choice)" : " (single choice)";
      entry += `\n     Options${multi}: ${labels}`;
    }
    if (q.type === "CODING")
      entry += `\n     Note: The participant has a code editor. Reference their code when they share it.`;
    if (q.type === "WHITEBOARD")
      entry += `\n     Note: The participant has a whiteboard. Reference updates when they address you.`;
    return entry;
  }).join("\n");

  const currentQ = startIdx + 1;
  const timeLimitLine = ctx.timeLimitMinutes
    ? `- Maximum duration: ${ctx.timeLimitMinutes} minutes (this is a cap, not a target)`
    : "";

  return `You are Inluwa, a ${ctx.aiTone} interviewer.
Your name is strictly "Inluwa". When you introduce yourself, do so in ${interviewLanguage} using the name Inluwa.
Do not refer to yourself as an "LLM Interviewer" or "AI". 
The topic of the interview might be about LLMs, but that is not your name.
IMPORTANT: Never put spaces between the letters of your name (say INLUWA, not I N L U W A) or acronyms (say LLM, not L LM).

${languageBlock}

## Interview Details
- Topic: "${ctx.title}"
${ctx.objective ? `- Objective: ${ctx.objective}` : ""}
- Total questions: ${sorted.length}
- Starting at question ${currentQ} of ${sorted.length}
- Follow-up depth: No follow-ups (move to next question after one substantive answer)
${timeLimitLine}

## Time and pacing
${ctx.timeLimitMinutes
    ? `- The ${ctx.timeLimitMinutes}-minute limit is a maximum cap only. Do NOT end early because you think time is running out.
- Your goal is to work through all ${sorted.length} questions. Finishing before the cap is fine.
- Never say the allotted time has been reached unless you are ending because all questions are complete.
- Do not mention time limits in your farewell unless the participant explicitly asks about time.`
    : `- Your goal is to work through all ${sorted.length} questions at a natural pace.
- Do not claim time has run out or that the allotted time has been reached.`}

## Questions
${questionList}

## Your Behavior
1. You are the user's interviewer for the day. You have ALREADY introduced yourself at the start. Do NOT say "Hi, I'm Inluwa" or introduce yourself again. Just continue the conversation naturally.
2. Do NOT invent follow-up or probing interview questions. After ONE substantive answer to the current scripted question, immediately call signal_question_change to move to the next scripted question. Follow-up depth is hard-coded to ZERO (including voice-only).
2a. Hard cap: the participant has already given ${userTurnsOnCurrentQ} substantive answer(s) to this question. If ${userTurnsOnCurrentQ} >= 1 AND their latest message is a substantive answer (not a repeat/clarify/meta request), you MUST call signal_question_change now — do NOT ask another interview question on this topic.
2b. **CANDIDATE CLARIFICATIONS (repeat / "what do you mean?" / audio checks): stay on the CURRENT question index.** Answer helpfully, then restate the SAME current question from the Questions list (light natural rephrase of the same question is OK; never invent a new question). NEVER call signal_question_change for these turns.
3. When a question is sufficiently discussed, call the signal_question_change function to move forward.
3a. Never move to a new question only in spoken text. Every transition must use signal_question_change so the UI progress updates correctly.
3b. **CRITICAL — your main assistant message must contain EVERYTHING you say aloud** (acknowledgement, natural bridge, and the next question when transitioning). The participant hears your main message, NOT the tool. Do not stop mid-sentence or leave speech only in the tool.
3c. **CRITICAL — Do NOT ask ANY question marked with [COMPLETED - DO NOT REPEAT]. The database has already marked these as completely finished.**
3d. **CRITICAL — SCRIPTED QUESTIONS:** When you pose an interview question (first ask, restate after repeat, or transition), speak the question from the Questions list. On a normal ask/transition prefer verbatim. On an explicit repeat request you may lightly rephrase for naturalness but it MUST be the same question — never a new probe.
4. **ALSO fill the "speech" field in signal_question_change** as a backup copy of your transition words. ${ctx.isVoiceOnly ? "For voice-only / non-interactive mode, speech MUST contain ONLY the exact next question text — no acknowledgement, bridge, or extra words." : "If your main message already includes the full transition, repeat the same text in speech. Include the next question verbatim."}
5. After all questions are done, call signal_question_change with questionIndex=${sorted.length} (out of bounds), with a warm farewell in the "speech" field.
6. Keep responses concise (1-3 sentences) and conversational. Use a short calm acknowledgement in ${interviewLanguage}, then continue.${ctx.isVoiceOnly ? "\n**CRITICAL — VOICE-ONLY / NON-INTERACTIVE:** You MUST NOT produce conversational reactions, feedback, evaluations, or follow-ups. When it is your turn to speak, ONLY read the current/next question text exactly as written. After the participant finishes ANY answer (even a short one), immediately call signal_question_change and read the next question verbatim — nothing else. If they ask to repeat/clarify, only restate the exact current question text and do NOT advance." : ""}
7. Avoid formal written structures. Do not use colons, em-dashes, or bullet points in your speech.
8. If the participant asks to repeat, clarify meaning, says they could not hear you, or checks audio (e.g. "can you hear me?", "hello?", "please repeat", "what do you mean?"), answer that directly and then restate the **current** question. Do NOT treat it as an answer, do NOT invent a new interview question, and do NOT call signal_question_change.
9. **Tone of voice in wording:** Stay calm, neutral, and professional. Do NOT sound overly excited, enthusiastic, dramatic, warm-gushy, or emotional. Avoid phrases like "I'm so excited", "wonderful!", "amazing", or exaggerated praise. Speak like a steady interviewer, not a cheerleader.

## Question Transitions
- NEVER say "Question 1", "Question 2", etc.
- NEVER say "Next question" or "Moving to the next topic".
${ctx.isVoiceOnly
    ? "- Voice-only: do NOT add transition phrases. Speak ONLY the exact next question text."
    : `- You may use a brief acknowledgement (one short sentence), then speak the next question text VERBATIM from the list.
- Do NOT rephrase the question after the acknowledgement.`}

## Special Rules for Choice Questions
When asking a SINGLE_CHOICE or MULTIPLE_CHOICE question, you MUST read out ALL the answer options (A, B, C, etc.) as part of asking the question. The participant can only hear you — they cannot see the options unless you say them. After listing the options, ask the participant to choose and explain their reasoning. For multiple-choice questions, remind them they can select more than one option.

## Special Rules for Coding / Whiteboard Questions
When transitioning to a CODING or WHITEBOARD question:
- Read the full question text EXACTLY as written (same as every other question).
- Keep your responses short — let the participant focus on thinking and coding/drawing.
- Categorize the participant's speech and respond accordingly:
  1. Talking TO YOU (asking questions about the problem) → Answer briefly; do NOT invent follow-up interview questions
  2. Saying they're DONE ("I'm done", "finished", "submit") → Briefly acknowledge, then IMMEDIATELY call signal_question_change to the next question
  3. Thinking ALOUD (self-talk, "hmm", reading code) → Brief encouragement only (e.g. "Take your time") — do NOT ask probing questions
  4. Wanting to SKIP ("I can't do this", "skip", "next question") → Brief acknowledgement, then call signal_question_change
  5. Discussion naturally CONCLUDED → Brief acknowledgement, then call signal_question_change
- NEVER ask follow-ups about approach, complexity, or improvements. One answer / submit → next question.

## Language Requirements
- YOU MUST ALWAYS RESPOND IN ${interviewLanguage.toUpperCase()}.
- Speak in natural, complete sentences. Avoid formal "written" structures like "Topic: [Title]" or using colons, em-dashes, and bullet points in your speech.
- For example, instead of saying "Topic: LLM Screening", say "Today we'll be doing the LLM Screening."
- Conduct this interview entirely in ${interviewLanguage}. Do not switch to any other language under any circumstance.`;
}


// ── Azure TTS ─────────────────────────────────────────────────────────────

/** Clean text before TTS: strip markdown and expand acronyms for natural pronunciation */
function cleanForTts(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")  // bold
    .replace(/\*(.*?)\*/g, "$1")      // italic
    .replace(/`([^`]+)`/g, "$1")      // code
    .replace(/^#{1,6}\s+/gm, "")     // headers
    .replace(/^[-*]\s+/gm, "")       // bullet points
    .replace(/\s*[:—–]\s*/g, ", ")   // colons and dashes → natural pause
    .replace(/L\s+LM/g, "LLM")       // fix weird spacing
    .replace(/A\s+I/g, "AI")
    .replace(/\bLLM\b/g, "LLM")
    .replace(/\bAI\b/g, "AI")
    .replace(/\bML\b/g, "ML")
    .replace(/\bAPI\b/g, "API")
    .replace(/\bUI\b/g, "UI")
    .replace(/\bGPT\b/g, "GPT")
    .replace(/\bCV\b/g, "C-V")
    .trim();
}

async function synthesizeSpeechStreaming(
  text: string,
  language: string,
  onChunk: (buf: Buffer) => void,
  signal?: AbortSignal
): Promise<void> {
  const cleanText = cleanForTts(text.replace(/\[\w+\]/g, "")).trim();
  if (!cleanText) return;

  // ── Route: Cantonese → Azure TTS, everything else → Google TTS ──────────
  const azureVoice = getAzureTtsVoice(language);
  if (azureVoice && AZURE_SPEECH_KEY && AZURE_SPEECH_REGION) {
    await synthesizeSpeechAzure(cleanText, azureVoice, onChunk, signal);
    return;
  }
  if (azureVoice && (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION)) {
    log.warn("Azure TTS requested for Cantonese but credentials are missing — falling back to Google TTS.");
  }

  // ── Google TTS (all languages; yue uses Chirp3 HD — no WaveNet for yue-HK) ─
  const { languageCode, voiceName } = getGoogleTtsConfig(language);
  const isChirp3 = voiceName.includes("Chirp3");

  try {
    const request = {
      input: { text: cleanText },
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: 'LINEAR16' as const,
        sampleRateHertz: 24000,
        // Neutral delivery — avoid theatrical pitch / speed from WaveNet-style default.
        // Chirp3 HD rejects pitch; omit it for those voices.
        speakingRate: 0.95,
        ...(isChirp3 ? {} : { pitch: -1.5 }),
      },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    if (signal?.aborted) return;

    let audioData = Buffer.from(response.audioContent as Uint8Array);

    // Skip WAV header (first 44 bytes) to ensure pristine raw 16-bit signed PCM
    if (audioData.length > 44) {
      audioData = audioData.subarray(44);
    }

    // Ensure even length
    if (audioData.length % 2 !== 0) {
      audioData = audioData.subarray(0, audioData.length - 1);
    }

    if (audioData.length > 0) {
      const float32 = linear16ToFloat32(audioData);
      onChunk(float32);
    }
  } catch (err) {
    const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
    if (isAbort) {
      log.debug("Google TTS streaming interrupted/aborted.");
      return;
    }
    log.error("Google TTS error:", err);
  }
}

/** Azure TTS: calls REST API and returns raw-24khz-16bit-mono-pcm (no WAV header). */
async function synthesizeSpeechAzure(
  cleanText: string,
  voiceName: string,
  onChunk: (buf: Buffer) => void,
  signal?: AbortSignal
): Promise<void> {
  // Extract the locale from the voice name (e.g. "zh-HK" from "zh-HK-HiuGaaiNeural")
  const locale = voiceName.split("-").slice(0, 2).join("-");

  const ssml = `<speak version='1.0' xml:lang='${locale}'>
  <voice name='${voiceName}'>
    <prosody rate='0%' pitch='-5%'>${cleanText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</prosody>
  </voice>
</speak>`;

  const url = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        // raw-24khz-16bit-mono-pcm → no WAV header, ready to convert directly
        "X-Microsoft-OutputFormat": "raw-24khz-16bit-mono-pcm",
        "User-Agent": "interview-relay",
      },
      body: ssml,
      signal: signal as RequestInit["signal"],
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Azure TTS failed [${response.status}]: ${errBody}`);
    }

    if (signal?.aborted) return;

    const arrayBuffer = await response.arrayBuffer();
    if (signal?.aborted) return;

    let audioData = Buffer.from(arrayBuffer);

    // Ensure even byte count (2 bytes per Int16 sample)
    if (audioData.length % 2 !== 0) {
      audioData = audioData.subarray(0, audioData.length - 1);
    }

    if (audioData.length > 0) {
      const float32 = linear16ToFloat32(audioData);
      onChunk(float32);
    }
  } catch (err) {
    const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
    if (isAbort) {
      log.debug("Azure TTS interrupted/aborted.");
      return;
    }
    log.error("Azure TTS error:", err);
  }
}

// ── WebSocket server ──────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: RELAY_PORT });

wss.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    log.error(
      `Port ${RELAY_PORT} is already in use. Stop the other relay process or set GOOGLE_VOICE_RELAY_PORT.`
    );
  } else {
    log.error("WebSocket server error:", err);
  }
  process.exit(1);
});

wss.on("connection", (browserWs) => {
  log.info("Browser connected");

  const timeout = setTimeout(() => {
    log.error("No init message within 10s");
    browserWs.close();
  }, 10_000);

  const handler = (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "mic_test") {
        clearTimeout(timeout);
        browserWs.removeListener("message", handler);
        handleMicTest(browserWs, typeof msg.language === "string" ? msg.language : "en");
      } else if (msg.type === "init" && msg.context) {
        clearTimeout(timeout);
        browserWs.removeListener("message", handler);
        handleInterview(browserWs, msg.context as InterviewContext);
      }
    } catch { /* not JSON */ }
  };
  browserWs.on("message", handler);
});

// ── Mic test (STT only) ───────────────────────────────────────────────────

async function handleMicTest(browserWs: WebSocket, language: string) {
  const sttCode = getGoogleSttCode(language);
  log.info(`Mic test mode (Google STT, ${sttCode})`);

  let done = false;
  let sttStream: any = null;

  const autoTimeout = setTimeout(() => {
    if (browserWs.readyState === WebSocket.OPEN)
      browserWs.send(JSON.stringify({ type: "timeout" }));
    cleanup();
  }, 20_000);

  function cleanup() {
    done = true;
    clearTimeout(autoTimeout);
    if (sttStream) {
      sttStream.destroy();
      sttStream = null;
    }
  }

  try {
    const request = {
      config: {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 16000,
        languageCode: sttCode,
      },
      interimResults: true,
    };

    sttStream = speechClient
      .streamingRecognize(request)
      .on('error', (err: Error) => {
        log.error("Mic test Google STT stream error:", err.message);
      })
      .on('data', (data: any) => {
        const result = data.results[0];
        if (!result || !result.alternatives || !result.alternatives[0]) return;
        
        const transcript = result.alternatives[0].transcript || "";
        if (!transcript.trim()) return;

        if (browserWs.readyState === WebSocket.OPEN) {
          browserWs.send(JSON.stringify({ type: "asr", data: { results: [{ text: transcript }] } }));
          if (result.isFinal) {
            browserWs.send(JSON.stringify({ type: "asr_ended", text: transcript }));
          }
        }
      })
      .on('close', () => {
        log.info("Mic test Google STT stream closed");
        cleanup();
      });

    log.info("Mic test: Connected to Google STT stream");
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "ready" }));
    }

    browserWs.on("message", (data) => {
      if (done || !sttStream) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "audio" && msg.data) {
          const rawBuffer = Buffer.from(msg.data, "hex");
          sttStream.write(rawBuffer);
        }
      } catch { /* ignore */ }
    });

    browserWs.on("close", cleanup);
  } catch (err) {
    log.error("Mic test failed:", err);
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "error", message: `Mic test failed: ${err instanceof Error ? err.message : String(err)}` }));
    }
    browserWs.close();
    cleanup();
  }
}

// ── Interview handler ─────────────────────────────────────────────────────

async function handleInterview(browserWs: WebSocket, ctx: InterviewContext) {
  log.info(`Starting interview with AI Name: "${ctx.aiName}" (${getLlmLanguageName(ctx.language)})`);
  const sortedQuestions = [...ctx.questions].sort((a, b) => a.order - b.order);
  const interviewLanguage = getLlmLanguageName(ctx.language);
  let currentQuestionIndex = ctx.startQuestionIndex ?? 0;
  let interviewDone = false;
  let browserClosed = false;

  // Conversation history for the LLM
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(ctx, currentQuestionIndex, 0) },
  ];

  // Contextual updates (code, whiteboard)
  let latestCode = "";
  let latestCodeLanguage = "plaintext";
  let accumulatedPromptTokens = 0;
  let accumulatedCompletionTokens = 0;
  let turnDebounceTimer: NodeJS.Timeout | null = null;
  let accumulatedUserText = "";
  let sttStream: any = null;

  // TTS state
  let ttsAbortController: AbortController | null = null;
  let isSpeaking = false;
  let ttsQueue: string[] = [];
  let ttsQueueProcessing = false;
  let ttsQueueDrain: Promise<void> = Promise.resolve();
  let lastEnqueuedSpeech = "";

  async function processTtsQueue(): Promise<void> {
    if (ttsQueueProcessing) return ttsQueueDrain;
    ttsQueueProcessing = true;
    ttsQueueDrain = (async () => {
      try {
        while (ttsQueue.length > 0 && !interviewDone && !browserClosed) {
          const sentence = ttsQueue.shift();
          if (sentence?.trim()) {
            try {
              await speakText(sentence);
            } catch (err) {
              const isAbort =
                err instanceof Error &&
                (err.name === "AbortError" ||
                  err.message.toLowerCase().includes("abort"));
              if (!isAbort) {
                log.warn("TTS speak error:", err);
              }
            }
          }
        }
      } finally {
        ttsQueueProcessing = false;
      }
    })();
    return ttsQueueDrain;
  }

  async function waitForTtsDrain(): Promise<void> {
    await processTtsQueue();
    await ttsQueueDrain;
  }

  function enqueueSpeech(text: string, opts?: { force?: boolean }) {
    if (!text.trim() || interviewDone || browserClosed) return;
    if (opts?.force) {
      lastEnqueuedSpeech = `${lastEnqueuedSpeech} ${text.trim()}`.trim();
      ttsQueue.push(text.trim());
    } else {
      enqueueSpeechIfNew(text, lastEnqueuedSpeech, (t) => {
        lastEnqueuedSpeech = `${lastEnqueuedSpeech} ${t}`.trim();
        ttsQueue.push(t);
      });
    }
    void processTtsQueue();
  }

  // STT stream management
  let sttRestartTimer: ReturnType<typeof setTimeout> | null = null;
  let sttKeepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let lastAudioSentAt = 0;
  let llmInFlight = false;
  let llmAbortController: AbortController | null = null;
  let lastUserMessageIndex = -1;
  let draftLlmController: AbortController | null = null;
  let draftTextBuffer = "";
  let draftAudioBuffer: Buffer[] = [];
  let draftQuery = "";
  let draftQuestionIndex = -1;
  let isDrafting = false;
  let completedDraftMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam | null = null;
  let completedDraftToolCallMsg: OpenAI.Chat.Completions.ChatCompletionToolMessageParam | null = null;

  function cancelDraft(reason: string) {
    if (!isDrafting && !draftQuery && draftTextBuffer.length === 0 && draftAudioBuffer.length === 0) {
      return;
    }
    log.info(`Canceling draft: ${reason}`);
    if (isDrafting && llmInFlight) {
      llmAbortController?.abort();
      llmAbortController = null;
      llmInFlight = false;
    }
    isDrafting = false;
    draftQuery = "";
    draftQuestionIndex = -1;
    draftTextBuffer = "";
    draftAudioBuffer = [];
    completedDraftMsg = null;
    completedDraftToolCallMsg = null;
  }

  let endOfTurnTimer: NodeJS.Timeout | null = null;
  let pendingFinalText = "";
  let latestInterimText = "";
  let lastUserUtterance = "";
  /** Set for the duration of an LLM turn that answered a candidate clarification. */
  let clarificationTurn = false;
  let commitFlushInFlight = false;
  const maxFollowUps = getMaxFollowUps(ctx.followUpDepth);
  let userTurnsOnCurrentQ = 0;
  const END_OF_TURN_DELAY_MS = 1200;
  // Wait for Google to promote the last interim → final after Submit/Mute.
  const COMMIT_FLUSH_TIMEOUT_MS = 1100;
  // 10ms silence frames @ 16kHz 16-bit mono — ~400ms encourages isFinal.
  const COMMIT_SILENCE_FRAMES = 40;
  // 160 bytes = 10ms of silence at 16kHz 16-bit mono (keeps Google STT stream alive)
  const SILENCE_FRAME = Buffer.alloc(160, 0);

  function isSttStreamWritable(): boolean {
    if (!sttStream) return false;
    const stream = sttStream as { destroyed?: boolean; writableEnded?: boolean };
    return !stream.destroyed && !stream.writableEnded;
  }

  function writeSttAudio(pcm: Buffer): boolean {
    if (!isSttStreamWritable()) return false;
    try {
      (sttStream as { write: (chunk: Buffer) => boolean }).write(pcm);
      return true;
    } catch {
      return false;
    }
  }

  function send(obj: unknown) {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify(obj));
    }
  }

  function sendBinary(buf: Buffer) {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(buf);
    }
  }

  function applyQuestionChange(newIndex: number, auto: boolean): boolean {
    // INVARIANT: never emit question_change in the same turn as a detected clarification.
    if (clarificationTurn && newIndex !== currentQuestionIndex) {
      log.info(
        `INVARIANT blocked question_change during clarification turn ` +
          `(wanted Q${newIndex + 1}, staying on Q${currentQuestionIndex + 1}; ` +
          `user="${lastUserUtterance.slice(0, 80)}")`,
      );
      return false;
    }
    cancelDraft("question transition");
    const total = sortedQuestions.length;
    const direction = newIndex > currentQuestionIndex ? "next" : "previous";
    const prevQ = sortedQuestions[currentQuestionIndex];
    if (prevQ?.id && newIndex !== currentQuestionIndex) {
      if (!ctx.questionsAsked) ctx.questionsAsked = [];
      if (!ctx.questionsAsked.includes(prevQ.id)) {
        ctx.questionsAsked.push(prevQ.id);
      }
    }
    send({ type: "transitioning", direction, auto });
    currentQuestionIndex = newIndex;
    userTurnsOnCurrentQ = 0;
    clarificationTurn = false;
    // Clear any STT text buffered for the previous question so it cannot bleed
    // into the new question's turn (prevents spurious immediate Q2→Q3 skip).
    if (endOfTurnTimer) { clearTimeout(endOfTurnTimer); endOfTurnTimer = null; }
    pendingFinalText = "";
    latestInterimText = "";
    accumulatedUserText = "";
    messages[0] = { role: "system", content: buildSystemPrompt(ctx, currentQuestionIndex, userTurnsOnCurrentQ) };
    send({
      type: "question_change",
      questionIndex: newIndex,
      totalQuestions: total,
      auto,
    });
    log.info(`Question transition → ${newIndex + 1}/${total} (auto=${auto})`);
    return true;
  }

  /** After a clarification reply, ensure the CURRENT bank question is spoken. */
  function ensureClarificationRestatesCurrentQuestion(spoken: string): string {
    const cur = sortedQuestions[currentQuestionIndex];
    const exact = cur?.text?.trim() || "";
    if (!exact) return spoken;
    if (normalizeSpeech(spoken).includes(normalizeSpeech(exact))) return spoken;
    log.info(
      `Clarification reply missing current question — forcing restatement of Q${currentQuestionIndex + 1}`,
    );
    if (isSpeaking || ttsQueue.length > 0) {
      interruptTts();
    }
    const verbatim = buildClarificationRestateSpeech(cur, ctx.language, !!ctx.isVoiceOnly);
    enqueueSpeech(verbatim, { force: true });
    return verbatim;
  }

  function stopStt(options?: { clearTranscriptBuffer?: boolean }) {
    if (endOfTurnTimer) { clearTimeout(endOfTurnTimer); endOfTurnTimer = null; }
    // Default: preserve buffered finals across stream restarts so a mid-turn
    // Google timeout/reconnect does not wipe the unmute→mute answer.
    if (options?.clearTranscriptBuffer) {
      pendingFinalText = "";
      latestInterimText = "";
    }
    if (sttRestartTimer) { clearTimeout(sttRestartTimer); sttRestartTimer = null; }
    if (sttKeepaliveTimer) { clearInterval(sttKeepaliveTimer); sttKeepaliveTimer = null; }
    if (sttStream) {
      try {
        sttStream.destroy();
      } catch (e) {}
    }
    sttStream = null;
  }

  /**
   * After Submit/Mute, feed silence and wait briefly so Google can emit isFinal
   * for audio already sent (otherwise commit only sees a short interim like "No,").
   */
  async function flushPendingStt(timeoutMs = COMMIT_FLUSH_TIMEOUT_MS): Promise<void> {
    for (let i = 0; i < COMMIT_SILENCE_FRAMES; i++) {
      if (!writeSttAudio(SILENCE_FRAME)) break;
    }
    lastAudioSentAt = Date.now();

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!latestInterimText.trim()) return;
      await new Promise((r) => setTimeout(r, 40));
    }
    log.info(
      `STT flush timeout after ${timeoutMs}ms — committing with interim still pending: "${latestInterimText.slice(0, 80)}"`
    );
  }

  function collectCommittedText(): string {
    let committed = pendingFinalText.trim();
    if (latestInterimText.trim()) {
      committed += (committed ? " " : "") + latestInterimText.trim();
    }
    pendingFinalText = "";
    latestInterimText = "";
    return committed.replace(/\s+/g, " ").trim();
  }

  function startStt() {
    // Keep pendingFinalText across restarts; only commit_turn clears it.
    stopStt({ clearTranscriptBuffer: false });
    if (interviewDone || browserClosed) return;

    const languageCode = getGoogleSttCode(ctx.language);
    log.info(`Connecting to Google STT stream (${languageCode})...`);

    function triggerOrUpdateDraft() {
      if (endOfTurnTimer) clearTimeout(endOfTurnTimer);
      endOfTurnTimer = setTimeout(() => {
        endOfTurnTimer = null;
        if (interviewDone || browserClosed) return;

        const currentUserText =
          (pendingFinalText ? pendingFinalText + " " : "") + latestInterimText;
        const textToUse = currentUserText.trim();
        if (!textToUse) return;

        log.info(
          `End-of-turn silence (${END_OF_TURN_DELAY_MS}ms) — waiting for manual commit: "${textToUse.slice(0, 80)}${textToUse.length > 80 ? "..." : ""}"`
        );

        // STT-only (pregen / Vidu): never draft LLM replies on silence.
        if (ctx.skipLlm) return;

        // Pre-generate drafts only when follow-ups are enabled.
        if (maxFollowUps === 0) return;

        // Push-to-talk UI commits via commit_turn only. Pre-generate a draft after
        // silence so Submit Response stays fast without speaking over the candidate.
        if (!llmInFlight) {
          const currentDraftLen = isDrafting ? draftQuery.length : 0;
          if (!isDrafting || textToUse.length >= currentDraftLen + 15) {
            void startTurn(textToUse, true);
          }
        } else if (isDrafting && llmInFlight) {
          const currentDraftLen = draftQuery.length;
          if (textToUse.length >= currentDraftLen + 15) {
            llmAbortController?.abort();
            llmAbortController = null;
            llmInFlight = false;
            void startTurn(textToUse, true);
          }
        }
      }, END_OF_TURN_DELAY_MS);
    }

    const request = {
      config: {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 16000,
        languageCode: languageCode,
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
    };

    const stream = speechClient
      .streamingRecognize(request)
      .on('error', (err: Error) => {
        if (err.message.includes("Total timeout") || err.message.includes("Exceeded maximum allowed stream duration")) {
           log.info("Google STT stream timeout, will restart.");
        } else {
           log.warn("Google STT stream error:", err.message);
        }
      })
      .on('data', (data: any) => {
        const result = data.results[0];
        if (!result || !result.alternatives || !result.alternatives[0]) return;
        
        const transcript: string = result.alternatives[0].transcript || "";
        if (!transcript.trim()) return;

        const isFinal = result.isFinal;
        if (isFinal) {
          const text = transcript.trim();
          if (isSpeaking) interruptTts();
          if (turnDebounceTimer) clearTimeout(turnDebounceTimer);

          pendingFinalText += (pendingFinalText ? " " : "") + text;
          latestInterimText = "";
          log.info(`STT final (buffered) [Google]: "${pendingFinalText}"`);
          // Push accumulated turn text so UI/client keep one growing answer across pauses.
          send({ type: "asr", data: { results: [{ text: pendingFinalText }] } });

          triggerOrUpdateDraft();
        } else {
          latestInterimText = transcript.trim();

          if (transcript.trim().length > 5 && isSpeaking) {
            interruptTts();
          }

          const live =
            (pendingFinalText ? pendingFinalText + " " : "") + transcript.trim();
          send({ type: "asr", data: { results: [{ text: live.trim() }] } });
        }
      })
      .on('close', () => {
        if (!interviewDone && !browserClosed && sttStream === stream) {
          sttStream = null;
          if (sttRestartTimer) clearTimeout(sttRestartTimer);
          sttRestartTimer = setTimeout(startStt, 1000);
        }
      });

    sttStream = stream as any;
    lastAudioSentAt = Date.now();
    log.info(`Connected to Google STT stream (${languageCode})`);

    sttKeepaliveTimer = setInterval(() => {
      if (!isSttStreamWritable() || interviewDone || browserClosed) return;
      if (Date.now() - lastAudioSentAt > 4000) {
        writeSttAudio(SILENCE_FRAME);
        lastAudioSentAt = Date.now();
      }
    }, 4000);
  }

  async function speakText(text: string): Promise<void> {
    if (!text.trim() || interviewDone || browserClosed) return;
    
    const ttsStart = Date.now();
    let firstTtsChunkAt = 0;

    if (isDrafting) {
      log.info(`AI Drafting Audio: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`);
    } else {
      log.info(`AI Speaking: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`);
      isSpeaking = true;
    }

    const abort = new AbortController();
    ttsAbortController = abort;

    try {
      await synthesizeSpeechStreaming(
        text,
        ctx.language,
        (chunk) => {
          if (abort.signal.aborted || browserClosed) return;
          if (!firstTtsChunkAt) {
            firstTtsChunkAt = Date.now();
            log.info(`TTS first chunk generated in ${firstTtsChunkAt - ttsStart}ms`);
          }
          if (isDrafting) {
            draftAudioBuffer.push(chunk);
          } else {
            isSpeaking = true; 
            sendBinary(chunk);  
          }
        },
        abort.signal
      );
      log.info(`TTS synthesis complete in ${Date.now() - ttsStart}ms for text: "${text.slice(0, 40)}..."`);
    } finally {
      if (ttsAbortController === abort) ttsAbortController = null;
      isSpeaking = false;
    }
  }

  function interruptTts(sendToBrowser: boolean = true) {
    ttsQueue = [];
    if (ttsAbortController) {
      ttsAbortController.abort();
      ttsAbortController = null;
    }
    isSpeaking = false;
    if (sendToBrowser) {
      send({ type: "interrupt" });
    }
  }

  async function startTurn(
    userText?: string,
    isDraft: boolean = false,
    opts?: { asrAlreadySent?: boolean },
  ) {
    if (interviewDone || browserClosed) return;
    // Pregenerated / Vidu own speech — never run Gemini TTS/replies.
    if (ctx.skipLlm) {
      log.info(`skipLlm=true — ignoring startTurn (draft=${isDraft})`);
      return;
    }

    if (llmInFlight && llmAbortController) {
      log.info(`Aborting ${isDrafting ? "draft" : "active"} turn...`);
      llmAbortController.abort();
      llmAbortController = null;
      llmInFlight = false;
      
      if (!isDrafting && messages.length > 0 && messages[messages.length - 1].role === "assistant") {
        messages.pop();
      }
    }

    if (isDrafting) {
      log.info("Aborting and clearing previous draft TTS queue and synthesis...");
      interruptTts(false); 
    }

    if (!isDraft && isSpeaking) interruptTts(true);

    // Restart STT when a real turn commits. This flushes any old audio
    // buffered in Google's cloud so it doesn't fire a delayed isFinal event
    // that accidentally answers the NEXT question with old speech.
    if (!isDraft) {
      startStt();
    }

    llmInFlight = true;
    isDrafting = isDraft;
    llmAbortController = new AbortController();

    // Keep system prompt in sync with current turn count so the LLM knows
    // when it has exhausted its follow-up budget for the current question.
    if (!isDraft) {
      messages[0] = { role: "system", content: buildSystemPrompt(ctx, currentQuestionIndex, userTurnsOnCurrentQ) };
    }
    
    if (isDraft) {
      draftQuery = userText || "";
      draftQuestionIndex = currentQuestionIndex;
      draftTextBuffer = "";
      draftAudioBuffer = [];
      completedDraftMsg = null;
      completedDraftToolCallMsg = null;
    }

    let messagesToUse = messages;

    if (userText) {
      if (!isDraft) {
        log.info(`LLM Turn started for: "${userText}"`);
        if (!opts?.asrAlreadySent) {
          send({ type: "asr_ended", text: userText });
        }

        if (lastUserMessageIndex !== -1 && lastUserMessageIndex === messages.length - 1) {
          const prevContent = messages[lastUserMessageIndex].content as string;
          messages[lastUserMessageIndex].content = `${prevContent} ${userText}`;
          log.info(`Merged with previous user message. New content: "${messages[lastUserMessageIndex].content}"`);
        } else {
          let userContent = userText;
          if (latestCode) {
            userContent += `\n\n[CODE_UPDATE language=${latestCodeLanguage}]\n${latestCode}`;
          }
          messages.push({ role: "user", content: userContent });
          lastUserMessageIndex = messages.length - 1;
        }
        messagesToUse = messages;
      } else {
        log.info(`LLM Draft Turn started for: "${userText}"`);
        messagesToUse = [...messages];
        if (lastUserMessageIndex !== -1 && lastUserMessageIndex === messages.length - 1) {
          const prevContent = messages[lastUserMessageIndex].content as string;
          messagesToUse[lastUserMessageIndex] = { role: "user", content: `${prevContent} ${userText}` };
        } else {
          let userContent = userText;
          if (latestCode) {
            userContent += `\n\n[CODE_UPDATE language=${latestCodeLanguage}]\n${latestCode}`;
          }
          messagesToUse.push({ role: "user", content: userContent });
        }
      }
    }

    const turnStart = Date.now();
    log.info(`Sending LLM request with ${messagesToUse.length} messages...`);

    try {
      let firstChunkAt = 0;
      const stream = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: messagesToUse,
        tools: isDrafting ? undefined : TOOLS,
        tool_choice: isDrafting ? undefined : "auto",
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: 1024,
      }, { signal: llmAbortController.signal });

      let fullText = "";
      let sentenceBuffer = "";
      let toolCallId = "";
      let toolCallName = "";
      let toolCallArgs = "";
      let finishReason = "";

      for await (const chunk of stream) {
        if (browserClosed) break;
        const delta = chunk.choices[0]?.delta;
        finishReason = chunk.choices[0]?.finish_reason || finishReason;

        if (delta?.content) {
          if (!firstChunkAt) {
            firstChunkAt = Date.now();
            log.info(`${isDrafting ? "Draft" : "Active"} LLM first chunk arrived in ${firstChunkAt - turnStart}ms`);
          }
          fullText += delta.content;
          sentenceBuffer += delta.content;

          if (isDrafting) {
            draftTextBuffer += delta.content;
          } else {
            send({ type: "tts_text", data: { text: delta.content } });
          }

          const isFirstSentence = fullText.length < 100; 
          const { complete, remainder } = extractSentences(sentenceBuffer, isFirstSentence);
          sentenceBuffer = remainder;
          for (const sentence of complete) {
            if (sentence.trim()) {
              enqueueSpeech(sentence);
            }
          }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.id) toolCallId = tc.id;
            if (tc.function?.name) toolCallName = tc.function.name;
            if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
          }
        }

        if (chunk.usage) {
          const { prompt_tokens, completion_tokens } = chunk.usage;
          const total_tokens = prompt_tokens + completion_tokens;
          log.info(`[${isDrafting ? "Draft Turn" : "Active Turn"}] Token usage for this turn: Prompt: ${prompt_tokens}, Completion: ${completion_tokens}, Total: ${total_tokens}`);
          accumulatedPromptTokens += prompt_tokens;
          accumulatedCompletionTokens += completion_tokens;
          log.info(`[Session Accumulated] Prompt: ${accumulatedPromptTokens}, Completion: ${accumulatedCompletionTokens}, Total: ${accumulatedPromptTokens + accumulatedCompletionTokens}`);
        }
      }

      if (sentenceBuffer.trim()) {
        enqueueSpeech(sentenceBuffer);
      }

      let transitionApplied = false;
      const turnIsClarification =
        clarificationTurn || isCandidateClarificationUtterance(lastUserUtterance);

      if (toolCallName === "signal_question_change" && toolCallArgs) {
        try {
          const args = JSON.parse(toolCallArgs) as { questionIndex: number; userRequested?: boolean; speech?: string };
          const newIndex = args.questionIndex;
          const total = sortedQuestions.length;
          const toolSpeech = args.speech?.trim() || "";
          const isActualTransition = newIndex !== currentQuestionIndex;

          // Hard block: never honor signal_question_change on clarification turns,
          // even if the model sets userRequested=true (repeat ≠ skip).
          if (isActualTransition && turnIsClarification) {
            log.info(
              `Blocked clarification signal_question_change ` +
                `(userRequested=${!!args.userRequested}). ` +
                `user="${lastUserUtterance.slice(0, 80)}" staying on Q${currentQuestionIndex + 1}`,
            );
            // Drop any transition speech that may already be queued; restate current Q.
            fullText = ensureClarificationRestatesCurrentQuestion(fullText || toolSpeech);
          } else if (newIndex >= total) {
            log.info("Interview complete");
            enqueueSpeechIfNew(toolSpeech, fullText, enqueueSpeech);
            setTimeout(() => {
              if (!browserClosed) {
                send({ type: "interview_complete", tokenUsage: { promptTokens: accumulatedPromptTokens, completionTokens: accumulatedCompletionTokens, totalTokens: accumulatedPromptTokens + accumulatedCompletionTokens } });
                interviewDone = true;
              }
            }, 3000);
          } else if (isActualTransition) {
            const nextQ = sortedQuestions[newIndex];
            const exact = nextQ?.text?.trim() || "";
            const verbatim = buildVerbatimQuestionSpeech(
              toolSpeech || fullText,
              nextQ,
              !!ctx.isVoiceOnly,
            );
            const alreadyExact =
              !!exact &&
              normalizeSpeech(fullText).includes(normalizeSpeech(exact));
            // If the streamed reply paraphrased the next question, cut it and speak verbatim.
            if (exact && !alreadyExact) {
              interruptTts();
              enqueueSpeech(verbatim);
            } else {
              enqueueSpeechIfNew(toolSpeech, fullText, enqueueSpeech);
            }
            if (applyQuestionChange(newIndex, !args.userRequested)) {
              transitionApplied = true;
            } else {
              fullText = ensureClarificationRestatesCurrentQuestion(fullText || toolSpeech);
            }
          }
        } catch (e) {
          log.error("Failed to parse tool call args:", e);
        }
      }

      if (
        !isDrafting &&
        !transitionApplied &&
        maxFollowUps === 0 &&
        userTurnsOnCurrentQ >= 1 &&
        // Never force-advance on clarifications or non-substantive turns (unless voice-only).
        !turnIsClarification &&
        (isSubstantiveInterviewAnswer(lastUserUtterance) || ctx.isVoiceOnly)
      ) {
        const nextIdx = currentQuestionIndex + 1;
        if (nextIdx < sortedQuestions.length) {
          log.info(
            `Zero follow-up policy: forcing transition after answer ` +
              `(userTurns=${userTurnsOnCurrentQ}, user="${lastUserUtterance.slice(0, 60)}")`,
          );
          const nextQ = sortedQuestions[nextIdx];
          const exact = nextQ?.text?.trim() || "";
          const alreadyExact =
            !!exact &&
            normalizeSpeech(fullText).includes(normalizeSpeech(exact));
          if (exact && !alreadyExact) {
            interruptTts();
            enqueueSpeech(
              buildVerbatimQuestionSpeech(fullText, nextQ, !!ctx.isVoiceOnly),
            );
          }
          if (applyQuestionChange(nextIdx, true)) {
            transitionApplied = true;
          }
        }
      }

      // Clarification turn: stay on current Q and always restate it if missing.
      if (!isDrafting && turnIsClarification && !transitionApplied) {
        fullText = ensureClarificationRestatesCurrentQuestion(fullText);
      }

      // If the model re-asked the current question with a paraphrase, replace with verbatim.
      if (!isDrafting && !transitionApplied && !turnIsClarification && fullText.trim()) {
        const cur = sortedQuestions[currentQuestionIndex];
        const exact = cur?.text?.trim() || "";
        const isCodeOrBoard = cur?.type === "CODING" || cur?.type === "WHITEBOARD";
        if (
          exact &&
          (ctx.isVoiceOnly || (!isCodeOrBoard && /[?？]/.test(fullText))) &&
          !normalizeSpeech(fullText).includes(normalizeSpeech(exact))
        ) {
          log.info("Replacing paraphrased re-ask with verbatim on-screen question");
          interruptTts();
          const verbatim = buildVerbatimQuestionSpeech(fullText, cur, !!ctx.isVoiceOnly);
          enqueueSpeech(verbatim);
          fullText = verbatim;
        }
      }

      if (fullText || toolCallName) {
        const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: fullText || null,
        };
        if (toolCallName) {
          assistantMsg.tool_calls = [
            {
              id: toolCallId,
              type: "function",
              function: { name: toolCallName, arguments: toolCallArgs },
            },
          ];
        }
        
        if (isDrafting) {
            completedDraftMsg = assistantMsg;
            if (toolCallName) {
                completedDraftToolCallMsg = {
                  role: "tool",
                  tool_call_id: toolCallId,
                  content: JSON.stringify({ success: true }),
                };
            }
        } else {
            messages.push(assistantMsg);
            if (toolCallName) {
              const toolRejected = turnIsClarification && !transitionApplied;
              messages.push({
                role: "tool",
                tool_call_id: toolCallId,
                content: JSON.stringify(
                  toolRejected
                    ? {
                        success: false,
                        rejected: true,
                        reason:
                          "Clarification/repeat request — stay on the current question and restate it. Do not advance.",
                      }
                    : { success: true },
                ),
              });
            }
            if (fullText || transitionApplied) {
              log.info(
                `LLM turn complete. Length: ${fullText.length}, Reason: ${finishReason}, ` +
                  `transition: ${transitionApplied}, clarification: ${turnIsClarification}, ` +
                  `Q${currentQuestionIndex + 1}`,
              );
            }
            // Clarification handling finished for this turn.
            if (turnIsClarification) {
              clarificationTurn = false;
            }
        }
      } else {
        log.warn(`LLM returned empty content. Reason: ${finishReason}`);
        if (!isDrafting) {
          if (turnIsClarification) {
            fullText = ensureClarificationRestatesCurrentQuestion("");
            messages.push({ role: "assistant", content: fullText });
            clarificationTurn = false;
          } else {
            const fallbackText =
              resolveLanguage(ctx.language).code === "zh"
                ? "抱歉，刚才网络连接有些波动。能请您重复一下刚才的回答吗？"
                : "I'm sorry, I had a brief connection glitch. Could you please repeat your answer?";
            enqueueSpeech(fallbackText);
            messages.push({ role: "assistant", content: fallbackText });
          }
        }
      }

      if (!isDrafting) {
        await waitForTtsDrain();
        send({ type: "tts_ended" });
      }

      if (!fullText && toolCallName) {
        const hasSpeechInArgs = toolCallArgs?.includes('"speech"');
        if (!hasSpeechInArgs) {
          log.info(`Tool called without speech field, re-triggering LLM turn...`);
          llmInFlight = false;
          return startTurn(undefined, isDrafting);
        }
        log.info(`Tool-only turn handled — transition speech enqueued if needed.`);
      }
    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
      if (isAbort) {
        log.debug("LLM turn aborted/cancelled silently.");
      } else {
        log.error("LLM error:", err);
        send({ type: "error", message: `AI error: ${err instanceof Error ? err.message : String(err)}` });
      }
    } finally {
      llmInFlight = false;
    }
  }

  async function promoteDraft(finalText: string) {
    if (!isDrafting) return;

    if (draftQuestionIndex !== -1 && draftQuestionIndex !== currentQuestionIndex) {
      log.info(
        `Draft stale (Q${draftQuestionIndex + 1} vs current Q${currentQuestionIndex + 1}). Discarding.`
      );
      cancelDraft("question index changed");
      void startTurn(finalText, false);
      return;
    }
    
    log.info(`Draft promoted! Flushing ${draftAudioBuffer.length} audio chunks and ${draftTextBuffer.length} chars...`);
    
    isDrafting = false;
    
    messages.push({ role: "user", content: finalText });
    lastUserMessageIndex = messages.length - 1;
    
    let didDraftFinish = false;
    if (completedDraftMsg) {
        didDraftFinish = true;
        messages.push(completedDraftMsg);
        if (completedDraftToolCallMsg) messages.push(completedDraftToolCallMsg);
        completedDraftMsg = null;
        completedDraftToolCallMsg = null;
    }
    
    send({ type: "tts_text", data: { text: draftTextBuffer } });
    
    if (draftAudioBuffer.length > 0) {
      isSpeaking = true;
      for (const chunk of draftAudioBuffer) {
        sendBinary(chunk);
      }
    }
    
    draftTextBuffer = "";
    draftAudioBuffer = [];

    if (didDraftFinish) {
        send({ type: "tts_ended" });
    }
  }

  // ── Send opening greeting (verbatim first question — matches on-screen text) ──
  function getGreetingIntro(): string {
    return "";
  }

  async function sendGreeting() {
    // Deterministic greeting so spoken text matches the on-screen question word-for-word.
    // (LLM free-form greetings were paraphrasing Q1 — see session 9adec192.)
    log.info(`Sending verbatim greeting (isVoiceOnly=${!!ctx.isVoiceOnly})...`);
    llmInFlight = true;
    try {
      const q = sortedQuestions[Math.max(0, currentQuestionIndex)] ?? sortedQuestions[0];
      const exact = q?.text?.trim() || "";
      const spoken = ctx.isVoiceOnly
        ? exact
        : buildVerbatimQuestionSpeech(getGreetingIntro(), q, false);

      if (!spoken) {
        const fallbackGreeting = getFallbackGreeting(ctx.language, interviewLanguage);
        send({ type: "tts_text", data: { text: fallbackGreeting } });
        enqueueSpeech(fallbackGreeting);
        messages.push({ role: "assistant", content: fallbackGreeting });
      } else {
        send({ type: "tts_text", data: { text: spoken } });
        enqueueSpeech(spoken);
        messages.push({ role: "assistant", content: spoken });
      }
      send({ type: "tts_ended" });
    } finally {
      llmInFlight = false;
    }
  }

  // ── Browser message handler ────────────────────────────────────────────
  browserWs.on("message", (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case "audio": {
          if (!msg.data || interviewDone) return;
          const pcm = Buffer.from(msg.data, "hex");

          if (!isSttStreamWritable()) {
            log.info("Audio received, starting STT stream...");
            startStt();
          }

          if (writeSttAudio(pcm)) {
            lastAudioSentAt = Date.now();
          }
          break;
        }

        case "code_update": {
          latestCode = msg.content || "";
          latestCodeLanguage = msg.language || "plaintext";
          log.debug(`Code update: ${latestCode.length} chars (${latestCodeLanguage})`);
          break;
        }

        case "whiteboard_update":
          // Whiteboard images noted (vision not supported in this relay)
          log.debug("Whiteboard update received");
          break;

        case "force_next":
        case "next_question": {
          const nextIdx = Math.min(currentQuestionIndex + 1, sortedQuestions.length);
          interruptTts();
          if (nextIdx >= sortedQuestions.length) {
            send({ type: "interview_complete", tokenUsage: { promptTokens: accumulatedPromptTokens, completionTokens: accumulatedCompletionTokens, totalTokens: accumulatedPromptTokens + accumulatedCompletionTokens } });
            interviewDone = true;
          } else if (applyQuestionChange(nextIdx, false)) {
            // Speak the next question verbatim — bypass the LLM entirely.
            // Using startTurn() here confuses the LLM because the question index
            // is already advanced and it calls the advance_question tool again
            // instead of speaking, resulting in silence.
            void (async () => {
              llmInFlight = true;
              try {
                const nextQ = sortedQuestions[nextIdx];
                const spoken = buildVerbatimQuestionSpeech("", nextQ, !!ctx.isVoiceOnly);
                if (spoken) {
                  startStt();
                  send({ type: "tts_text", data: { text: spoken } });
                  enqueueSpeech(spoken, { force: true });
                  messages.push({ role: "assistant", content: spoken });
                  await waitForTtsDrain();
                  send({ type: "tts_ended" });
                }
              } finally {
                llmInFlight = false;
              }
            })();
          }
          break;
        }

        case "force_prev":
        case "prev_question": {
          const prevIdx = Math.max(currentQuestionIndex - 1, 0);
          interruptTts();
          if (applyQuestionChange(prevIdx, false)) {
            // Same: speak the previous question verbatim without going through LLM.
            void (async () => {
              llmInFlight = true;
              try {
                const prevQ = sortedQuestions[prevIdx];
                const spoken = buildVerbatimQuestionSpeech("", prevQ, !!ctx.isVoiceOnly);
                if (spoken) {
                  startStt();
                  send({ type: "tts_text", data: { text: spoken } });
                  enqueueSpeech(spoken, { force: true });
                  messages.push({ role: "assistant", content: spoken });
                  await waitForTtsDrain();
                  send({ type: "tts_ended" });
                }
              } finally {
                llmInFlight = false;
              }
            })();
          }
          break;
        }

        case "commit_turn": {
          void (async () => {
            if (commitFlushInFlight) {
              log.info("commit_turn ignored — flush already in progress");
              return;
            }
            commitFlushInFlight = true;
            try {
              log.info("Manual turn commit received via Send button!");
              if (endOfTurnTimer) {
                clearTimeout(endOfTurnTimer);
                endOfTurnTimer = null;
              }

              // Drain Google ASR so the last spoken audio becomes isFinal before we snapshot.
              await flushPendingStt();

              const committed = collectCommittedText();

              if (!committed && !isDrafting) {
                // Always ack skipLlm commits so the client waiter can unblock.
                if (ctx.skipLlm) {
                  send({ type: "asr_ended", text: "" });
                }
                return;
              }

              log.info(`End-of-turn committed manually: "${committed}"`);
              lastUserUtterance = committed;
              const isClarification =
                !!committed && isCandidateClarificationUtterance(committed);
              const isSubstantive =
                !!committed && isSubstantiveInterviewAnswer(committed);
              clarificationTurn = isClarification;
              // Only substantive answers count toward the follow-up / force-advance budget.
              // In voice-only mode, ANY non-clarification answer counts to force advance.
              if (isSubstantive || (ctx.isVoiceOnly && !isClarification)) {
                userTurnsOnCurrentQ++;
              }
              log.info(
                `Turn classify: clarification=${isClarification} substantive=${isSubstantive} ` +
                  `userTurnsOnCurrentQ=${userTurnsOnCurrentQ} Q${currentQuestionIndex + 1}`,
              );

              // Ack committed text immediately so the client can set clarification
              // guards before any async LLM work emits question_change (Q1 race fix).
              if (committed) {
                send({ type: "asr_ended", text: committed });
              }

              // Vidu Premium / pregenerated: Gemini STT only — no LLM reply.
              if (ctx.skipLlm) {
                if (committed) messages.push({ role: "user", content: committed });
                // Fresh stream for the next unmute (avoids delayed finals bleeding over).
                startStt();
                return;
              }

              // Candidate clarifications (repeat / clarify / audio check):
              // skip the LLM and speak the bank question directly so the candidate
              // always hears the full question on the first attempt.
              if (isClarification) {
                log.info(
                  `Clarification turn — direct restate Q${currentQuestionIndex + 1}: "${committed.slice(0, 80)}"`,
                );
                messages.push({ role: "user", content: committed });
                lastUserMessageIndex = messages.length - 1;

                const speech = buildClarificationRestateSpeech(
                  sortedQuestions[currentQuestionIndex],
                  ctx.language,
                  !!ctx.isVoiceOnly,
                );
                messages.push({ role: "assistant", content: speech });

                send({ type: "tts_text", data: { text: speech } });
                lastEnqueuedSpeech = "";
                enqueueSpeech(speech, { force: true });
                await waitForTtsDrain();
                send({ type: "tts_ended" });
                clarificationTurn = false;
                startStt();
                return;
              }

              if (isDrafting && draftQuery) {
                if (maxFollowUps === 0) {
                  log.info("Follow-ups disabled — discarding draft, starting fresh turn.");
                  cancelDraft("follow-ups disabled");
                  void startTurn(committed, false, { asrAlreadySent: true });
                  return;
                }

                const cLower = committed.toLowerCase();
                const dLower = draftQuery.toLowerCase();

                // The draft is only valid if it was generated for text that covers most of
                // what the user actually said. If the user kept talking after the draft was
                // triggered, the draft query is a small fraction of the committed text and
                // the draft response will be wrong (e.g. asks a follow-up when the user
                // already answered it). Require the draft query to cover ≥60% of the final
                // committed length before promoting.
                const coverageRatio = dLower.length / Math.max(cLower.length, 1);
                const textOverlaps =
                  dLower.includes(cLower) ||                         // draft ⊇ committed
                  cLower.startsWith(dLower.slice(0, 30));            // committed starts with draft

                if (coverageRatio >= 0.6 && textOverlaps) {
                  log.info(`Draft valid (coverage ${(coverageRatio * 100).toFixed(0)}%). Promoting.`);
                  void promoteDraft(committed);
                } else {
                  log.info(`Draft stale (coverage ${(coverageRatio * 100).toFixed(0)}%, draftQ="${draftQuery.slice(0, 60)}"). Discarding, starting fresh turn.`);
                  isDrafting = false;
                  void startTurn(committed, false, { asrAlreadySent: true });
                }
              } else {
                void startTurn(committed, false, { asrAlreadySent: true });
              }
            } finally {
              commitFlushInFlight = false;
            }
          })();
          break;
        }
      }
    } catch { /* not JSON */ }
  });

  browserWs.on("close", () => {
    log.info("Browser disconnected");
    browserClosed = true;
    interruptTts();
    stopStt({ clearTranscriptBuffer: true });
  });

  // ── Start ──────────────────────────────────────────────────────────────
  try {
    send({ type: "ready" });
    // Sync client UI to the server's current question (important for coding /
    // whiteboard split view on first connect and resume).
    send({
      type: "question_change",
      questionIndex: currentQuestionIndex,
      totalQuestions: sortedQuestions.length,
      auto: true,
    });
    if (ctx.skipLlm) {
      log.info("skipLlm=true — STT only; Vidu agent owns greeting and replies");
    } else {
      await sendGreeting();
    }
  } catch (err) {
    log.error("Interview init failed:", err);
    send({ type: "error", message: `Init failed: ${err instanceof Error ? err.message : String(err)}` });
    browserWs.close();
  }
}
