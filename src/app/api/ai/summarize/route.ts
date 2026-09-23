export const maxDuration = 300;
import {
  buildFaceAnalysisInput,
  enrichInsightsFromMetadata,
} from "@/lib/ai/behavioral-insights";
import { svgDataUrlToPng } from "@/lib/ai/convert-svg";
import { extractJson } from "@/lib/ai/extract-json";
import { createLogger } from "@/lib/logger";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summary";
import { getProvider, REPORT_MODEL } from "@/lib/ai/registry";
import { getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const log = createLogger("api/ai/summarize");
const LLM_TIMEOUT_MS = 45_000;
const LLM_MAX_ATTEMPTS = 2;

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Analysis provider timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

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

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await req.json();
  log.info(`Summarizing session: ${sessionId}`);

  try {
    const { data: interviewSession } = await supabaseAdmin
      .from("sessions")
      .select(
        `*, interview:interviews!inner(title, userId, projectId, objective, language, assessmentCriteria, questions(text, order, type)), messages(*)`,
      )
      .eq("id", sessionId)
      .order("order", { referencedTable: "interviews.questions", ascending: true })
      .order("timestamp", { referencedTable: "messages", ascending: true })
      .single();

    if (!interviewSession) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const interviewRow = interviewSession.interview as {
      title: string;
      userId: string;
      projectId: string;
      objective: string | null;
      language: string;
      assessmentCriteria: { name: string; description: string }[] | null;
      questions: { text: string; order: number; type?: string }[];
    };

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("organizationId, defaultLlmModel")
      .eq("id", interviewRow.projectId)
      .single();

    // Allow interview owner or any member of the interview's organization
    if (interviewRow.userId !== user.id) {
      if (!project?.organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const { data: membership } = await supabaseAdmin
        .from("organization_members")
        .select("id")
        .eq("workspaceId", project.organizationId)
        .eq("userId", user.id)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const interview = {
      ...interviewRow,
      language:
        (interviewSession as { language?: string | null }).language ||
        interviewRow.language,
    };

    const msgs = (interviewSession.messages ?? []) as {
      contentType: string;
      whiteboardData: Record<string, unknown> | null;
      whiteboardImageUrl: string | null;
      role: string;
      content: string;
    }[];

    let criteria = ((interview.assessmentCriteria || []) as { name: string; description: string }[]).map(c => ({
      name: c.name,
      description: c.description
    }));

    if (criteria.length < 3) {
      const defaults = [
        { name: "Analytical Thinking", description: "Logical reasoning and ability to break down complex issues." },
        { name: "Technical Communication", description: "Clarity and structure in explaining technical concepts." },
        { name: "Attention to Detail", description: "Precision and diligence in code execution and problem analysis." },
      ];
      for (const def of defaults) {
        if (criteria.length >= 3) break;
        if (!criteria.some((c) => c.name.toLowerCase() === def.name.toLowerCase())) {
          criteria.push(def);
        }
      }
    }
    if (criteria.length > 8) {
      criteria = criteria.slice(0, 8);
    }

    const userMessages = msgs.filter(
      (m) => m.role === "USER" && m.contentType === "TEXT" && (m.content || "").trim().length > 0
    );

    const substantiveWordCount = userMessages
      .map((m) => m.content || "")
      .filter(isSubstantiveAnswer)
      .reduce((acc, text) => acc + text.split(/\s+/).filter(Boolean).length, 0);


    const whiteboardDrawingsRaw = msgs
      .filter((m) => m.contentType === "WHITEBOARD" && m.whiteboardData)
      .map((m) => ({
        label: (m.whiteboardData?.label as string) || "Untitled Drawing",
        imageDataUrl: m.whiteboardImageUrl ?? null,
      }));

    const whiteboardDrawings = await Promise.all(
      whiteboardDrawingsRaw.map(async (d) => ({
        ...d,
        imageDataUrl: d.imageDataUrl
          ? await svgDataUrlToPng(d.imageDataUrl)
          : null,
      })),
    );

    const codeSnippetsInput = msgs
      .filter((m) => m.contentType === "CODE" && m.whiteboardData)
      .map((m) => ({
        label: (m.whiteboardData?.label as string) || "Untitled Snippet",
        code: (m.whiteboardData?.code as string) || "",
        language: (m.whiteboardData?.language as string) || "plaintext",
      }))
      .filter((s) => s.code.trim().length > 0);

    const targetModel = project?.defaultLlmModel ?? REPORT_MODEL;
    const provider = getProvider(targetModel);
    const textMessages = msgs
      .filter((m) => m.contentType === "TEXT")
      .map((m) => ({ role: m.role, content: m.content }));
    const drawingsInput =
      whiteboardDrawings.length > 0 ? whiteboardDrawings : null;
    const codeInput = codeSnippetsInput.length > 0 ? codeSnippetsInput : null;

    const participantMetadata =
      (interviewSession.participantMetadata as Record<string, unknown> | null) ??
      null;
    const faceAnalysis = buildFaceAnalysisInput(participantMetadata);

    const messages = buildSummaryPrompt(
      interview.title,
      textMessages,
      interview.objective,
      criteria,
      interview.questions,
      interview.language,
      drawingsInput,
      codeInput,
      faceAnalysis,
    );

    const hasInsufficientData =
      substantiveWordCount === 0 &&
      codeSnippetsInput.length === 0 &&
      whiteboardDrawings.length === 0;

    if (hasInsufficientData) {
      log.info(`Skipping LLM for session ${sessionId}: no substantive candidate response`);
    }

    const parsed = hasInsufficientData
      ? buildInsufficientDataReport(interview.questions ?? [], criteria ?? [])
      : await (async () => {
          let lastError: unknown;
          for (let attempt = 1; attempt <= LLM_MAX_ATTEMPTS; attempt++) {
            let response;
            try {
              log.info(
                "Using provider:",
                provider.id,
                "Model:",
                targetModel,
                `attempt ${attempt}/${LLM_MAX_ATTEMPTS}`,
              );
              response = await withTimeout(
                provider.generateResponse({
                  messages,
                  temperature: 0.3,
                  maxTokens: 8192,
                  model: targetModel,
                }),
                LLM_TIMEOUT_MS,
              );
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
                  interview.title,
                  textMessages,
                  interview.objective,
                  criteria,
                  interview.questions,
                  interview.language,
                  textOnlyDrawings,
                  codeInput,
                  faceAnalysis,
                );
                response = await withTimeout(
                  provider.generateResponse({
                    messages: fallbackMessages,
                    temperature: 0.3,
                    maxTokens: 8192,
                    model: targetModel,
                  }),
                  LLM_TIMEOUT_MS,
                );
              } else {
                throw err;
              }
            }

            try {
              return extractJson(response.content);
            } catch (parseErr) {
              lastError = parseErr;
              log.error(
                `JSON parse failed on attempt ${attempt}/${LLM_MAX_ATTEMPTS}:`,
                parseErr,
              );
              if (attempt < LLM_MAX_ATTEMPTS) {
                log.info("Retrying LLM call after JSON parse failure...");
                continue;
              }
            }
          }
          throw lastError;
        })();

    const enriched = enrichInsightsFromMetadata(
      parsed as Record<string, unknown>,
      participantMetadata,
      interview.questions,
      interviewSession.startedAt ?? null,
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
    if (enriched.behavioralAnalysis) {
      insightsData.behavioralAnalysis = enriched.behavioralAnalysis;
    }
    if (enriched.big5Personality) {
      insightsData.big5Personality = enriched.big5Personality;
    }
    if ((enriched as any).codeEvaluations) {
      insightsData.codeEvaluations = (enriched as any).codeEvaluations;
    }

    const { error: updateError } = await supabaseAdmin
      .from("sessions")
      .update({
        summary: String(enriched.summary ?? ""),
        themes: (enriched.themes as string[]) ?? [],
        sentiment: enriched.sentiment ?? null,
        insights: insightsData,
      })
      .eq("id", sessionId);

    if (updateError) {
      throw new Error(`Failed to persist analysis: ${updateError.message}`);
    }

    return NextResponse.json(enriched);
  } catch (error) {
    log.error("Summary generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
