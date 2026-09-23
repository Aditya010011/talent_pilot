import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { getAuthUser } from "@/lib/auth";
import { resolveAvatarVoice } from "@/lib/avatar-voices";
import {
  getPregenerateInitialCreditCost,
  PREGENERATE_QUESTION_CREDIT_COST,
  deductInterviewOwnerCredits,
  InsufficientCreditsError,
} from "@/lib/pregenerate-credits";
import {
  pregenerateInterviewVideos,
  startPregenerateInterviewVideos,
  type PregenerateTarget,
  type QuestionInput,
} from "@/lib/pregenerate-videos";
import { loadCreditRates } from "@/lib/load-credit-rates";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolvePublicAssetUrl, resolveViduAvatarUrl } from "@/lib/vidu-client";

const log = createLogger("pregenerate");

export const maxDuration = 800;

function creditCostForTarget(
  target: PregenerateTarget,
  durationMinutes?: number | null,
  rates?: Awaited<ReturnType<typeof loadCreditRates>>,
): number {
  if (target.type === "all") return getPregenerateInitialCreditCost(durationMinutes, rates);
  if (target.type === "question") return PREGENERATE_QUESTION_CREDIT_COST;
  return 0;
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      interviewId,
      avatarUrl,
      questions,
      wait = false,
      target,
      introText,
      outroText,
    } = body as {
      interviewId?: string;
      avatarUrl?: string;
      questions?: Array<string | QuestionInput>;
      wait?: boolean;
      target?: any;
      introText?: string;
      outroText?: string;
    };

    if (!interviewId) {
      return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });
    }

    let targetRecord: {
      id: string;
      userId: string;
      is_voice_only: boolean;
      language?: string | null;
      avatarImageUrl?: string | null;
      avatarVoice?: string | null;
      timeLimitMinutes?: number | null;
      organizationId?: string | null;
      dbTable: "interviews" | "trainings";
    } | null = null;

    const { data: interview } = await supabaseAdmin
      .from("interviews")
      .select("id, userId, is_voice_only, language, avatarImageUrl, avatarVoice, timeLimitMinutes, projectId")
      .eq("id", interviewId)
      .maybeSingle();

    if (interview) {
      let organizationId: string | null = null;
      if (interview.projectId) {
        const { data: proj } = await supabaseAdmin
          .from("projects")
          .select("organizationId")
          .eq("id", interview.projectId)
          .maybeSingle();
        organizationId = proj?.organizationId ?? null;
      }
      targetRecord = { ...interview, organizationId, dbTable: "interviews" };
    } else {
      const { data: training } = await supabaseAdmin
        .from("trainings")
        .select("id, userId, language, avatarImageUrl, avatarVoice, timeLimitMinutes, organizationId")
        .eq("id", interviewId)
        .maybeSingle();
      if (training) {
        // Coaching spend uses the same org credit pool as interviews
        const { data: org } = await supabaseAdmin
          .from("organizations")
          .select("coachingEnabled")
          .eq("id", training.organizationId)
          .maybeSingle();
        if (!org?.coachingEnabled) {
          return NextResponse.json(
            { error: "Coaching is not enabled for this organization." },
            { status: 403 },
          );
        }
        targetRecord = {
          ...training,
          is_voice_only: true, // Coaching mode is always voice/video clip playback
          dbTable: "trainings",
        };
      }
    }

    if (!targetRecord) {
      return NextResponse.json({ error: "Interview or Training not found" }, { status: 404 });
    }

    if (!targetRecord.is_voice_only) {
      return NextResponse.json(
        { error: "Pregeneration is only available for non-interactive interviews or coaching." },
        { status: 400 },
      );
    }

    let resolvedQuestions = questions || [];

    // If questions were not provided in body, load from interview_contents / DB
    if (!Array.isArray(resolvedQuestions) || resolvedQuestions.length === 0) {
      const { data: contents } = await supabaseAdmin
        .from("interview_contents")
        .select("id, question, order")
        .eq("interview_id", interviewId)
        .order("order", { ascending: true });

      if (contents && contents.length > 0) {
        resolvedQuestions = contents.map((c) => ({
          id: c.id,
          text: c.question,
          order: c.order,
        }));
      }
    }

    const resolvedTarget: PregenerateTarget =
      !target || target === "all"
        ? { type: "all" }
        : target === "stale_or_missing"
          ? { type: "stale_or_missing" }
          : target === "intro"
            ? { type: "intro" }
            : target === "outro"
              ? { type: "outro" }
              : target === "headNod"
                ? { type: "headNod" }
                : target;

    const isSingleClipTarget =
      typeof resolvedTarget === "object" &&
      ["intro", "outro", "headNod"].includes((resolvedTarget as any).type);

    if (!isSingleClipTarget && (!Array.isArray(resolvedQuestions) || resolvedQuestions.length === 0)) {
      return NextResponse.json(
        { error: "Missing required fields: interviewId, questions" },
        { status: 400 },
      );
    }

    // Use targetRecord (works for both interviews AND trainings — interview may be null for trainings)
    const recordRow = targetRecord;

    // Server-side charge from interview duration — never trust client-provided cost.
    // Non-interactive / coaching full pregen uses the configured Non-interactive rate.
    const creditRates = await loadCreditRates();
    const creditCost = creditCostForTarget(
      resolvedTarget,
      recordRow.timeLimitMinutes,
      creditRates,
    );
    if (creditCost > 0) {
      await deductInterviewOwnerCredits(
        recordRow.userId,
        creditCost,
        recordRow.organizationId,
      );
    }

    const rawAvatar =
      avatarUrl || recordRow.avatarImageUrl || null;
    const resolvedAvatarUrl = rawAvatar
      ? resolvePublicAssetUrl(rawAvatar)
      : resolveViduAvatarUrl();
    const language = recordRow.language || "en";
    const voice = resolveAvatarVoice(recordRow.avatarVoice);
    log.info("Pregeneration requested", {
      interviewId,
      questionCount: resolvedQuestions.length,
      wait,
      target: resolvedTarget,
      creditCost,
      avatarUrl: resolvedAvatarUrl,
      language,
      voice,
    });

    const params = {
      interviewId,
      avatarUrl: resolvedAvatarUrl,
      questions: resolvedQuestions,
      target: resolvedTarget,
      language,
      voice,
      dbTable: recordRow.dbTable,
      introText,
      outroText,
    };

    if (wait) {
      const videos = await pregenerateInterviewVideos(params);
      return NextResponse.json({ success: true, videos, creditCost });
    }

    import("@vercel/functions").then(({ waitUntil }) => {
      waitUntil(
        pregenerateInterviewVideos(params).catch((err) => {
          log.error("Background pregeneration failed", { error: String(err) });
        })
      );
    });

    return NextResponse.json({
      success: true,
      message: "Generation started in background",
      creditCost,
    });
  } catch (error: unknown) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    const message = error instanceof Error ? error.message : String(error);
    log.error("Pregeneration error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
