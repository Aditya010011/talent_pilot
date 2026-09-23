export const maxDuration = 300;
import { URL as NativeURL } from "node:url";

try {
  Object.defineProperty(global, "URL", {
    value: NativeURL,
    writable: false,
    configurable: false,
  });
} catch (e) {}

try {
  Object.defineProperty(globalThis, "URL", {
    value: NativeURL,
    writable: false,
    configurable: false,
  });
} catch (e) {}

import {
  buildFaceAnalysisInput,
  enrichInsightsFromMetadata,
} from "@/lib/ai/behavioral-insights";
import { svgDataUrlToPng } from "@/lib/ai/convert-svg";
import { extractJson } from "@/lib/ai/extract-json";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summary";
import { getProvider, REPORT_MODEL } from "@/lib/ai/registry";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { handleVoiceSave, type CompletionSession, type ProgressSession, type VoiceSaveOps, type VoiceSavePayload } from "./logic";

const log = createLogger("api/voice/save");

function isSubstantiveAnswer(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  
  // Quick reject for common very short filler words
  if (/^(hi|hello|thanks|thank you|ok|okay|sure|yes|no|yep|yeah)[\s!.?,]*$/i.test(normalized)) {
    return false;
  }

  // Count CJK characters as words, and space-separated words as words
  const cjkMatches = normalized.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || [];
  const latinWords = normalized.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, " ")
                              .split(/\s+/)
                              .filter(Boolean);
  
  const wordEquivalentCount = cjkMatches.length + latinWords.length;
  
  // Require at least 6 word-equivalents (characters for CJK, words for Latin)
  if (wordEquivalentCount < 6) return false;
  
  return true;
}

function buildInsufficientDataReport(
  questions: { text: string }[] = [],
  criteria: { name: string }[] = [],
) {
  return {
    insufficientData: true,
    summary:
      "Insufficient candidate response data. The participant did not provide enough substantive answers for a reliable evaluation.",
    themes: [],
    sentiment: {
      overall: "neutral",
      details:
        "Insufficient response content to determine sentiment reliably.",
    },
    keyInsights: [
      "Insufficient transcript evidence for competency grading.",
      "At least one question appears unanswered or minimally answered.",
    ],
    notableQuotes: [],
    toneAnalysis: {
      overall: "neutral",
      details: "Insufficient spoken content for tone analysis.",
      segments: [],
    },
    behavioralAnalysis: {
      eyeContactFeedback: "Behavioral metrics are available separately in the report.",
      emotionalPresenceFeedback:
        "Behavioral metrics are available separately in the report.",
      overallBehavioralInsight:
        "Behavioral telemetry exists, but transcript evidence is insufficient for full interview grading.",
      likertScale: [
        { parameter: "Presentation", score: 0, explanation: "No substantive candidate responses to assess." },
        { parameter: "Opportunistic", score: 0, explanation: "No substantive candidate responses to assess." },
        { parameter: "Business Acumen", score: 0, explanation: "No substantive candidate responses to assess." },
        { parameter: "Closing Techniques", score: 0, explanation: "No substantive candidate responses to assess." },
        { parameter: "Objection Handling", score: 0, explanation: "No substantive candidate responses to assess." },
      ],
    },
    big5Personality: null,
    pros: [],
    cons: ["Insufficient substantive answers for reliable scoring."],
    questionEvaluations: [],
    criteriaEvaluations: [],
  };
}
const voiceSaveOps: VoiceSaveOps = {
  async insertMessages(sessionId, messages) {
    const roleMap = (role: string) => (role === "user" ? "USER" as const : "ASSISTANT" as const);
    const rows = messages.map((m) => ({
      sessionId,
      role: roleMap(m.role),
      content: m.content,
      contentType: "TEXT" as const,
      questionId: m.questionId || null,
      wordCount: m.content.split(/\s+/).length,
      transcription: m.source === "chat" ? "chat" : null,
      ...(m.timestamp && !Number.isNaN(Date.parse(m.timestamp))
        ? { timestamp: m.timestamp }
        : {}),
    }));

    if (rows.length === 0) return;

    // Skip rows that duplicate a message inserted in the last 2 minutes
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("messages")
      .select("role, content, questionId")
      .eq("sessionId", sessionId)
      .gte("timestamp", since);

    const recentKeys = new Set(
      (recent ?? []).map(
        (r) => `${r.role}|${(r.content || "").trim()}|${r.questionId ?? ""}`,
      ),
    );

    const toInsert = rows.filter(
      (r) => !recentKeys.has(`${r.role}|${r.content.trim()}|${r.questionId ?? ""}`),
    );

    if (toInsert.length === 0) return;

    const { error } = await supabaseAdmin.from("messages").insert(toInsert);
    if (error) {
      log.error(`Failed to insert messages for session ${sessionId}:`, error);
      throw new Error(`Database insert failed: ${error.message}`);
    }
  },
  async loadSessionForCompletion(sessionId) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select(
        `*, interview:interviews!inner(title, objective, language, userId, projectId, assessmentCriteria, questions(text, order, type))`,
      )
      .eq("id", sessionId)
      .order("order", {
        referencedTable: "interviews.questions",
        ascending: true,
      })
      .single();

    return (data as CompletionSession | null) ?? null;
  },
  async loadFirstMessageTimestamp(sessionId) {
    const { data } = await supabaseAdmin
      .from("messages")
      .select("timestamp")
      .eq("sessionId", sessionId)
      .order("timestamp", { ascending: true })
      .limit(1)
      .single();

    return (data?.timestamp as string | undefined) ?? null;
  },
  async loadSessionForProgress(sessionId) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select(`*, interview:interviews!inner(questions(*))`)
      .eq("id", sessionId)
      .order("order", {
        referencedTable: "interviews.questions",
        ascending: true,
      })
      .single();

    return (data as ProgressSession | null) ?? null;
  },
  async updateSession(sessionId, payload) {
    const { error } = await supabaseAdmin.from("sessions").update(payload).eq("id", sessionId);
    if (error) {
      log.error(`Failed to update session ${sessionId}:`, error);
      throw new Error(`Database update failed: ${error.message}`);
    }
  },
  generateSummary,
  log,
  now: () => new Date(),
};

/**
 * POST /api/voice/save
 * Save voice interview messages, optionally complete the session,
 * and fire-and-forget an AI summary/analysis so the interviewee isn't blocked.
 */
export async function POST(req: Request) {
  const payload = (await req.json()) as VoiceSavePayload;
  const result = await handleVoiceSave(payload, voiceSaveOps);
  return NextResponse.json(result.body, { status: result.status });
}

async function generateSummary(
  sessionId: string,
  interviewTitle: string,
  objective?: string | null,
  language?: string | null,
  questions?: { text: string; order: number; type?: string }[] | null,
  assessmentCriteria?: { name: string; description: string }[] | null,
): Promise<void> {
  try {
    log.info(`generateSummary: starting for session ${sessionId}`);
    
    let activeCriteria = ((assessmentCriteria || []) as { name: string; description: string }[]).map(c => ({
      name: c.name,
      description: c.description
    }));

    if (activeCriteria.length < 3) {
      const defaults = [
        { name: "Analytical Thinking", description: "Logical reasoning and ability to break down complex issues." },
        { name: "Technical Communication", description: "Clarity and structure in explaining technical concepts." },
        { name: "Attention to Detail", description: "Precision and diligence in code execution and problem analysis." },
      ];
      for (const def of defaults) {
        if (activeCriteria.length >= 3) break;
        if (!activeCriteria.some((c) => c.name.toLowerCase() === def.name.toLowerCase())) {
          activeCriteria.push(def);
        }
      }
    }
    if (activeCriteria.length > 8) {
      activeCriteria = activeCriteria.slice(0, 8);
    }

    const { data: allMessages } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("sessionId", sessionId)
      .order("timestamp", { ascending: true });
    log.info(`generateSummary: loaded ${allMessages?.length || 0} messages`);

    if (!allMessages || allMessages.length === 0) {
      log.info("No messages to summarize");
      return;
    }

    const userMessages = allMessages.filter(
      (m) => m.role === "USER" && m.contentType === "TEXT" && (m.content || "").trim().length > 0
    );

    const totalUserWords = userMessages.reduce((acc, m) => acc + (m.content || "").split(/\s+/).length, 0);
    const substantiveWordCount = userMessages
      .map((m) => m.content || "")
      .filter(isSubstantiveAnswer)
      .reduce((acc, text) => acc + text.split(/\s+/).filter(Boolean).length, 0);


    const whiteboardDrawingsRaw = allMessages
      .filter((m) => m.contentType === "WHITEBOARD" && m.whiteboardData)
      .map((m) => {
        const data = m.whiteboardData as Record<string, unknown>;
        return {
          label: (data.label as string) || "Untitled Drawing",
          imageDataUrl: m.whiteboardImageUrl ?? null,
        };
      });

    const whiteboardDrawings = await Promise.all(
      whiteboardDrawingsRaw.map(async (d) => ({
        ...d,
        imageDataUrl: d.imageDataUrl
          ? await svgDataUrlToPng(d.imageDataUrl)
          : null,
      })),
    );

    const codeSnippetsInput = allMessages
      .filter(
        (m) => (m.contentType as string) === "CODE" && m.whiteboardData,
      )
      .map((m) => {
        const data = m.whiteboardData as Record<string, unknown>;
        return {
          label: (data.label as string) || "Untitled Snippet",
          code: (data.code as string) || "",
          language: (data.language as string) || "plaintext",
        };
      })
      .filter((s) => s.code.trim().length > 0);

    const provider = getProvider(REPORT_MODEL);
    const textMessages = allMessages
      .filter((m) => m.contentType === "TEXT")
      .map((m) => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
      }));
    const drawingsInput =
      whiteboardDrawings.length > 0 ? whiteboardDrawings : null;
    const codeInput = codeSnippetsInput.length > 0 ? codeSnippetsInput : null;
    const { data: sessionMeta } = await supabaseAdmin
      .from("sessions")
      .select("participantMetadata")
      .eq("id", sessionId)
      .single();

    const participantMetadata = (sessionMeta?.participantMetadata ?? null) as
      | Record<string, unknown>
      | null;
    const faceAnalysis = buildFaceAnalysisInput(participantMetadata);
    const { data: sessionTiming } = await supabaseAdmin
      .from("sessions")
      .select("startedAt")
      .eq("id", sessionId)
      .single();

    const promptMessages = buildSummaryPrompt(
      interviewTitle,
      textMessages,
      objective,
      activeCriteria,
      questions,
      language,
      drawingsInput,
      codeInput,
      faceAnalysis,
    );

    const hasInsufficientData =
      substantiveWordCount === 0 &&
      codeSnippetsInput.length === 0 &&
      whiteboardDrawings.length === 0;

    let parsed: Record<string, unknown>;
    if (hasInsufficientData) {
      parsed = buildInsufficientDataReport(
        questions ?? [],
        activeCriteria ?? [],
      ) as Record<string, unknown>;
    } else {
      let response;
      try {
        log.info(`generateSummary: calling LLM provider using model ${REPORT_MODEL}`);
        response = await provider.generateResponse({
          messages: promptMessages,
          temperature: 0.3,
          maxTokens: 8192,
          model: REPORT_MODEL,
        });
      } catch (err) {
        const isVisionError =
          err instanceof Error &&
          /image.*not supported|vision.*not supported|does not support.*image/i.test(
            err.message,
          );
        if (isVisionError && drawingsInput?.some((d) => d.imageDataUrl)) {
          log.info("Model does not support images, retrying text-only");
          const textOnlyDrawings = drawingsInput.map((d) => ({
            ...d,
            imageDataUrl: null,
          }));
          const fallbackMessages = buildSummaryPrompt(
            interviewTitle,
            textMessages,
            objective,
            activeCriteria,
            questions,
            language,
            textOnlyDrawings,
            codeInput,
            faceAnalysis,
          );
          response = await provider.generateResponse({
            messages: fallbackMessages,
            temperature: 0.3,
            maxTokens: 8192,
            model: REPORT_MODEL,
          });
        } else {
          throw err;
        }
      }

      try {
        parsed = extractJson(response.content);
      } catch (parseErr) {
        log.error(
          "Raw AI response (first 1000 chars):",
          response.content.slice(0, 1000),
        );
        throw parseErr;
      }
    }

    const enriched = enrichInsightsFromMetadata(
      parsed,
      participantMetadata,
      questions ?? undefined,
      sessionTiming?.startedAt ?? null,
    );

    const insightsData: Record<string, unknown> = {
      insufficientData: enriched.insufficientData === true,
      keyInsights: enriched.keyInsights ?? [],
      pros: enriched.pros ?? [],
      cons: enriched.cons ?? [],
    };
    if (enriched.criteriaEvaluations) {
      insightsData.criteriaEvaluations = enriched.criteriaEvaluations;
    }
    if (enriched.questionEvaluations) {
      insightsData.questionEvaluations = enriched.questionEvaluations;
    }
    if (enriched.researchFindings) {
      insightsData.researchFindings = enriched.researchFindings;
    }
    if (enriched.toneAnalysis) {
      insightsData.toneAnalysis = enriched.toneAnalysis;
    }
    if (enriched.big5Personality) {
      insightsData.big5Personality = enriched.big5Personality;
    }
    if (enriched.behavioralAnalysis) {
      insightsData.behavioralAnalysis = enriched.behavioralAnalysis;
    }
    if (enriched.codeEvaluations) {
      insightsData.codeEvaluations = enriched.codeEvaluations;
    }

    await supabaseAdmin
      .from("sessions")
      .update({
        summary: String(enriched.summary ?? ""),
        themes: (enriched.themes as string[]) ?? [],
        sentiment: enriched.sentiment ?? null,
        insights: insightsData,
      })
      .eq("id", sessionId);

    const themeCount = Array.isArray(parsed.themes) ? parsed.themes.length : 0;
    const insightCount = Array.isArray(parsed.keyInsights)
      ? parsed.keyInsights.length
      : 0;
    const qEvalCount = Array.isArray(parsed.questionEvaluations)
      ? parsed.questionEvaluations.length
      : 0;
    log.info(
      `Summary generated for session ${sessionId}: ` +
        `${themeCount} themes, ${insightCount} insights, ${qEvalCount} question evaluations`,
    );
  } catch (error) {
    log.error("Summary generation failed:", error);
  }
}
