import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { localizeInterviewQuestions } from "@/lib/interview-localization";
import { resolveSessionLanguage } from "@/lib/languages";
import { supabaseAdmin } from "@/lib/supabase/admin";

const log = createLogger("api/session/localized-questions");

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    const requestedLanguage =
      typeof body?.language === "string" ? body.language : undefined;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .select("id, language, interview:interviews!inner(language, multilingualEnabled, questions(*))")
      .eq("id", sessionId)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const interview = session.interview as {
      language?: string | null;
      multilingualEnabled?: boolean | null;
      questions?: Array<{
        id: string;
        text: string;
        description?: string | null;
        options?: unknown;
        type?: string;
        order?: number;
      }>;
    };

    const questions = (interview.questions ?? []).slice().sort((a, b) => {
      const ao = typeof a.order === "number" ? a.order : 0;
      const bo = typeof b.order === "number" ? b.order : 0;
      return ao - bo;
    });

    const effectiveLanguage = resolveSessionLanguage(
      requestedLanguage ?? session.language,
      interview.language,
    );

    const localized = await localizeInterviewQuestions({
      sessionId: session.id,
      multilingualEnabled: interview.multilingualEnabled,
      interviewLanguage: interview.language,
      sessionLanguage: effectiveLanguage,
      questions,
    });

    return NextResponse.json({ language: effectiveLanguage, questions: localized });
  } catch (err) {
    log.error("Failed to localize questions", err);
    return NextResponse.json(
      { error: "Failed to localize questions" },
      { status: 500 },
    );
  }
}
