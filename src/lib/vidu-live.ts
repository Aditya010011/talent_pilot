/**
 * Vidu S1 realtime digital-human helpers (Live API).
 * Docs: https://platform.vidu.com/docs/vidu-s1
 *
 * Uses the same VIDU_API_KEY as img2video pregeneration.
 */

import { buildViduVerbatimLines } from "@/lib/vidu-script";

const VIDU_LIVE_HOST = process.env.VIDU_LIVE_HOST?.trim() || "api.vidu.com";

function getViduApiKey(): string {
  const key = process.env.VIDU_API_KEY?.trim();
  if (!key) throw new Error("VIDU_API_KEY is not configured");
  return key;
}

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Token ${getViduApiKey()}`,
  };
}

export interface ViduLiveAvatarConfig {
  persona: string;
  imageUri: string;
  name?: string;
  voice?: string;
}

export interface ViduLiveSession {
  liveId: string;
  callMode: "video" | "audio";
  liveDuration: number;
  status: string;
  rtc: {
    appId: string;
    channelId: string;
    userId: string;
    token: string;
    tokenExpireAt: string;
  };
  wsUrl: string;
  apiKeyToken: string;
}

export async function createViduLiveSession(params: {
  callMode?: "video" | "audio";
  avatar: ViduLiveAvatarConfig;
  characterId?: string;
}): Promise<ViduLiveSession> {
  const body = {
    call_mode: params.callMode ?? "video",
    character_id: params.characterId ?? "0",
    avatar: {
      persona: params.avatar.persona,
      image_uri: params.avatar.imageUri,
      name: params.avatar.name || "Interviewer",
      voice: params.avatar.voice || "Tina",
    },
  };

  const response = await fetch(`https://${VIDU_LIVE_HOST}/live/v1/lives`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create Vidu live session: ${response.status} ${response.statusText} — ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    live?: {
      id?: string | number;
      live_duration?: number;
      status?: string;
      call_mode?: string;
    };
    rtc?: {
      app_id?: string;
      channel_id?: string;
      user_id?: string;
      token?: string;
      token_expire_at?: string | number;
    };
  };

  const liveId = String(data.live?.id ?? "");
  if (!liveId || !data.rtc?.token || !data.rtc?.user_id) {
    throw new Error("Vidu live create response missing live.id or rtc credentials");
  }

  // Browser WebSockets cannot set Authorization headers, and Vidu rejects
  // query-string auth (401). Clients must connect via our gateway proxy:
  //   /_vidu/live/ws?live_id=…
  const wsUrl = `/_vidu/live/ws?live_id=${encodeURIComponent(liveId)}`;

  return {
    liveId,
    callMode: (data.live?.call_mode as "video" | "audio") || "video",
    liveDuration: data.live?.live_duration ?? 600,
    status: data.live?.status ?? "waiting",
    rtc: {
      appId: String(data.rtc.app_id ?? ""),
      channelId: String(data.rtc.channel_id ?? ""),
      userId: String(data.rtc.user_id),
      token: String(data.rtc.token),
      tokenExpireAt: String(data.rtc.token_expire_at ?? ""),
    },
    wsUrl,
    // Never expose the raw API key to browsers.
    apiKeyToken: "",
  };
}

export async function getViduLiveSession(liveId: string): Promise<{
  status: string;
  billedSeconds?: number;
  creditsCost?: number;
}> {
  const response = await fetch(
    `https://${VIDU_LIVE_HOST}/live/v1/lives/${encodeURIComponent(liveId)}`,
    { method: "GET", headers: authHeaders() },
  );
  if (!response.ok) {
    throw new Error(`Failed to query Vidu live session: ${response.statusText}`);
  }
  const data = (await response.json()) as {
    live?: {
      status?: string;
      billed_seconds?: number;
      credits_cost?: number;
    };
  };
  return {
    status: data.live?.status ?? "unknown",
    billedSeconds: data.live?.billed_seconds,
    creditsCost: data.live?.credits_cost,
  };
}

/** Exact lines shown on screen AND spoken by Vidu (persona must speak them verbatim). */
export { buildViduVerbatimLines } from "@/lib/vidu-script";

/** Build a Gemini-style interviewer persona for Vidu S1's built-in agent.
 * Vidu speaks with its own lipsync (no text-inject API) — this persona IS the brain. */
export function buildViduInterviewerPersona(params: {
  aiName: string;
  title: string;
  objective?: string | null;
  questions: Array<{
    text: string;
    type?: string;
    description?: string | null;
    options?: { options?: string[]; allowMultiple?: boolean } | null;
  }>;
  language?: string;
  aiTone?: string;
  followUpDepth?: string;
  participantName?: string | null;
}): string {
  const interviewLanguage = params.language || "English";
  const tone = (params.aiTone || "PROFESSIONAL").toLowerCase();
  const candidate = params.participantName?.trim() || "the candidate";
  const verbatimLines = buildViduVerbatimLines({
    aiName: params.aiName,
    participantName: params.participantName,
    questions: params.questions,
  });
  const scriptBlock = verbatimLines
    .map((line, i) => `${i + 1}. "${line}"`)
    .join("\n");

  const questionNotes = params.questions
    .map((q, i) => {
      const notes: string[] = [];
      if (q.description) notes.push(`Context (do not read aloud): ${q.description}`);
      if (q.options?.options?.length) {
        const labels = q.options.options
          .map((o, j) => `${String.fromCharCode(65 + j)}) ${o}`)
          .join(", ");
        notes.push(`Options to include if not already in the script line: ${labels}`);
      }
      if (q.type === "CODING") {
        notes.push("CODING: do not read a long problem — point them to the on-screen editor.");
      }
      if (q.type === "WHITEBOARD") {
        notes.push("WHITEBOARD: do not read a long problem — point them to the on-screen whiteboard.");
      }
      if (!notes.length) return null;
      return `Q${i + 1}: ${notes.join(" ")}`;
    })
    .filter(Boolean)
    .join("\n");

  return [
    `You are ${params.aiName || "Inluwa"}, a ${tone} AI interviewer for a live job interview.`,
    `Your name is strictly "${params.aiName || "Inluwa"}" (never spell it letter by letter).`,
    `Do not call yourself an LLM, chatbot, or AI assistant.`,
    "## Interview Details",
    `- Topic / role: "${params.title}"`,
    params.objective ? `- Objective: ${params.objective}` : null,
    `- Candidate: ${candidate}`,
    `- Language: speak ENTIRELY in ${interviewLanguage}.`,
    "",
    "## VERBATIM SPEECH SCRIPT (CRITICAL)",
    "You MUST speak the lines below WORD FOR WORD. Do not rephrase, embellish, or add excitement.",
    "Do not invent extra greetings, small talk, or follow-up questions.",
    "Speak line 1 immediately when you go live. After each candidate answer (audio clip), speak the next line exactly.",
    "Wait patiently between lines — the candidate's mic is muted until they press Submit; silence is normal.",
    "IMPORTANT: If the candidate asks to repeat, asks a clarification question, says they could not hear you, or says hello/can you hear me, repeat the CURRENT script line exactly. Do not say thank you and do not advance to the next line.",
    "Only advance to the next script line after the candidate gives a substantive answer to the current question.",
    "Keep your face oriented straight toward the camera. Maintain eye contact, do not look down, and blink naturally at an ordinary human cadence.",
    "",
    scriptBlock,
    "",
    questionNotes ? `## Extra notes (never change the script wording)\n${questionNotes}` : null,
    "",
    "## Rules",
    "1. Never say 'Question 1', 'Next question', or 'Moving on'.",
    "2. No em dashes, markdown, or bullet points in speech.",
    "3. Stay calm and neutral — not theatrical or overly emotional.",
    "4. If they say 'can you hear me?' or 'repeat', briefly answer, then restate the CURRENT script line exactly.",
    "5. After the final script line, stop speaking.",
  ]
    .filter((line): line is string => line != null && line !== "")
    .join("\n");
}
