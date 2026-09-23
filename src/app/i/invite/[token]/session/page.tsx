"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { AntiCheatingGuard } from "@/components/session/anti-cheating-banner";
import { IntervieweeOnboarding } from "@/components/session/interviewee-onboarding";
import { PreparingScreen } from "@/components/session/preparing-screen";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc/client";
import { CheckCircle2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  shouldBlockSessionForLocalization,
  shouldRestartQuestionLocalization,
} from "@/lib/simli-session";
import {
  interviewAllowsCandidateLanguageChoice,
  resolveSessionLanguage,
} from "@/lib/languages";
import { interviewSimliFaceId } from "@/lib/simli-face";

const ChatInterface = dynamic(
  () => import("@/components/session/chat-interface").then((m) => m.ChatInterface),
  { ssr: false, loading: () => <PreparingScreen /> },
);
const VoiceInterface = dynamic(
  () => import("@/components/session/voice-interface").then((m) => m.VoiceInterface),
  { ssr: false, loading: () => <PreparingScreen /> },
);
const PregeneratedInterface = dynamic(
  () => import("@/components/session/pregenerated-interface").then((m) => m.PregeneratedInterface),
  { ssr: false, loading: () => <PreparingScreen /> },
);

import { hasUsablePregeneratedVideos, resolvePlaybackClips } from "@/lib/pregenerated-videos";

function hasReadyPregeneratedVideos(
  value: unknown,
  questions?: Array<{ id: string; text?: string; order?: number }>,
): boolean {
  return hasUsablePregeneratedVideos(value, questions);
}

export default function InviteSessionPage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();

  const [completed, setCompleted] = useState(false);
  const [completionReason, setCompletionReason] = useState<string | undefined>();
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [sessionLanguage, setSessionLanguage] = useState<string | null>(null);
  const [localizedQuestions, setLocalizedQuestions] = useState<any[] | null>(null);
  const [isLocalizingQuestions, setIsLocalizingQuestions] = useState(false);
  const [localizedForLanguage, setLocalizedForLanguage] = useState<string | null>(null);
  const [sessionUiMounted, setSessionUiMounted] = useState(false);

  const handleComplete = (reason?: string) => {
    setCompletionReason(reason);
    setCompleted(true);
  };

  const candidate = trpc.candidate.getByToken.useQuery(
    { token },
    { retry: false },
  );

  useEffect(() => {
    if (candidate.isError) {
      router.replace(`/i/invite/${token}`);
    }
    if (candidate.data) {
      const session = (candidate.data as any).session;
      if (!session) {
        router.replace(`/i/invite/${token}`);
      }
    }
  }, [candidate.data, candidate.isError, token, router]);

  const session = (candidate.data as any)?.session;
  const interview = (candidate.data as any)?.interview;

  const multilingualEnabled =
    !!interview?.multilingualEnabled &&
    interviewAllowsCandidateLanguageChoice(interview ?? {});
  const effectiveLanguage = resolveSessionLanguage(
    sessionLanguage ?? session?.language,
    interview?.language,
  );
  const baseInterviewLanguage = resolveSessionLanguage(undefined, interview?.language);
  const needsQuestionLocalization = multilingualEnabled && effectiveLanguage !== baseInterviewLanguage;

  useEffect(() => {
    if (!onboardingDone || !session?.id || !needsQuestionLocalization) {
      return;
    }
    if (!shouldRestartQuestionLocalization(
      needsQuestionLocalization,
      effectiveLanguage,
      localizedForLanguage,
    )) {
      return;
    }

    let cancelled = false;
    setIsLocalizingQuestions(true);
    void fetch("/api/session/localized-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, language: effectiveLanguage }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("question localization failed");
        return (await res.json()) as { questions?: any[] };
      })
      .then((payload) => {
        if (cancelled) return;
        setLocalizedQuestions(Array.isArray(payload.questions) ? payload.questions : []);
        setLocalizedForLanguage(effectiveLanguage);
      })
      .catch(() => {
        if (!cancelled) setLocalizedQuestions(null);
      })
      .finally(() => {
        if (!cancelled) setIsLocalizingQuestions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveLanguage, localizedForLanguage, needsQuestionLocalization, onboardingDone, session?.id]);

  const runtimeQuestions = useMemo(() => {
    const fallback = (interview?.questions ?? []) as any[];
    if (!needsQuestionLocalization || !localizedQuestions?.length) return fallback;
    const byId = new Map(localizedQuestions.map((q) => [q.id, q]));
    return fallback.map((q) => {
      const localized = byId.get(q.id);
      return localized
        ? {
            ...q,
            text: localized.text ?? q.text,
            description: localized.description ?? q.description,
            options: localized.options ?? q.options,
          }
        : q;
    });
  }, [interview?.questions, localizedQuestions, needsQuestionLocalization]);

  const waitingForFirstLocalization =
    needsQuestionLocalization && !localizedForLanguage;
  const blockSessionForLocalization = shouldBlockSessionForLocalization(
    isLocalizingQuestions,
    sessionUiMounted,
    waitingForFirstLocalization,
  );

  useEffect(() => {
    if (onboardingDone && !blockSessionForLocalization) {
      setSessionUiMounted(true);
    }
  }, [onboardingDone, blockSessionForLocalization]);

  if (candidate.isLoading || !candidate.data || !session || !interview) {
    return <PreparingScreen />;
  }

  if (completed || session.status === "COMPLETED") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-secondary-500" />
            <h2 className="mt-4 text-2xl font-bold">Thank you!</h2>
            {completionReason === "TIME_LIMIT_EXCEEDED" && (
              <p className="mt-2 text-sm text-amber-600">
                The session time limit has been reached and the interview was ended automatically.
              </p>
            )}
            <p className="mt-2 text-muted-foreground">
              Your interview has been completed successfully. We appreciate your
              time and thoughtful responses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!onboardingDone) {
    return (
      <IntervieweeOnboarding
        sessionId={session.id}
        interviewTitle={interview.title}
        interviewDescription={interview.description}
        questionCount={interview.questions?.length ?? 0}
        timeLimitMinutes={interview.timeLimitMinutes}
        language={effectiveLanguage}
        multilingualEnabled={multilingualEnabled}
        antiCheatingEnabled={!!interview.antiCheatingEnabled}
        voiceEnabled={true}
        chatEnabled={!!interview.chatEnabled}
        whiteboardEnabled={interview.whiteboardEnabled !== false}
        codeEnabled={interview.codeEnabled !== false}
        aiName={interview.aiName}
        questionTypes={(interview.questions ?? []).map((q: any) => q.type as string)}
        onComplete={(_name, lang) => {
          if (lang) setSessionLanguage(lang);
          setOnboardingDone(true);
        }}
      />
    );
  }

  const interviewContext = {
    title: interview.title,
    objective: interview.objective,
    aiName: interview.aiName,
    aiTone: interview.aiTone,
    language: effectiveLanguage,
    followUpDepth: interview.followUpDepth,
    isVoiceOnly: interview.is_voice_only,
    questionsAsked: session.questionsAsked || [],
    timeLimitMinutes: interview.timeLimitMinutes ?? null,
    questions: runtimeQuestions.map((q: any) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      description: q.description,
      options: q.options,
      starterCode: q.starterCode as { language: string; code: string } | null,
      order: q.order,
    })),
  };

  if (blockSessionForLocalization) {
    return <PreparingScreen />;
  }

  if (interview.is_voice_only) {
    const videos = interview.pregenerated_videos;
    const questionMeta = (runtimeQuestions || []).map((q: any) => ({
      id: q.id as string,
      text: q.text as string,
      order: q.order as number,
    }));
    const playback = resolvePlaybackClips(videos, questionMeta);
    if (!hasReadyPregeneratedVideos(videos, questionMeta) || !playback) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="py-12 text-center space-y-2">
              <h2 className="text-xl font-bold">Interview videos are still preparing</h2>
              <p className="text-sm text-muted-foreground">
                Please check back shortly. The AI interviewer clips are being generated.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <>
        <AntiCheatingGuard enabled={!!interview.antiCheatingEnabled} sessionId={session.id} />
        <PregeneratedInterface
          sessionId={session.id}
          interviewId={interview.id}
          interviewTitle={interview.title}
          aiName={interview.aiName}
          interviewContext={interviewContext}
          pregeneratedVideos={{
            intro: playback.intro,
            questions: playback.questions,
            outro: playback.outro || "",
            headNod: playback.headNod || undefined,
          }}
          durationMinutes={interview.timeLimitMinutes ?? undefined}
          whiteboardEnabled={interview.whiteboardEnabled !== false}
          codeEnabled={interview.codeEnabled !== false}
          onComplete={() => handleComplete()}
        />
      </>
    );
  }

  const useVoice = !!(interview.voiceEnabled ?? true);

  if (useVoice) {
    return (
      <>
        <AntiCheatingGuard enabled={!!interview.antiCheatingEnabled} sessionId={session.id} />
        <VoiceInterface
          sessionId={session.id}
          interviewId={interview.id}
          interviewTitle={interview.title}
          aiName={interview.aiName}
          questionCount={runtimeQuestions.length}
          interviewContext={interviewContext}
          durationMinutes={interview.timeLimitMinutes ?? undefined}
          chatEnabled={!!interview.chatEnabled}
          whiteboardEnabled={interview.whiteboardEnabled !== false}
          codeEnabled={interview.codeEnabled !== false}
          onComplete={handleComplete}
          avatarMode={interview.avatarMode ?? "none"}
          simliFaceId={interviewSimliFaceId(interview as Record<string, unknown>)}
        />
      </>
    );
  }

  return (
    <>
      <AntiCheatingGuard enabled={!!interview.antiCheatingEnabled} sessionId={session.id} />
      <ChatInterface
        sessionId={session.id}
        interview={{
          ...interview,
          language: effectiveLanguage,
          questions: runtimeQuestions.map((q: any) => ({
            ...q,
            starterCode: q.starterCode as { language: string; code: string } | null,
          })),
        }}
        durationMinutes={interview.timeLimitMinutes ?? undefined}
        onComplete={handleComplete}
      />
    </>
  );
}
