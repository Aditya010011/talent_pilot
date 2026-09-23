/**
 * Low-Latency Deepgram Voice Relay
 *
 * Browser ←→ this relay ←→ Deepgram STT + Gemini Lite Chat + Deepgram TTS
 *
 * LLM stack migrated to Gemini (OpenAI-compat). Azure/OpenAI chat commented out.
 * Usage: npm run deepgram voice (if applicable)
 */

import { config } from "dotenv";
import { WebSocket, WebSocketServer } from "ws";
import OpenAI from "openai";
import { createLogger } from "../src/lib/logger";

config({ path: ".env.local", override: true });
config({ path: ".env" });

const log = createLogger("voice-relay");

// ── Config ──────────────────────────────────────────────────────────────

const RELAY_PORT =
  Number(process.env.GOOGLE_VOICE_RELAY_PORT || process.env.OPENAI_VOICE_RELAY_PORT) || 8082;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";
const LLM_MODEL =
  process.env.GOOGLE_RELAY_LLM_MODEL ||
  process.env.GEMINI_LITE_MODEL ||
  "gemini-3.1-flash-lite";
const TTS_SAMPLE_RATE = 24000;

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

log.info(`Voice relay starting on ws://localhost:${RELAY_PORT}`);
log.info(`LLM: Gemini/${LLM_MODEL} | TTS: Deepgram Aura`);
// if (USE_AZURE) log.info(`Azure endpoint: ${AZURE_ENDPOINT}, deployment: ${AZURE_CHAT_DEPLOYMENT}`);

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
  questions: Array<{
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

function isChineseInterview(ctx: InterviewContext): boolean {
  return ctx.language === "zh" || ctx.language.toLowerCase().includes("chinese");
}

function buildSystemPrompt(ctx: InterviewContext, startIdx: number): string {
  const isZh = isChineseInterview(ctx);
  const sorted = [...ctx.questions].sort((a, b) => a.order - b.order);

  // Hard-coded: follow-ups disabled regardless of interview followUpDepth setting.
  const maxFollowUps = 0;

  const questionList = sorted.map((q, i) => {
    let entry = `  ${i + 1}. [${q.type}] ${q.text}`;
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

  if (isZh) {
    return `你是"${ctx.aiName}"，一位${ctx.aiTone}的AI面试官。

## 面试信息
- 主题: "${ctx.title}"
${ctx.objective ? `- 目标: ${ctx.objective}` : ""}
- 问题数量: ${sorted.length}
- 当前问题: 第${currentQ}个
- 每题追问深度: 不追问（一次实质性回答后立即进入下一题）

## 问题列表
${questionList}

## 行为准则
1. 从第${currentQ}个问题开始，先温暖地自我介绍，再提问。
2. 不要追问。受访者给出一次实质性回答后，立即调用 signal_question_change 进入下一题。
3. 当问题讨论充分后，调用 signal_question_change 进入下一题。
4. 所有问题结束后，调用 signal_question_change 设 questionIndex=${sorted.length}，然后告别。
5. 回复简洁（1-3句话），语气自然友好。${ctx.isVoiceOnly ? "\n**极其重要**: 这是一个非交互式测试，你绝对不能产生任何对话或反应。当轮到你说话时，你只能准确无误地朗读当前题目。受访者回答完毕后，立即调用函数切换并读下一题。" : ""}
6. 对选择题，必须读出所有选项。
7. 对编程/白板题，不要读题，让受访者查看屏幕。

## 重要规则
- 必须通过 signal_question_change 函数切换问题，不要只口头说"进入下一题"。
- 简短问候或模糊回答不算实质性回答，不要切换问题。${ctx.isVoiceOnly ? "但因为这是非交互模式，请极其克制，不要偏离题目。" : ""}
- 始终用中文回复。`;
  }

  return `You are Inluwa, a ${ctx.aiTone} interviewer.
Your name is strictly "Inluwa". When you introduce yourself, you must say: "Hi, I'm Inluwa."
Do not refer to yourself as an "LLM Interviewer" or "AI". 
The topic of the interview might be about LLMs, but that is not your name.
IMPORTANT: Never put spaces between the letters of your name (say INLUWA, not I N L U W A) or acronyms (say LLM, not L LM).


## Interview Details
- Topic: "${ctx.title}"
${ctx.objective ? `- Objective: ${ctx.objective}` : ""}
- Total questions: ${sorted.length}
- Starting at question ${currentQ} of ${sorted.length}
- Follow-up depth: No follow-ups (move to next question after one substantive answer)

## Questions
${questionList}

## Your Behavior
1. You are the user's interviewer for the day. You have ALREADY introduced yourself at the start. Do NOT say "Hi, I'm Inluwa" or introduce yourself again. Just continue the conversation naturally.
2. Do NOT ask follow-up questions. After ONE substantive answer, immediately call signal_question_change to move to the next question.
3. When a question is sufficiently discussed, call the signal_question_change function to move forward.
4. **CRITICAL — ALWAYS fill the "speech" field in signal_question_change.** This is the text you say aloud during the transition. ${ctx.isVoiceOnly ? "Since this is non-interactive mode, the speech field MUST ONLY contain the exact text of the NEXT question, with NO transition phrase or acknowledgement of their answer." : "It must: briefly acknowledge the user's last answer AND introduce the next topic (or farewell if last question). 1-3 sentences. Example: 'That makes total sense... Let's dig into: [next question]'"}
5. After all questions are done, call signal_question_change with questionIndex=${sorted.length} (out of bounds), with a warm farewell in the "speech" field.
6. Keep responses concise (1-3 sentences) and conversational. Use friendly bridges like "Thanks for sharing that" or "That makes sense". ${ctx.isVoiceOnly ? "\n**CRITICAL**: This is a non-interactive interview. You MUST NOT produce any conversational reactions, feedback, or follow-ups. When it is your turn to speak, you must ONLY read the text of the next question exactly as written. Once the participant finishes their answer, do not evaluate it—immediately call the function to switch questions and read the next one." : ""}
7. Avoid formal written structures. Do not use colons, em-dashes, or bullet points in your speech.

## Question Transitions
- NEVER say "Question 1", "Question 2", etc.
- NEVER say "Next question" or "Moving to the next topic".
- ALWAYS transition naturally with phrases like "I'd love to hear your thoughts on...", "Let's shift gears to...", or "Changing tracks slightly..."

## Special Rules for Choice Questions
When asking a SINGLE_CHOICE or MULTIPLE_CHOICE question, you MUST read out ALL the answer options (A, B, C, etc.) as part of asking the question. The participant can only hear you — they cannot see the options unless you say them. After listing the options, ask the participant to choose and explain their reasoning. For multiple-choice questions, remind them they can select more than one option.

## Special Rules for Coding / Whiteboard Questions
When transitioning to a CODING or WHITEBOARD question:
- Do NOT read out the full question text! The question details are already displayed on the participant's screen. Just briefly say it's a coding/whiteboard question and ask them to read the problem on their screen and use the code editor/whiteboard.
- Keep your responses short — let the participant focus on thinking and coding/drawing.
- Categorize the participant's speech and respond accordingly:
  1. Talking TO YOU (asking questions about the problem) → Answer briefly; do NOT invent follow-up interview questions
  2. Saying they're DONE ("I'm done", "finished", "submit") → Briefly acknowledge, then IMMEDIATELY call signal_question_change
  3. Thinking ALOUD (self-talk, "hmm", reading code) → Brief encouragement only (e.g. "Take your time")
  4. Wanting to SKIP ("I can't do this", "skip", "next question") → Brief acknowledgement, then call signal_question_change
  5. Discussion naturally CONCLUDED → Brief acknowledgement, then call signal_question_change
- NEVER ask follow-ups about approach, complexity, or improvements. One answer / submit → next question.

## Language Requirements
- YOU MUST ALWAYS RESPOND IN ENGLISH.
- Speak in natural, complete sentences. Avoid formal "written" structures like "Topic: [Title]" or using colons, em-dashes, and bullet points in your speech. 
- For example, instead of saying "Topic: LLM Screening", say "Today we'll be doing the LLM Screening."
- Conduct this interview entirely in English. Do not switch to any other language under any circumstance.`;
}


// ── Google TTS ────────────────────────────────────────────────────────────

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
  isZh: boolean, 
  onChunk: (buf: Buffer) => void,
  signal?: AbortSignal
): Promise<void> {
  const cleanText = cleanForTts(text.replace(/\[\w+\]/g, "")).trim();
  if (!cleanText) return;

  if (isZh) {
    log.warn(`TTS Warning: Chinese text received but Chinese TTS is currently unsupported in native Deepgram Aura mode: "${cleanText}"`);
    return;
  }

  try {
    const response = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=linear16&sample_rate=24000",
      {
        method: "POST",
        headers: {
          "Authorization": "Token 3305f4267e467ccb44a229333f9b9ecb7600a57c",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: cleanText }),
        signal: signal
      }
    );

    if (!response.ok) {
      throw new Error(`Deepgram TTS failed: ${response.statusText}`);
    }

    const bodyStream = response.body;
    if (!bodyStream) {
      throw new Error("No body in Deepgram response");
    }

    let bytesIgnored = 0;
    let leftoverByte: Buffer | null = null;
    for await (const chunk of bodyStream as any) {
      if (signal?.aborted) break;
      let audioData = Buffer.from(chunk);
      
      // Skip WAV header (first 44 bytes) to ensure pristine raw 16-bit signed PCM
      if (bytesIgnored < 44) {
        const toIgnore = Math.min(44 - bytesIgnored, audioData.length);
        bytesIgnored += toIgnore;
        audioData = audioData.subarray(toIgnore);
      }
      
      if (audioData.length === 0) continue;

      // Prepend leftover byte from previous chunk
      if (leftoverByte !== null) {
        audioData = Buffer.concat([leftoverByte, audioData]);
        leftoverByte = null;
      }

      // If length is odd, save the last byte to keep samples aligned to 2-byte boundaries
      if (audioData.length % 2 !== 0) {
        leftoverByte = audioData.subarray(audioData.length - 1);
        audioData = audioData.subarray(0, audioData.length - 1);
      }

      if (audioData.length === 0) continue;
      const float32 = linear16ToFloat32(audioData);
      onChunk(float32);
    }
  } catch (err) {
    const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
    if (isAbort) {
      log.debug("Deepgram TTS streaming interrupted/aborted.");
      return;
    }
    log.error("Deepgram TTS error:", err);
  }
}

// ── WebSocket server ──────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: RELAY_PORT });

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
        handleMicTest(browserWs);
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

async function handleMicTest(browserWs: WebSocket) {
  log.info("Mic test mode (Deepgram)");
  const deepgramKey = process.env.DEEPGRAM_API_KEY || "3305f4267e467ccb44a229333f9b9ecb7600a57c";
  const deepgramUrl = "wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000";

  let done = false;
  let sttWs: WebSocket | null = null;
  let sttPingTimer: ReturnType<typeof setInterval> | null = null;

  const autoTimeout = setTimeout(() => {
    if (browserWs.readyState === WebSocket.OPEN)
      browserWs.send(JSON.stringify({ type: "timeout" }));
    cleanup();
  }, 20_000);

  function cleanup() {
    done = true;
    clearTimeout(autoTimeout);
    if (sttPingTimer) {
      clearInterval(sttPingTimer);
      sttPingTimer = null;
    }
    sttWs?.close();
    sttWs = null;
  }

  try {
    sttWs = new WebSocket(deepgramUrl, {
      headers: { Authorization: `Token ${deepgramKey}` }
    });

    sttWs.on("open", () => {
      log.info("Mic test: Connected to Deepgram STT stream");
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(JSON.stringify({ type: "ready" }));
      }
    });

    sttWs.on("message", (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type !== "Results") return;
        const result = response.channel?.alternatives?.[0];
        if (!result) return;
        const transcript = result.transcript || "";
        if (!transcript.trim()) return;

        if (browserWs.readyState === WebSocket.OPEN) {
          browserWs.send(JSON.stringify({ type: "asr", data: { results: [{ text: transcript }] } }));
          if (response.is_final) {
            browserWs.send(JSON.stringify({ type: "asr_ended", text: transcript }));
          }
        }
      } catch (err) {
        log.error("Mic test Deepgram parse error:", err);
      }
    });

    sttWs.on("error", (err) => {
      log.error("Mic test Deepgram STT stream error:", err.message);
    });

    sttWs.on("close", () => {
      log.info("Mic test Deepgram STT stream closed");
      cleanup();
    });

    browserWs.on("message", (data) => {
      if (done || !sttWs || sttWs.readyState !== WebSocket.OPEN) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "audio" && msg.data) {
          const rawBuffer = Buffer.from(msg.data, "hex");
          sttWs.send(rawBuffer);
        }
      } catch { /* ignore */ }
    });

    // Deepgram keepalive ping every 10s
    sttPingTimer = setInterval(() => {
      if (sttWs && sttWs.readyState === WebSocket.OPEN) {
        sttWs.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 10000);

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
  log.info(`Starting interview with AI Name: "${ctx.aiName}"`);
  const sortedQuestions = [...ctx.questions].sort((a, b) => a.order - b.order);
  const isZh = isChineseInterview(ctx);
  let currentQuestionIndex = ctx.startQuestionIndex ?? 0;
  let interviewDone = false;
  let browserClosed = false;

  // Conversation history for the LLM
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(ctx, currentQuestionIndex) },
  ];

  // Contextual updates (code, whiteboard)
  let latestCode = "";
  let latestCodeLanguage = "plaintext";
  let turnDebounceTimer: NodeJS.Timeout | null = null;
  let accumulatedUserText = "";

  // TTS state
  let ttsAbortController: AbortController | null = null;
  let isSpeaking = false;
  let ttsQueue: string[] = [];
  let ttsQueueProcessing = false;

  async function processTtsQueue() {
    if (ttsQueueProcessing) return;
    ttsQueueProcessing = true;
    try {
      while (ttsQueue.length > 0 && !interviewDone && !browserClosed) {
        const sentence = ttsQueue.shift();
        if (sentence && sentence.trim()) {
          await speakText(sentence);
        }
      }
    } finally {
      ttsQueueProcessing = false;
    }
  }

  function enqueueSpeech(text: string) {
    if (!text.trim() || interviewDone || browserClosed) return;
    ttsQueue.push(text);
    void processTtsQueue();
  }

  // STT stream management
  let sttStream: WebSocket | null = null;
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
  let isDrafting = false;

  let endOfTurnTimer: NodeJS.Timeout | null = null;
  let pendingFinalText = "";
  let latestInterimText = "";
  const END_OF_TURN_DELAY_MS = 1200;

  // 160 bytes = 10ms of silence at 16kHz 16-bit mono (keeps Google STT stream alive)
  const SILENCE_FRAME = Buffer.alloc(160, 0);

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

  function stopStt() {
    if (endOfTurnTimer) { clearTimeout(endOfTurnTimer); endOfTurnTimer = null; }
    pendingFinalText = "";
    if (sttRestartTimer) { clearTimeout(sttRestartTimer); sttRestartTimer = null; }
    if (sttKeepaliveTimer) { clearInterval(sttKeepaliveTimer); sttKeepaliveTimer = null; }
    if (sttStream) {
      try {
        sttStream.close();
      } catch (e) {}
    }
    sttStream = null;
  }

  function startStt() {
    stopStt();
    if (interviewDone || browserClosed) return;

    const deepgramLang = isZh ? "zh-CN" : "en-US";
    const deepgramUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&language=${deepgramLang}`;
    
    log.info(`Connecting to Deepgram STT stream (${deepgramLang})...`);
    const stream = new WebSocket(deepgramUrl, {
      headers: {
        Authorization: "Token 3305f4267e467ccb44a229333f9b9ecb7600a57c"
      }
    });

    function triggerOrUpdateDraft() {
      return; // Eager drafting disabled for standard streaming testing
      if (interviewDone || browserClosed) return;

      const currentUserText = (pendingFinalText ? pendingFinalText + " " : "") + latestInterimText;
      const textToUse = currentUserText.trim();

      // Lower threshold to 15 chars for super eager initial draft
      if (textToUse.length < 15) return;

      if (!llmInFlight) {
        // If we are not currently running an LLM call, start a draft if:
        // 1. We haven't started drafting yet (!isDrafting)
        // 2. We have already drafted, but the user's speech has grown by 15+ characters
        const currentDraftLen = isDrafting ? draftQuery.length : 0;
        if (textToUse.length >= currentDraftLen + 15) {
          if (isDrafting) {
            log.info(`Chaining completed draft: text grew from ${currentDraftLen} to ${textToUse.length} chars. Starting new draft...`);
          }
          void startTurn(textToUse, true);
        }
      } else if (isDrafting && llmInFlight) {
        // If a draft LLM call is currently in flight, abort and restart it if the text has grown by 15+ characters
        const currentDraftLen = draftQuery.length;
        if (textToUse.length >= currentDraftLen + 15) {
          log.info(`Chaining in-flight draft: text grew from ${currentDraftLen} to ${textToUse.length} chars. Restarting draft...`);
          
          // Synchronously abort the in-flight draft
          llmAbortController?.abort();
          llmAbortController = null;
          llmInFlight = false;
          
          void startTurn(textToUse, true);
        }
      }
    }

    stream.on("open", () => {
      log.info(`Connected to Deepgram STT stream successfully (${deepgramLang})`);
    });

    stream.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type !== "Results") return;
        const result = response.channel?.alternatives?.[0];
        if (!result) return;
        const transcript: string = result.transcript || "";
        if (!transcript.trim()) return;

        const isFinal = response.is_final;
        if (isFinal) {
          const text = transcript.trim();
          if (isSpeaking) interruptTts();
          if (turnDebounceTimer) clearTimeout(turnDebounceTimer);

          pendingFinalText += (pendingFinalText ? " " : "") + text;
          latestInterimText = "";
          log.info(`STT final (buffered) [Deepgram]: "${pendingFinalText}"`);

          triggerOrUpdateDraft();
        } else {
          latestInterimText = transcript.trim();

          if (transcript.trim().length > 5 && isSpeaking) {
            interruptTts();
          }

          send({ type: "asr", data: { results: [{ text: transcript }] } });
        }
      } catch (err) {
        log.error("Deepgram message parse error:", err);
      }
    });

    stream.on("error", (err) => {
      log.warn("Deepgram STT stream error:", err.message);
    });

    stream.on("close", () => {
      if (!interviewDone && !browserClosed && sttStream === stream) {
        sttStream = null;
        if (sttRestartTimer) clearTimeout(sttRestartTimer);
        sttRestartTimer = setTimeout(startStt, 1000);
      }
    });

    sttStream = stream;
    lastAudioSentAt = Date.now();

    // Deepgram keepalive ping every 10s
    sttKeepaliveTimer = setInterval(() => {
      if (!sttStream || sttStream.readyState !== WebSocket.OPEN || interviewDone || browserClosed) return;
      sttStream.send(JSON.stringify({ type: "KeepAlive" }));
    }, 10_000);
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
        isZh,
        (chunk) => {
          if (abort.signal.aborted || browserClosed) return;
          if (!firstTtsChunkAt) {
            firstTtsChunkAt = Date.now();
            log.info(`TTS first chunk generated in ${firstTtsChunkAt - ttsStart}ms`);
          }
          if (isDrafting) {
            draftAudioBuffer.push(chunk);
          } else {
            isSpeaking = true; // Ensure it's set if we transition to speaking
            sendBinary(chunk);  // audio flows to browser as chunks arrive
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

  let completedDraftMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam | null = null;
  let completedDraftToolCallMsg: OpenAI.Chat.Completions.ChatCompletionToolMessageParam | null = null;

  async function startTurn(userText?: string, isDraft: boolean = false) {
    if (interviewDone || browserClosed) return;

    // 1. Handle Interruption/Cancellation of previous turns
    if (llmInFlight && llmAbortController) {
      log.info(`Aborting ${isDrafting ? "draft" : "active"} turn...`);
      llmAbortController.abort();
      llmAbortController = null;
      llmInFlight = false;
      
      if (!isDrafting && messages.length > 0 && messages[messages.length - 1].role === "assistant") {
        messages.pop();
      }
    }

    // Always clear the previous draft's active TTS and queue when starting/chaining a new turn!
    if (isDrafting) {
      log.info("Aborting and clearing previous draft TTS queue and synthesis...");
      interruptTts(false); // Abort active draft TTS synthesis, clear queue, do NOT send interrupt to browser
    }

    if (!isDraft && isSpeaking) interruptTts(true);

    llmInFlight = true;
    isDrafting = isDraft;
    llmAbortController = new AbortController();
    
    if (isDraft) {
      draftQuery = userText || "";
      draftTextBuffer = "";
      draftAudioBuffer = [];
      completedDraftMsg = null;
      completedDraftToolCallMsg = null;
    }

    let messagesToUse = messages;

    if (userText) {
      if (!isDraft) {
        log.info(`LLM Turn started for: "${userText}"`);
        send({ type: "asr_ended", text: userText });

        // If the previous message was ALSO a user message, merge them
        if (lastUserMessageIndex !== -1 && lastUserMessageIndex === messages.length - 1) {
          const prevContent = messages[lastUserMessageIndex].content as string;
          messages[lastUserMessageIndex].content = `${prevContent} ${userText}`;
          log.info(`Merged with previous user message. New content: "${messages[lastUserMessageIndex].content}"`);
        } else {
          // Add context if available
          let userContent = userText;
          if (latestCode) {
            userContent += `\n\n[CODE_UPDATE language=${latestCodeLanguage}]\n${latestCode}`;
          }
          messages.push({ role: "user", content: userContent });
          lastUserMessageIndex = messages.length - 1;
        }
        messagesToUse = messages;
      } else {
        // For drafts, we create a temporary array so we don't pollute the actual history until it's promoted
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
      // Stream LLM response
      const stream = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: messagesToUse,
        tools: isDrafting ? undefined : TOOLS,
        tool_choice: isDrafting ? undefined : "auto",
        stream: true,
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
            // Stream text to browser for display
            send({ type: "tts_text", data: { text: delta.content } });
          }

          // TTS complete sentences as they stream in (sentence-by-sentence)
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
      }

      // Speak any remaining buffer
      if (sentenceBuffer.trim()) {
        enqueueSpeech(sentenceBuffer);
      }

      // Track assistant's response in history
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
              // Immediately push tool response to satisfy OpenAI's requirements for the next turn
              messages.push({
                role: "tool",
                tool_call_id: toolCallId,
                content: JSON.stringify({ success: true }),
              });
            }
            if (fullText) {
              log.info(`LLM turn complete. Length: ${fullText.length}, Reason: ${finishReason}`);
              send({ type: "tts_ended" });
            }
        }
      } else {
        log.warn(`LLM returned empty content. Reason: ${finishReason}`);
        if (!isDrafting) {
          // Speak a polite fallback so the user is never stuck in dead silence
          const fallbackText = isZh
            ? "抱歉，刚才网络连接有些波动。能请您重复一下刚才的回答吗？"
            : "I'm sorry, I had a brief connection glitch. Could you please repeat your answer?";
          enqueueSpeech(fallbackText);
          messages.push({ role: "assistant", content: fallbackText });
          send({ type: "tts_ended" });
        }
      }

      // Handle tool call: signal_question_change
      if (toolCallName === "signal_question_change" && toolCallArgs) {
        try {
          const args = JSON.parse(toolCallArgs) as { questionIndex: number; userRequested?: boolean; speech?: string };
          const newIndex = args.questionIndex;
          const total = sortedQuestions.length;
          const toolSpeech = args.speech?.trim() || "";

          if (newIndex >= total) {
            // Interview complete
            log.info("Interview complete");
            // Speak farewell from the tool call immediately (no second LLM call)
            if (toolSpeech && !fullText) {
              enqueueSpeech(toolSpeech);
            }
            setTimeout(() => {
              if (!browserClosed) {
                send({ type: "interview_complete" });
                interviewDone = true;
              }
            }, 3000);
          } else {
            const direction = newIndex > currentQuestionIndex ? "next" : "previous";
            send({ type: "transitioning", direction, auto: !args.userRequested });

            currentQuestionIndex = newIndex;
            // Update system prompt for new question
            messages[0] = { role: "system", content: buildSystemPrompt(ctx, currentQuestionIndex) };

            send({
              type: "question_change",
              questionIndex: newIndex,
              totalQuestions: total,
              auto: !args.userRequested,
            });

            log.info(`Question transition → ${newIndex + 1}/${total}`);

            // Speak the transition text from the tool call immediately
            // This eliminates the second LLM round-trip that was adding 7-11s of latency
            if (toolSpeech && !fullText) {
              enqueueSpeech(toolSpeech);
            }
          }
        } catch (e) {
          log.error("Failed to parse tool call args:", e);
        }
      }

      // If the AI only called a tool but didn't speak AND didn't provide speech in tool args,
      // fall back to a second LLM call (safety net for old behaviour)
      if (!fullText && toolCallName) {
        const hasSpeechInArgs = toolCallArgs?.includes('"speech"');
        if (!hasSpeechInArgs) {
          log.info(`Tool called without speech field, re-triggering LLM turn...`);
          llmInFlight = false;
          return startTurn(undefined, isDrafting);
        }
        log.info(`Tool speech was used inline — no second LLM call needed.`);
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
    
    log.info(`Draft promoted! Flushing ${draftAudioBuffer.length} audio chunks and ${draftTextBuffer.length} chars...`);
    
    // 1. Convert draft to active
    isDrafting = false;
    
    // 2. Track user message
    messages.push({ role: "user", content: finalText });
    lastUserMessageIndex = messages.length - 1;
    
    // Push the completed draft message if it finished already
    let didDraftFinish = false;
    if (completedDraftMsg) {
        didDraftFinish = true;
        messages.push(completedDraftMsg);
        if (completedDraftToolCallMsg) messages.push(completedDraftToolCallMsg);
        completedDraftMsg = null;
        completedDraftToolCallMsg = null;
    }
    
    // 3. Flush text to browser
    send({ type: "tts_text", data: { text: draftTextBuffer } });
    
    // 4. Flush audio to browser
    if (draftAudioBuffer.length > 0) {
      isSpeaking = true;
      for (const chunk of draftAudioBuffer) {
        sendBinary(chunk);
      }
    }
    
    // 5. Clear buffers (they are now being sent live)
    draftTextBuffer = "";
    draftAudioBuffer = [];

    // 6. Signal end of turn if the draft had already finished
    if (didDraftFinish) {
        send({ type: "tts_ended" });
    }
  }

  // ── Send opening greeting ──────────────────────────────────────────────
  async function sendGreeting() {
    log.info("Sending greeting trigger to LLM...");
    llmInFlight = true;
    try {
      const triggerMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { 
          role: "system", 
          content: `Your name is Inluwa. You are the user's interviewer for the day. 
          Topic: "${ctx.title}". 
          First question: "${sortedQuestions[0].text}".
          
          Greet the user warmly as Inluwa. Say "I'm your interviewer for the day" and mention you're excited to learn more about them and their interest in the position. 
          Do NOT read out the full interview title "${ctx.title}" if it sounds like a technical label; instead, refer to it naturally as "the role" or "the position".
          Then, transition naturally into the first question without saying "Question 1" or "Here is the first question". 
          Just say something like "To get us started..." then ask the question.` 
        },
        {
          role: "user",
          content: "Hello! I'm here for the interview. Please introduce yourself and let's get started.",
        },
      ];
      const stream = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: triggerMessages,
        stream: true,
        max_completion_tokens: 1000,
      });
      log.info("Greeting stream started...");

      let fullText = "";
      let sentenceBuffer = "";
      let toolCallId = "";
      let toolCallName = "";
      let toolCallArgs = "";

      for await (const chunk of stream) {
        if (browserClosed) break;
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content;
        if (content) {
          fullText += content;
          sentenceBuffer += content;
          send({ type: "tts_text", data: { text: content } });

          const { complete, remainder } = extractSentences(sentenceBuffer);
          sentenceBuffer = remainder;
          for (const sentence of complete) {
            if (sentence.trim()) enqueueSpeech(sentence);
          }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.id) {
              toolCallId = tc.id;
              log.info(`Greeting tool call detected: ${tc.function?.name || "unknown"}`);
            }
            if (tc.function?.name) toolCallName = tc.function.name;
            if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
          }
        }
      }

      if (sentenceBuffer.trim()) enqueueSpeech(sentenceBuffer);
      
      if (fullText) {
        messages.push({ role: "assistant", content: fullText });
        send({ type: "tts_ended" });
      } else {
        log.warn("Greeting stream returned empty content.");
        const fallbackGreeting = isZh
          ? "你好！我是面试官 Inluwa。很高兴见到你，能请你简单介绍一下自己吗？"
          : "Hello! I'm Inluwa, your interviewer for today. I'm excited to learn more about you. To get us started, could you please introduce yourself?";
        enqueueSpeech(fallbackGreeting);
        messages.push({ role: "assistant", content: fallbackGreeting });
        send({ type: "tts_ended" });
      }

      // Handle tool call (e.g. if it tries to transition immediately)
      if (toolCallName === "signal_question_change" && toolCallArgs) {
        try {
          const args = JSON.parse(toolCallArgs) as { questionIndex: number; userRequested?: boolean };
          const newIndex = args.questionIndex;
          const total = sortedQuestions.length;

          if (newIndex < total) {
            const direction = newIndex > currentQuestionIndex ? "next" : "previous";
            send({ type: "transitioning", direction, auto: !args.userRequested });

            currentQuestionIndex = newIndex;
            messages[0] = { role: "system", content: buildSystemPrompt(ctx, currentQuestionIndex) };

            send({
              type: "question_change",
              questionIndex: newIndex,
              totalQuestions: total,
              auto: !args.userRequested,
            });

            log.info(`Greeting → Question transition → ${newIndex + 1}/${total}`);
          }
        } catch (e) {
          log.error("Failed to parse greeting tool call args:", e);
        }
      }
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

          // Start STT stream lazily on first audio, but only if not already running/connecting
          if (!sttStream || sttStream.readyState === WebSocket.CLOSED || sttStream.readyState === WebSocket.CLOSING) {
            log.info("Audio received, starting STT stream...");
            startStt();
          }

          if (sttStream && sttStream.readyState === WebSocket.OPEN) {
            sttStream.send(pcm);
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
            send({ type: "interview_complete" });
            interviewDone = true;
          } else {
            send({ type: "transitioning", direction: "next", auto: false });
            currentQuestionIndex = nextIdx;
            messages[0] = { role: "system", content: buildSystemPrompt(ctx, currentQuestionIndex) };
            send({ type: "question_change", questionIndex: nextIdx, totalQuestions: sortedQuestions.length, auto: false });
          }
          break;
        }

        case "force_prev":
        case "prev_question": {
          const prevIdx = Math.max(currentQuestionIndex - 1, 0);
          interruptTts();
          send({ type: "transitioning", direction: "previous", auto: false });
          currentQuestionIndex = prevIdx;
          messages[0] = { role: "system", content: buildSystemPrompt(ctx, currentQuestionIndex) };
          send({ type: "question_change", questionIndex: prevIdx, totalQuestions: sortedQuestions.length, auto: false });
          break;
        }

        case "commit_turn": {
          log.info("Manual turn commit received via Send button!");
          let committed = pendingFinalText.trim();
          if (latestInterimText) {
            committed += (committed ? " " : "") + latestInterimText;
          }
          pendingFinalText = "";
          latestInterimText = "";

          if (!committed && !isDrafting) break; // Nothing to commit and no draft

          log.info(`End-of-turn committed manually: "${committed}"`);

          if (isDrafting && draftQuery) {
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
              void startTurn(committed, false);
            }
          } else {
            void startTurn(committed, false);
          }
          break;
        }
      }
    } catch { /* not JSON */ }
  });

  browserWs.on("close", () => {
    log.info("Browser disconnected");
    browserClosed = true;
    interruptTts();
    stopStt();
  });

  // ── Start ──────────────────────────────────────────────────────────────
  try {
    send({ type: "ready" });
    await sendGreeting();
  } catch (err) {
    log.error("Interview init failed:", err);
    send({ type: "error", message: `Init failed: ${err instanceof Error ? err.message : String(err)}` });
    browserWs.close();
  }
}
