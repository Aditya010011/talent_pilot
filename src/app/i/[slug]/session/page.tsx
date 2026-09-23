"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { AntiCheatingGuard } from "@/components/session/anti-cheating-banner";
import { IntervieweeOnboarding, PreviewWrapper } from "@/components/session/interviewee-onboarding";
import { IntervieweeTourOverlay } from "@/components/session/interviewee-tour-overlay";
import { IntervieweeTourProvider } from "@/components/session/interviewee-tour-provider";
import { PreparingScreen } from "@/components/session/preparing-screen";
import { Card, CardContent } from "@/components/ui/card";
import type { InterviewContext } from "@/hooks/use-voice";
import { trpc } from "@/lib/trpc/client";
import { CheckCircle2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  hasUsablePregeneratedVideos,
  resolvePlaybackClips,
} from "@/lib/pregenerated-videos";
import { interviewSimliFaceId } from "@/lib/simli-face";
import {
  shouldBlockSessionForLocalization,
  shouldRestartQuestionLocalization,
} from "@/lib/simli-session";
import {
  interviewAllowsCandidateLanguageChoice,
  resolveSessionLanguage,
} from "@/lib/languages";

const STORAGE_PREFIX = "inluwa_session_";

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

export default function SlugSessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  const sidParam = searchParams.get("sid");
  const isPreview = searchParams.get("preview") === "true";

  const [completed, setCompleted] = useState(false);
  const [completionReason, setCompletionReason] = useState<string | undefined>();
  const [onboardingDone, setOnboardingDone] = useState(isPreview);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [sessionLanguage, setSessionLanguage] = useState<string | null>(null);
  const [localizedQuestions, setLocalizedQuestions] = useState<any[] | null>(null);
  const [isLocalizingQuestions, setIsLocalizingQuestions] = useState(false);
  const [localizedForLanguage, setLocalizedForLanguage] = useState<string | null>(null);
  const [sessionUiMounted, setSessionUiMounted] = useState(false);

  const handleComplete = (reason?: string) => {
    setCompletionReason(reason);
    setCompleted(true);
  };

  const handleTourReady = useCallback(() => {}, []);

  const sessionId = useMemo(() => {
    if (sidParam) return sidParam;
    try { return localStorage.getItem(STORAGE_PREFIX + slug); } catch { return null; }
  }, [sidParam, slug]);

  const interview = trpc.interview.getBySlug.useQuery({ slug }, { retry: false });
  const session = trpc.session.getById.useQuery(
    { id: sessionId! },
    { enabled: !!sessionId, retry: false },
  );

  useEffect(() => {
    if (!sessionId || session.isError) {
      router.replace(`/i/${slug}`);
    }
  }, [sessionId, session.isError, slug, router]);


  const antiCheatingEnabled = !isPreview && !!interview.data?.antiCheatingEnabled;
  const multilingualEnabled =
    !!interview.data?.multilingualEnabled &&
    interviewAllowsCandidateLanguageChoice(interview.data);
  const effectiveLanguage = resolveSessionLanguage(
    sessionLanguage ?? (session.data as { language?: string | null } | undefined)?.language,
    interview.data?.language,
  );
  const baseInterviewLanguage = resolveSessionLanguage(undefined, interview.data?.language);
  const needsQuestionLocalization = multilingualEnabled && effectiveLanguage !== baseInterviewLanguage;

  useEffect(() => {
    if (
      !onboardingDone ||
      !sessionId ||
      !needsQuestionLocalization
    ) {
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
      body: JSON.stringify({ sessionId, language: effectiveLanguage }),
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
  }, [effectiveLanguage, localizedForLanguage, needsQuestionLocalization, onboardingDone, sessionId]);

  const runtimeQuestions = useMemo(() => {
    const fallback = (interview.data?.questions ?? []) as any[];
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
  }, [interview.data?.questions, localizedQuestions, needsQuestionLocalization]);

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

  if (interview.isLoading || session.isLoading || !interview.data || !session.data) {
    return <PreparingScreen />;
  }

  if (session.data.status === "COMPLETED" || completed) {
    try { localStorage.removeItem(STORAGE_PREFIX + slug); } catch { /* noop */ }
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/50 to-muted p-4 relative overflow-hidden">
        {/* Background ambient light */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        
        <Card className="w-full max-w-lg relative overflow-hidden border-primary/10 shadow-2xl bg-background/60 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-primary/80 via-secondary-500 to-primary/80" />
          <CardContent className="p-8 sm:p-12 text-center relative z-10">
            <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-8 ring-primary/5 shadow-inner">
              <CheckCircle2 className="h-10 w-10 text-primary drop-shadow-sm animate-[checkPop_0.5s_ease-out_forwards]" />
            </div>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground">Interview Complete</h2>
            {completionReason === "TIME_LIMIT_EXCEEDED" && (
              <p className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 py-2 px-4 rounded-full inline-block">
                Time limit reached — session ended automatically
              </p>
            )}
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">
              Thank you for your time and thoughtful responses. Your session has been securely saved.
            </p>

            {session.data.insightsData && (session.data.insightsData as any).overallHirabilityScore !== undefined && (
              <div className="mt-10 rounded-2xl border border-primary/10 bg-card/50 p-6 shadow-sm backdrop-blur-sm transition-all hover:shadow-md">
                <p className="text-xs font-bold uppercase tracking-widest text-primary/80 mb-4">Performance Insight</p>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-sm font-medium text-foreground/80">Overall Hirability</span>
                  <span className={`text-2xl font-black tracking-tighter ${(session.data.insightsData as any).overallHirabilityScore >= 7 ? "text-emerald-500" : (session.data.insightsData as any).overallHirabilityScore >= 4 ? "text-amber-500" : "text-rose-500"}`}>
                    {(session.data.insightsData as any).overallHirabilityScore}/10
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/80 shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${(session.data.insightsData as any).overallHirabilityScore >= 7 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : (session.data.insightsData as any).overallHirabilityScore >= 4 ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-gradient-to-r from-rose-400 to-rose-500"}`}
                    style={{ width: `${((session.data.insightsData as any).overallHirabilityScore / 10) * 100}%` }}
                  />
                </div>
                <p className="mt-4 text-[11px] text-muted-foreground/80 leading-relaxed font-medium">
                  An aggregate evaluation of your communication, responsiveness, and key competencies.
                </p>

                {(session.data.metadata as any).face_analysis_results && (session.data.metadata as any).face_analysis_results.length > 0 && (
                  <div className="mt-6 border-t border-primary/5 pt-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 text-left">Detected Emotions</p>
                    <div className="flex flex-wrap gap-2 justify-start">
                      {Array.from(new Set(((session.data.metadata as any).face_analysis_results as any[]).map(r => r.dominantEmotion).filter(Boolean))).map((emotion: any) => (
                        <span key={emotion} className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary capitalize shadow-sm">
                          {emotion}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }


  // Derive resume state
  const resumeMessages = session.data.messages;
  const resumeQuestionIndex = (() => {
    const { currentQuestionId } = session.data;
    if (currentQuestionId) {
      const idx = runtimeQuestions.findIndex((q: any) => q.id === currentQuestionId);
      if (idx >= 0) return idx;
    }
    return 0;
  })();

  const isResuming = resumeMessages && resumeMessages.length > 0;

  const resumeTextMessages = resumeMessages
    ?.filter((m: any) => m.contentType === "TEXT")
    .map((m: any) => ({ id: m.id, role: m.role, content: m.content }));

  const resumeDrawings = resumeMessages
    ?.filter((m: any) => m.contentType === "WHITEBOARD" && m.whiteboardData)
    .map((m: any) => ({
      id: m.content,
      label: (m.whiteboardData as Record<string, unknown>)?.label as string ?? "Drawing",
      snapshotData: JSON.stringify(m.whiteboardData),
    }));

  const useVoice = !interview.data.is_voice_only; // VoiceInterface for interactive video, PregeneratedInterface for non-interactive
  // Derive avatar mode from interview data (default 'none' for voice-only)
  const avatarMode = ((interview.data as { avatarMode?: string }).avatarMode ?? "none") as "none" | "static" | "simli" | "vidu";
  const pregeneratedRaw = (interview.data as { pregenerated_videos?: unknown }).pregenerated_videos;
  const questionMeta = (runtimeQuestions || []).map((q: any) => ({
    id: q.id as string,
    text: q.text as string,
    order: q.order as number,
  }));
  const playbackClips = resolvePlaybackClips(pregeneratedRaw, questionMeta);
  const videosReady = hasUsablePregeneratedVideos(pregeneratedRaw, questionMeta);

  const showPreviewTour = false;

  return (
    <>
      <AntiCheatingGuard 
        enabled={antiCheatingEnabled && onboardingDone} 
        sessionId={sessionId!} 
      />
      {showPreviewTour ? (
        (() => {
          const mode = useVoice ? "voice" : "chat";
          const mockContext: InterviewContext = {
            title: interview.data.title,
            aiName: interview.data.aiName ?? "AI Interviewer",
            aiTone: "professional",
            language: effectiveLanguage,
            followUpDepth: "medium",
            isVoiceOnly: interview.data.is_voice_only,
            questions: runtimeQuestions.map((q: any, i: number) => ({
              text: q.text,
              type: q.type as string,
              order: i,
            })),
          };

          return (
            <IntervieweeTourProvider mode={mode}>
              <PreviewWrapper onReady={handleTourReady}>
                {mode === "voice" ? (
                  <VoiceInterface
                    sessionId="__preview__"
                    interviewId="__preview__"
                    interviewTitle={interview.data.title}
                    aiName={interview.data.aiName ?? "AI Interviewer"}
                    questionCount={runtimeQuestions.length}
                    interviewContext={mockContext}
                    durationMinutes={interview.data.timeLimitMinutes ?? undefined}
                    chatEnabled={!!interview.data.chatEnabled}
                    whiteboardEnabled={interview.data.whiteboardEnabled !== false}
                    codeEnabled={interview.data.codeEnabled !== false}
                    onComplete={() => {}}
                    preview
                  />
                ) : (
                  <ChatInterface
                    sessionId="__preview__"
                    interview={{
                      id: "__preview__",
                      title: interview.data.title,
                      aiName: interview.data.aiName ?? "AI Interviewer",
                      mode: "CHAT",
                      questions: mockContext.questions.map((q, i) => ({
                        id: `preview-q-${i}`,
                        text: q.text,
                        type: q.type,
                      })),
                    }}
                    durationMinutes={interview.data.timeLimitMinutes ?? undefined}
                    onComplete={() => {}}
                    preview
                  />
                )}
              </PreviewWrapper>
              <IntervieweeTourOverlay />
            </IntervieweeTourProvider>
          );
        })()
      ) : !onboardingDone ? (
        <IntervieweeOnboarding
          sessionId={sessionId!}
          interviewTitle={interview.data.title}
          interviewDescription={interview.data.description}
          questionCount={runtimeQuestions.length}
          timeLimitMinutes={interview.data.timeLimitMinutes}
          language={effectiveLanguage}
          multilingualEnabled={multilingualEnabled}
          antiCheatingEnabled={antiCheatingEnabled}
          voiceEnabled={true}
          chatEnabled={true}
          whiteboardEnabled={interview.data.whiteboardEnabled !== false}
          codeEnabled={interview.data.codeEnabled !== false}
          aiName={interview.data.aiName}
          questionTypes={runtimeQuestions.map((q: any) => q.type as string)}
          initialParticipantName={session.data?.participantName}
          onComplete={(name, lang) => {
            if (name) setParticipantName(name);
            if (lang) setSessionLanguage(lang);
            setOnboardingDone(true);
          }}
        />
      ) : blockSessionForLocalization ? (
        <PreparingScreen />
      ) : useVoice ? (
        (() => {
          const interviewContext = {
            title: interview.data.title,
            objective: interview.data.objective,
            aiName: interview.data.aiName,
            participantName: participantName || session.data?.participantName,
            aiTone: interview.data.aiTone,
            language: effectiveLanguage,
            followUpDepth: interview.data.followUpDepth,
            isVoiceOnly: interview.data.is_voice_only,
            startQuestionIndex: isResuming ? resumeQuestionIndex : undefined,
            questionsAsked: session.data?.questionsAsked || [],
            timeLimitMinutes: interview.data.timeLimitMinutes ?? null,
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

          return (
            <VoiceInterface
              sessionId={sessionId!}
              interviewId={interview.data.id}
              interviewTitle={interview.data.title}
              aiName={interview.data.aiName}
              questionCount={runtimeQuestions.length}
              interviewContext={interviewContext}
              durationMinutes={interview.data.timeLimitMinutes ?? undefined}
              initialMessages={isResuming ? resumeTextMessages : undefined}
              initialDrawings={isResuming && resumeDrawings?.length ? resumeDrawings : undefined}
              chatEnabled={!!interview.data.chatEnabled}
              whiteboardEnabled={interview.data.whiteboardEnabled !== false}
              codeEnabled={interview.data.codeEnabled !== false}
              onComplete={handleComplete}
              avatarMode={avatarMode}
              preview={isPreview}
              simliFaceId={interviewSimliFaceId(interview.data as Record<string, unknown>)}
            />
          );
        })()
      ) : interview.data.is_voice_only ? (
        (() => {
          if (!videosReady) {
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

          const interviewContext = {
            title: interview.data.title,
            objective: interview.data.objective,
            aiName: interview.data.aiName,
            participantName: participantName || session.data?.participantName,
            aiTone: interview.data.aiTone,
            language: effectiveLanguage,
            followUpDepth: interview.data.followUpDepth,
            isVoiceOnly: interview.data.is_voice_only,
            startQuestionIndex: isResuming ? resumeQuestionIndex : undefined,
            questions: runtimeQuestions.map((q: any) => ({
              text: q.text,
              type: q.type,
              description: q.description,
              options: q.options,
              starterCode: q.starterCode as { language: string; code: string } | null,
              order: q.order,
            })),
          };

          return (
            <PregeneratedInterface
              sessionId={sessionId!}
              interviewId={interview.data.id}
              interviewTitle={interview.data.title}
              aiName={interview.data.aiName}
              interviewContext={interviewContext}
              pregeneratedVideos={{
                intro: playbackClips!.intro,
                questions: playbackClips!.questions,
                outro: playbackClips!.outro || "",
                headNod: playbackClips!.headNod || undefined,
              }}
              durationMinutes={interview.data.timeLimitMinutes ?? undefined}
              whiteboardEnabled={interview.data.whiteboardEnabled !== false}
              codeEnabled={interview.data.codeEnabled !== false}
              isPreview={isPreview}
              onComplete={() => handleComplete()}
            />
          );
        })()
      ) : (
        <ChatInterface
          sessionId={sessionId!}
          interview={{
            ...interview.data,
            language: effectiveLanguage,
            questions: runtimeQuestions.map((q: any) => ({
              ...q,
              starterCode: q.starterCode as { language: string; code: string } | null,
            })),
          }}
          durationMinutes={interview.data.timeLimitMinutes ?? undefined}
          initialMessages={resumeMessages
            ?.filter((m: any) => m.contentType !== "WHITEBOARD")
            .map((m: any) => ({
              id: m.id,
              role: m.role as "USER" | "ASSISTANT" | "SYSTEM",
              content: m.content,
              timestamp: m.timestamp.toString(),
            }))}
          initialQuestionIndex={isResuming ? resumeQuestionIndex : undefined}
          onComplete={handleComplete}
        />
      )}
    </>
  );
}
