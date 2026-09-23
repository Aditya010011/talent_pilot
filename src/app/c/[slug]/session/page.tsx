"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { PreparingScreen } from "@/components/session/preparing-screen";
import { CoachingChatbot } from "@/components/coaching/coaching-chatbot";
import { Brain, CheckCircle2, ChevronLeft, ChevronRight, Play, Pause, Volume2, Layers, Star, HelpCircle, Check, Loader2, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  hasCoachingQuizResults,
  isCoachingFullyComplete,
  isCoachingQuizEnabled,
} from "@/lib/coaching-status";
import { resolveSessionLanguage } from "@/lib/languages";
import { SlideMediaOverlay } from "@/components/coaching/slide-media-overlay";
import { isVideoMediaSlide } from "@/lib/slide-media";

const STORAGE_KEY = "inluwa_coaching_session_";

const navyDark = "hsl(214 80% 18%)";
const navyMid  = "hsl(214 70% 32%)";
const navyLight = "hsl(214 55% 96%)";

export default function CoachingSessionPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();

  const [completed, setCompleted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showAvatar, setShowAvatar] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);
  const [slideAspectRatio, setSlideAspectRatio] = useState(16 / 9);

  // Localized (translated) slides — populated when session language ≠ training language
  const [localizedSlides, setLocalizedSlides] = useState<any[] | null>(null);
  const [isLocalizing, setIsLocalizing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const playGenRef = useRef(0);
  const slidesRef = useRef<any[]>([]);
  const progressReadyRef = useRef(false);
  const [progressReady, setProgressReady] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [completedSlides, setCompletedSlides] = useState<Record<number, boolean>>({});

  // Quiz States
  const [quizState, setQuizState] = useState<"not_started" | "intro" | "in_progress" | "submitted">("not_started");
  const [quizAnswers, setQuizAnswers] = useState<Record<string, any>>({});
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [quizResults, setQuizResults] = useState<any>(null);

  const searchParams = useSearchParams();
  const sidParam = searchParams.get("sid");
  const isPreview = searchParams.get("preview") === "true";

  useEffect(() => {
    try {
      const stored = sidParam || localStorage.getItem(STORAGE_KEY + slug);
      if (stored) {
        setSessionId(stored);
      } else {
        router.replace(`/c/${slug}`);
      }
    } catch {
      router.replace(`/c/${slug}`);
    }
  }, [slug, router, sidParam]);

  const session = trpc.coachingSession.getById.useQuery(
    { id: sessionId! },
    { enabled: !!sessionId, retry: false },
  );

  // In preview mode, we want the deck updates (insert/reorder) to be reflected
  // in the open coaching preview window immediately.
  const liveTraining = trpc.training.getBySlug.useQuery(
    { slug },
    {
      enabled: isPreview,
      retry: false,
      refetchInterval: isPreview ? 1500 : false,
    },
  );

  const coaching = (session.data as any)?.training as {
    id: string;
    title: string;
    aiName?: string;
    language?: string;
    avatarVoice?: string;
    timeLimitMinutes?: number | null;
    pregenerated_videos?: any;
    script_slides?: any[];
    objective?: string | null;
    avatarImageUrl?: string | null;
    avatarMode?: string | null;
  } | undefined;

  const baseLanguage = coaching?.language || "en";
  const avatarMode = coaching?.avatarMode || "vidu";
  const effectiveLanguage = avatarMode !== "none"
    ? baseLanguage
    : resolveSessionLanguage(
        (session.data as { language?: string | null })?.language,
        coaching?.language,
      );

  const isLocalized = effectiveLanguage !== baseLanguage;

  const liveSlides = isPreview ? (liveTraining.data as any)?.script_slides : null;
  const rawSlides: any[] =
    Array.isArray(liveSlides) && liveSlides.length > 0
      ? liveSlides
      : Array.isArray(coaching?.script_slides) && coaching.script_slides.length > 0
        ? coaching.script_slides
        : [{ slide: 1, title: "Training Session", script: "Welcome to this training session.", imageUrl: null }];

  // Use pre-translated slides when available, otherwise fall back to raw slides
  const slides: any[] = localizedSlides ?? rawSlides;
  slidesRef.current = slides;

  // Fetch translated slides when session language differs from training language
  useEffect(() => {
    const sourceLanguage = coaching?.language;
    const targetLanguage = effectiveLanguage;
    if (!coaching || !rawSlides.length) return;
    if (!sourceLanguage && targetLanguage === "en") return; // both default to English
    const resolvedSource = sourceLanguage || "en";
    if (resolvedSource === targetLanguage) return; // same language, no translation needed

    setIsLocalizing(true);
    fetch("/api/coaching/localize-slides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slides: rawSlides,
        sourceLanguage: resolvedSource,
        targetLanguage,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.slides)) {
          setLocalizedSlides(data.slides);
        }
      })
      .catch((err) => console.error("[localize-slides] failed:", err))
      .finally(() => setIsLocalizing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coaching?.language, effectiveLanguage, rawSlides.length]);


  const quizEnabled = isCoachingQuizEnabled(coaching);


  useEffect(() => {
    if (session.data?.training) {
      setShowAvatar(avatarMode !== "none");
    }
  }, [session.data?.training, avatarMode]);

  const goToSlide = (idx: number) => {
    if (idx < 0 || idx >= slides.length) return;
    window.speechSynthesis?.cancel();
    stopNarration();
    setActiveSlide(idx);
    setSlideAspectRatio(16 / 9);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const stopNarration = () => {
    playGenRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.currentTime = 0;
      audio.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsPlayingAudio(false);
  };

  const playNarration = async (slideIndex: number) => {
    const gen = ++playGenRef.current;
    const existing = audioRef.current;
    if (existing) {
      existing.pause();
      existing.onended = null;
      existing.onerror = null;
      existing.currentTime = 0;
      existing.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsPlayingAudio(false);

    const slide = slidesRef.current?.[slideIndex];
    if (isVideoMediaSlide(slide) && !slide.script?.trim()) {
      return;
    }
    if (!slide || !slide.script?.trim()) {
      setCompletedSlides(prev => ({ ...prev, [slideIndex]: true }));
      return;
    }
    try {
      setIsPlayingAudio(true);
      const res = await fetch("/api/coaching/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: slide.script,
          language: effectiveLanguage,
          sourceLanguage: coaching?.language,
          voice: coaching?.avatarVoice,
        }),
      });
      if (gen !== playGenRef.current) return;
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      if (gen !== playGenRef.current) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (gen !== playGenRef.current) return;
        setIsPlayingAudio(false);
        setCompletedSlides(prev => ({ ...prev, [slideIndex]: true }));
      };
      audio.onerror = () => {
        if (gen !== playGenRef.current) return;
        setIsPlayingAudio(false);
        setCompletedSlides(prev => ({ ...prev, [slideIndex]: true }));
      };
      await audio.play();
      if (gen !== playGenRef.current) {
        audio.pause();
        audio.currentTime = 0;
      }
    } catch {
      if (gen !== playGenRef.current) return;
      setIsPlayingAudio(false);
      setCompletedSlides(prev => ({ ...prev, [slideIndex]: true }));
    }
  };

  useEffect(() => {
    if (!progressReady) return;
    if (isLocalizing) return; // wait for translation to finish before narrating
    if ((avatarMode === "none" || isLocalized) && sessionId && slides.length > 0) {
      void playNarration(activeSlide);
    }
    return () => {
      stopNarration();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlide, sessionId, avatarMode, slides.length, progressReady, effectiveLanguage, isLocalizing, isLocalized]);

  useEffect(() => {
    if (!progressReady) return;
    const slide = slides[activeSlide];
    if (!slide || isVideoMediaSlide(slide)) return;
    if (avatarMode === "none" || isLocalized) return;
    if (slide.script?.trim()) return;
    setCompletedSlides((prev) => (prev[activeSlide] ? prev : { ...prev, [activeSlide]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlide, progressReady, avatarMode, slides.length, isLocalized]);

  const completeMutation = trpc.coachingSession.complete.useMutation();
  const updateProgressMutation = trpc.coachingSession.updateProgress.useMutation();
  const submitQuizMutation = trpc.training.submitQuiz.useMutation();

  useEffect(() => {
    if (!session.data || progressReadyRef.current) return;
    const data = session.data as any;
    const progress = data?.metadata?.progress;
    if (progress) {
      if (typeof progress.activeSlide === "number") setActiveSlide(progress.activeSlide);
      if (progress.completedSlides && typeof progress.completedSlides === "object") {
        const restored: Record<number, boolean> = {};
        for (const [k, v] of Object.entries(progress.completedSlides)) {
          restored[Number(k)] = Boolean(v);
        }
        setCompletedSlides(restored);
      }
      if (progress.quizState) setQuizState(progress.quizState);
      if (progress.quizAnswers && typeof progress.quizAnswers === "object") {
        setQuizAnswers(progress.quizAnswers);
      }
      if (typeof progress.activeQuestionIdx === "number") {
        setActiveQuestionIdx(progress.activeQuestionIdx);
      }
      if (progress.timeLeft !== undefined) setTimeLeft(progress.timeLeft);
    }
    const training = data?.training;
    if (
      isCoachingQuizEnabled(training) &&
      (data?.status === "COMPLETED" || progress?.slidesCompleted) &&
      !hasCoachingQuizResults(data) &&
      (!progress?.quizState || progress.quizState === "not_started")
    ) {
      setQuizState("intro");
    }
    progressReadyRef.current = true;
    setProgressReady(true);
  }, [session.data]);

  useEffect(() => {
    if (!sessionId || !progressReadyRef.current || completed) return;
    const slidesCompleted =
      quizState !== "not_started" ||
      (slides.length > 0 && !!completedSlides[slides.length - 1]);
    const completedSlidesStr: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(completedSlides)) {
      completedSlidesStr[String(k)] = v;
    }
    const payload = {
      id: sessionId,
      progress: {
        activeSlide,
        completedSlides: completedSlidesStr,
        slidesCompleted,
        quizState,
        quizAnswers,
        activeQuestionIdx,
        timeLeft,
      },
    };
    const t = setTimeout(() => {
      updateProgressMutation.mutate(payload);
    }, 400);
    const onHide = () => {
      updateProgressMutation.mutate(payload);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pagehide", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionId,
    activeSlide,
    completedSlides,
    quizState,
    quizAnswers,
    activeQuestionIdx,
    timeLeft,
    completed,
    slides.length,
  ]);

  // Timer Effect
  useEffect(() => {
    if (quizState !== "in_progress" || timeLeft === null) return;
    if (timeLeft <= 0) {
      handleQuizSubmit();
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [quizState, timeLeft]);

  const handleComplete = () => {
    const questions = (coaching as any)?.quiz_questions || [];
    if (quizEnabled && questions.length > 0) {
      setQuizState("intro");
      const settings = (coaching as any).quiz_settings || {};
      if (settings.timeLimitOn && settings.timeLimitMinutes) {
        setTimeLeft(settings.timeLimitMinutes * 60);
      }
      if (sessionId) {
        updateProgressMutation.mutate({
          id: sessionId,
          progress: {
            activeSlide,
            slidesCompleted: true,
            quizState: "intro",
            quizAnswers,
            activeQuestionIdx: 0,
            timeLeft:
              settings.timeLimitOn && settings.timeLimitMinutes
                ? settings.timeLimitMinutes * 60
                : null,
          },
        });
      }
    } else {
      if (sessionId) {
        completeMutation.mutate({ id: sessionId });
        try { localStorage.removeItem(STORAGE_KEY + slug); } catch { /* noop */ }
      }
      setCompleted(true);
    }
  };

  const handleQuizSubmit = async () => {
    if (!sessionId) return;
    const formattedAnswers = Object.entries(quizAnswers).map(([qId, val]) => ({
      questionId: qId,
      answer: val,
    }));
    try {
      const res = await submitQuizMutation.mutateAsync({
        sessionId,
        answers: formattedAnswers,
      });
      setQuizResults(res);
      setQuizState("submitted");
      if (res?.passed) {
        try { localStorage.removeItem(STORAGE_KEY + slug); } catch { /* noop */ }
      }
    } catch (err) {
      console.error("Failed to submit quiz:", err);
    }
  };

  if (!sessionId || session.isLoading || !session.data) {
    return <PreparingScreen text="Preparing your coaching..." />;
  }

  // coaching is declared at the top of the component

  const sData = session.data as any;
  const results = quizResults || sData?.quiz_results;
  const fullyComplete = isCoachingFullyComplete(sData, coaching) || (quizState === "submitted" && results?.passed);
  const showCompletedScreen =
    (completed || fullyComplete || (quizState === "submitted" && results?.completed)) &&
    !(quizEnabled && !hasCoachingQuizResults({ quiz_results: results }) && quizState !== "submitted");

  if (showCompletedScreen) {
    if (results && results.completed && results.passed === false) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
          <div className="w-full max-w-2xl text-center space-y-8 bg-white dark:bg-slate-900 p-10 rounded-2xl border-2 border-slate-200/80 shadow-2xl">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50" style={{ boxShadow: "0 0 0 8px rgba(239, 68, 68, 0.1)" }}>
              <HelpCircle className="h-12 w-12 text-red-600 dark:text-red-500" />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-extrabold uppercase tracking-widest text-red-600 dark:text-red-400">Quiz Failed</p>
              <h2 className="text-4xl font-extrabold tracking-tight">Keep Trying!</h2>
              <p className="text-muted-foreground text-base max-w-md mx-auto">
                You scored <strong className="text-foreground text-lg">{results.percentageScore}%</strong>, but the passing score is <strong className="text-foreground text-lg">{results.minPassPercentage}%</strong>.
              </p>
            </div>
 
            <div className="border-t-2 border-slate-100 dark:border-slate-800 pt-8 mt-8 space-y-6">
              <h3 className="font-extrabold text-xl text-foreground">Quiz Performance Summary</h3>
              <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto">
                <div className="bg-slate-50/50 dark:bg-slate-950 p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-muted-foreground uppercase font-black tracking-wider">Objective Score</p>
                  <p className="text-3xl font-extrabold text-[#1b2a4a] dark:text-blue-300 mt-2">{results.score || "0/0"}</p>
                </div>
                <div className="bg-slate-50/50 dark:bg-slate-950 p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-muted-foreground uppercase font-black tracking-wider">Short Answer Avg</p>
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <span className="text-3xl font-extrabold text-amber-500">{results.shortAnswerAverage || 0}</span>
                    <Star className="h-6 w-6 fill-amber-500 text-amber-500" />
                  </div>
                </div>
              </div>
              
              <div className="pt-6">
                <Button
                  onClick={() => {
                    setQuizState("intro");
                    setQuizAnswers({});
                    setActiveQuestionIdx(0);
                    setTimeLeft(null);
                    setCompleted(false);
                    setQuizResults(null);
                  }}
                  className="w-full max-w-sm h-12 text-white font-bold rounded-xl bg-[#1b2a4a] hover:bg-[#15233e] border-0"
                >
                  Retry Quiz
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }
 
    try { localStorage.removeItem(STORAGE_KEY + slug); } catch { /* noop */ }
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-2xl text-center space-y-8 bg-white dark:bg-slate-900 p-10 rounded-2xl border-2 border-slate-200/80 shadow-2xl">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50" style={{ boxShadow: "0 0 0 8px rgba(16, 185, 129, 0.1)" }}>
            <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-500" />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Coaching Completed</p>
            <h2 className="text-4xl font-extrabold tracking-tight">Congratulations!</h2>
            <p className="text-muted-foreground text-base max-w-md mx-auto">
              You have completed the training: <strong className="text-foreground">{coaching?.title}</strong>.
            </p>
          </div>
 
          {results && results.completed && (
            <div className="border-t-2 border-slate-100 dark:border-slate-800 pt-8 mt-8 space-y-6">
              <h3 className="font-extrabold text-xl text-foreground">Quiz Performance Summary</h3>
              <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto">
                <div className="bg-slate-50/50 dark:bg-slate-950 p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-muted-foreground uppercase font-black tracking-wider">Percentage Score</p>
                  <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">{results.percentageScore ?? 0}%</p>
                </div>
                <div className="bg-slate-50/50 dark:bg-slate-950 p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-muted-foreground uppercase font-black tracking-wider">Short Answer Avg</p>
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <span className="text-3xl font-extrabold text-amber-500">{results.shortAnswerAverage || 0}</span>
                    <Star className="h-6 w-6 fill-amber-500 text-amber-500" />
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground pt-2">Your responses have been saved and sent to HR.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (quizState === "intro") {
    const questions = (coaching as any).quiz_questions || [];
    const settings = (coaching as any).quiz_settings || {};
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 p-8 rounded-2xl border shadow-xl space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HelpCircle className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-extrabold text-foreground">Ready for the Quiz?</h2>
            <p className="text-sm text-muted-foreground">
              A quiz will take place now to evaluate your understanding of the training:
            </p>
            <p className="font-bold text-primary">{coaching.title}</p>
          </div>

          <div className="bg-muted/40 p-4 rounded-xl border space-y-2 text-left text-sm max-w-md mx-auto">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Questions:</span>
              <span className="font-bold">{questions.length} questions</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time Limit:</span>
              <span className="font-bold">
                {settings.timeLimitOn && settings.timeLimitMinutes ? `${settings.timeLimitMinutes} minutes` : "None"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Question Types:</span>
              <span className="font-semibold text-xs">MCQs, True/False, & Short Answers</span>
            </div>
          </div>

          <div className="pt-4">
            <Button size="lg" onClick={() => setQuizState("in_progress")} className="w-full max-w-xs text-white" style={{ background: navyDark }}>
              Start Quiz
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (quizState === "in_progress") {
    const questions = (coaching as any).quiz_questions || [];
    const q = questions[activeQuestionIdx];
    const userAns = quizAnswers[q.id];

    // Format timer
    const formatTime = (secs: number) => {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      return h > 0 
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;
    };

    const handleOptionSelect = (opt: string) => {
      setQuizAnswers(prev => ({
        ...prev,
        [q.id]: opt
      }));
    };

    const handleMultipleSelect = (opt: string) => {
      const current = Array.isArray(userAns) ? userAns : [];
      const next = current.includes(opt)
        ? current.filter(x => x !== opt)
        : [...current, opt];
      setQuizAnswers(prev => ({
        ...prev,
        [q.id]: next
      }));
    };

    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <header className="flex items-center justify-between px-6 py-3 border-b bg-white dark:bg-slate-950 shadow-sm">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">{coaching.title} - Quiz</span>
          </div>
          <div className="flex items-center gap-3">
            {timeLeft !== null && (
              <Badge variant="destructive" className="font-mono text-xs gap-1.5 px-3 py-1 animate-pulse">
                Time Remaining: {formatTime(timeLeft)}
              </Badge>
            )}
            <Badge variant="outline">
              Question {activeQuestionIdx + 1} / {questions.length}
            </Badge>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full">
          <Card className="w-full border-2 border-slate-200/80 dark:border-slate-800 shadow-xl overflow-hidden">
            <CardHeader className="space-y-3 p-8 border-b bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="px-3 py-1 text-xs uppercase tracking-wider font-bold bg-[#1b2a4a]/10 text-[#1b2a4a] dark:bg-[#1b2a4a]/30 dark:text-blue-300 border-0">{q.type.replace("_", " ")}</Badge>
                <span className="text-sm font-semibold text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">Question {activeQuestionIdx + 1} of {questions.length}</span>
              </div>
              <CardTitle className="text-2xl sm:text-3xl font-extrabold leading-tight pt-2 text-slate-900 dark:text-white">{q.text}</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6 min-h-[260px] bg-white dark:bg-slate-950">
              {(q.type === "MCQ_SINGLE" || q.type === "TF") && (
                <div className="grid gap-4">
                  {q.options.map((opt: string) => {
                    const isSelected = userAns === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => handleOptionSelect(opt)}
                        className={`w-full text-left p-5 rounded-2xl border-2 text-base font-bold transition-all flex items-center justify-between group ${
                          isSelected 
                            ? "border-primary bg-primary/5 text-primary shadow-md" 
                            : "border-slate-200/80 bg-background hover:bg-slate-50/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        <span className="pr-4">{opt}</span>
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'border-primary' : 'border-slate-300 group-hover:border-slate-400'}`}>
                          {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "MCQ_MULTIPLE" && (
                <div className="grid gap-4">
                  {q.options.map((opt: string) => {
                    const isSelected = Array.isArray(userAns) && userAns.includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => handleMultipleSelect(opt)}
                        className={`w-full text-left p-5 rounded-2xl border-2 text-base font-bold transition-all flex items-center justify-between group ${
                          isSelected 
                            ? "border-primary bg-primary/5 text-primary shadow-md" 
                            : "border-slate-200/80 bg-background hover:bg-slate-50/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        <span className="pr-4">{opt}</span>
                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'border-primary bg-primary text-white' : 'border-slate-300 group-hover:border-slate-400'}`}>
                          {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "SHORT_ANSWER" && (
                <textarea
                  className="w-full p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-background text-base font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none min-h-[200px] resize-y transition-all"
                  placeholder="Type your response here..."
                  value={userAns || ""}
                  onChange={(e) => setQuizAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between w-full mt-8 gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setActiveQuestionIdx(prev => prev - 1)}
              disabled={activeQuestionIdx === 0}
              className="px-6 h-12 font-bold rounded-xl border-2"
            >
              <ChevronLeft className="mr-1.5 h-5 w-5" /> Previous
            </Button>

            {activeQuestionIdx < questions.length - 1 ? (
              <Button
                size="lg"
                onClick={() => setActiveQuestionIdx(prev => prev + 1)}
                className="px-8 h-12 font-bold rounded-xl text-white bg-[#1b2a4a] hover:bg-[#15233e]"
              >
                Next <ChevronRight className="ml-1.5 h-5 w-5" />
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleQuizSubmit}
                disabled={submitQuizMutation.isPending}
                className="px-8 h-12 font-bold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 border-0"
              >
                {submitQuizMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Quiz
              </Button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // slides is declared at the top of the component

  const currentSlide = slides[activeSlide] || slides[0];

  // Helper to extract URL from a versioned clip or plain string
  const getClipUrl = (clip: any): string | null => {
    if (!clip) return null;
    if (typeof clip === "string") return clip || null;
    // VersionedClip: find active version URL
    if (Array.isArray(clip.versions) && clip.versions.length > 0) {
      const active = clip.versions.find((v: any) => v.v === clip.activeVersion) || clip.versions[clip.versions.length - 1];
      return active?.url || null;
    }
    return clip.url || null;
  };

  // Resolve video for current slide
  const pregeneratedVideos = coaching?.pregenerated_videos as any;
  const currentVideoUrl: string | null = (() => {
    if (isLocalized) return null;
    if (!pregeneratedVideos) return null;
    // Try slide_{n} key pattern (legacy flat format)
    const slideKey = `slide_${currentSlide.slide}`;
    const byKey = getClipUrl(pregeneratedVideos[slideKey]);
    if (byKey) return byKey;
    // Use questions array from PregeneratedStoreV2
    if (Array.isArray(pregeneratedVideos.questions)) {
      // Try matching by questionId = slide_N
      const byId = pregeneratedVideos.questions.find((c: any) => c?.questionId === slideKey);
      if (byId) {
        const url = getClipUrl(byId);
        if (url) return url;
      }
      // Fallback to index
      const byIndex = getClipUrl(pregeneratedVideos.questions[activeSlide]);
      if (byIndex) return byIndex;
    }
    return null;
  })();




  return (
    <div className="h-screen overflow-hidden flex flex-col bg-muted/20">
      {/* Navy accent header */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm shadow-sm" style={{ borderBottomColor: "hsl(214 40% 88%)" }}>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: navyDark }}>
            <Brain className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-wide">{coaching.title}</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full ml-1" style={{ background: navyLight, color: navyDark }}>
            <Layers className="inline h-2.5 w-2.5 mr-1" />Training
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs" style={{ borderColor: "hsl(214 50% 70%)", color: navyMid }}>
            Slide {activeSlide + 1} / {slides.length}
          </Badge>
          {activeSlide === slides.length - 1 && completedSlides[activeSlide] ? (
            <Button size="sm" onClick={handleComplete} className="text-white text-xs h-7 px-3" style={{ background: navyDark }}>
              Complete Training
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => goToSlide(activeSlide + 1)} className="text-xs h-7 px-3" style={{ borderColor: "hsl(214 50% 70%)", color: navyMid }} disabled={!completedSlides[activeSlide]}>
              Next Slide →
            </Button>
          )}
        </div>
      </header>

      {/* Outer flex row: training content + chatbot panel side by side */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── TRAINING CONTENT AREA ── */}
        <main className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* ── TOP ROW: avatar | slide. Fill leftover viewport. ── */}
          <div className="flex flex-1 min-h-0 gap-0">

            {/* AVATAR PANEL — 30% width, no right border, items aligned left */}
            <div
              className={`flex flex-col gap-2 flex-shrink-0 transition-all duration-300 items-start justify-start ${showAvatar ? "p-5" : "p-0"}`}
              style={{
                width: showAvatar ? "30%" : "0%",
                overflow: "hidden",
                background: "transparent",
              }}
            >
              {showAvatar && (
                <div className="w-full flex flex-col items-start justify-start pl-4">
                  {/* Circle Video area */}
                  <div
                    className="relative rounded-full overflow-hidden bg-slate-900 border-4 shadow-xl group flex-shrink-0"
                    style={{
                      width: isChatOpen ? "260px" : "420px",
                      height: isChatOpen ? "260px" : "420px",
                      transition: "width 0.3s ease, height 0.3s ease",
                      borderColor: "hsl(214 40% 72%)",
                    }}
                  >
                    {currentVideoUrl ? (
                      <>
                        <video
                          ref={videoRef}
                          src={currentVideoUrl}
                          className="w-full h-full object-cover object-top"
                          style={{
                            transform: "scale(1.6) translateY(-10%)",
                            transformOrigin: "center top",
                          }}
                          autoPlay
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onEnded={() => {
                            setIsPlaying(false);
                            if (!isVideoMediaSlide(currentSlide)) {
                              setCompletedSlides(prev => ({ ...prev, [activeSlide]: true }));
                            }
                          }}
                        />
                        {/* Play/pause overlay */}
                        <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!videoRef.current) return;
                              if (isPlaying) videoRef.current.pause();
                              else videoRef.current.play();
                            }}
                            className="h-16 w-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all hover:scale-110 pointer-events-auto"
                          >
                            {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8 ml-0.5" />}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full relative flex flex-col items-center justify-center bg-slate-950">
                        {coaching?.avatarImageUrl ? (
                          <img
                            src={coaching.avatarImageUrl}
                            alt="AI Coach"
                            className="w-full h-full object-cover object-top"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-4 text-center bg-slate-905">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: navyDark }}>
                              <Brain className="h-8 w-8 text-white/60" />
                            </div>
                            <p className="text-xs font-medium text-slate-400 leading-tight">AI Trainer</p>
                          </div>
                        )}
                        {/* Audio pulse wave visualization overlay when TTS is playing! */}
                        {isPlayingAudio && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px]">
                            <div className="flex items-center gap-1.5 h-12">
                              <span className="w-1 bg-sky-400 rounded-full animate-[pulse_1s_infinite_100ms] h-6"></span>
                              <span className="w-1 bg-sky-400 rounded-full animate-[pulse_1s_infinite_200ms] h-10"></span>
                              <span className="w-1 bg-sky-400 rounded-full animate-[pulse_1s_infinite_300ms] h-8"></span>
                              <span className="w-1 bg-sky-400 rounded-full animate-[pulse_1s_infinite_400ms] h-11"></span>
                              <span className="w-1 bg-sky-400 rounded-full animate-[pulse_1s_infinite_500ms] h-5"></span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SLIDE PANEL — 70% width (or full if avatar hidden) */}
            <div className={`flex flex-col gap-1 flex-1 min-w-0 ${showAvatar ? "px-5 pt-5 pb-1" : "px-4 pt-2 pb-1"}`}>
              {(showAvatar || avatarMode !== "none") && (
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="h-1 w-4 rounded-full" style={{ background: navyDark }} />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Slide Preview</span>
                </div>
                {avatarMode !== "none" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground bg-white"
                    onClick={() => setShowAvatar(!showAvatar)}
                  >
                    {showAvatar ? "Hide Video" : "Show Video"}
                  </Button>
                )}
              </div>
              )}

              {/* Slide canvas — dynamically fits the slide's actual aspect ratio */}
              <div className="relative group flex-1 min-h-0 [container-type:size]">
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-slate-950/5"
                  style={{
                    width: `min(100cqw, calc(100cqh * ${slideAspectRatio}))`,
                    height: `min(100cqh, calc(100cqw * ${1 / slideAspectRatio}))`,
                  }}
                >
                  {currentSlide.imageUrl ? (
                    <img
                      src={currentSlide.imageUrl}
                      alt={`Slide ${activeSlide + 1}`}
                      className="absolute inset-0 h-full w-full object-contain"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth && img.naturalHeight) {
                          setSlideAspectRatio(img.naturalWidth / img.naturalHeight);
                        }
                      }}
                    />
                  ) : !currentSlide.media ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-card" style={{ background: navyLight, borderColor: "hsl(214 40% 85%)" }}>
                      <div className="text-xs font-bold uppercase tracking-widest" style={{ color: navyMid }}>Slide {activeSlide + 1}</div>
                      <h3 className="text-xl font-bold" style={{ color: navyDark }}>{currentSlide.title}</h3>
                      <div className="w-10 h-0.5 rounded-full" style={{ background: navyMid }} />
                    </div>
                  ) : null}
                  {currentSlide.media && (
                    <SlideMediaOverlay
                      key={`${activeSlide}-${currentSlide.media.url}`}
                      media={currentSlide.media}
                      autoPlay={currentSlide.media.type === "video"}
                      // Non-Interactive mode uses pregenerated clips; fit them slightly
                      // zoomed-out so faces/content don't feel cropped.
                      videoObjectFit={avatarMode === "none" ? "contain" : "cover"}
                      onVideoEnded={() => {
                        setCompletedSlides((prev) => ({ ...prev, [activeSlide]: true }));
                      }}
                      onVideoError={() => {
                        setCompletedSlides((prev) => ({ ...prev, [activeSlide]: true }));
                      }}
                    />
                  )}
                </div>
                {/* Nav arrows */}
                <button
                  onClick={(e) => { e.stopPropagation(); goToSlide(activeSlide - 1); }}
                  disabled={activeSlide === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 shadow-md border flex items-center justify-center hover:scale-110 active:scale-95 transition-all disabled:opacity-0 disabled:pointer-events-none z-10"
                  style={{ color: navyDark, borderColor: "hsl(214 40% 90%)" }}
                >
                  <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); goToSlide(activeSlide + 1); }}
                  disabled={activeSlide === slides.length - 1 || !completedSlides[activeSlide]}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 shadow-md border flex items-center justify-center hover:scale-110 active:scale-95 transition-all disabled:opacity-0 disabled:pointer-events-none z-10"
                  style={{ color: navyDark, borderColor: "hsl(214 40% 90%)" }}
                >
                  <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>

          <div className="h-2 shrink-0" aria-hidden />

          {/* ── SUBTITLES + BOT — lower third under the deck, modest clearance from the window ── */}
          <div className={`flex-shrink-0 px-6 ${avatarMode === "none" ? "pt-1 pb-3" : "pt-2 pb-5"}`}>
            <div className="flex items-center gap-4 w-full">
              {/* Subtitle text — compact dark card with comfortable internal padding */}
              <div className="flex-1 rounded-lg border px-5 py-3.5 shadow-sm bg-slate-900 flex items-center justify-between gap-4 min-h-0" style={{ borderColor: navyDark }}>
                <p className="text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-line text-slate-100">
                  {isLocalizing
                    ? <span className="flex items-center gap-2 text-slate-400 italic"><Loader2 className="h-3.5 w-3.5 animate-spin" />Translating narration…</span>
                    : (currentSlide.script
                        || (isVideoMediaSlide(currentSlide)
                          ? "Playing uploaded video."
                          : "No narration script for this slide yet."))}
                </p>
                {avatarMode === "none" && (
                  <button
                    onClick={() => {
                      if (!audioRef.current) {
                        playNarration(activeSlide);
                      } else if (isPlayingAudio) {
                        audioRef.current.pause();
                        setIsPlayingAudio(false);
                      } else {
                        audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
                      }
                    }}
                    className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all"
                  >
                    {isPlayingAudio ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4 ml-0.5" />
                    )}
                  </button>
                )}
              </div>
              {/* Chat toggle — next to the subtitle row, clear of the viewport corner */}
              <div
                className="relative flex-shrink-0 rounded-full p-[3px] shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95 mr-1"
                style={{
                  background: isChatOpen
                    ? "hsl(0 0% 45%)"
                    : "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ec4899, #ef4444)",
                }}
              >
                <button
                  onClick={() => setIsChatOpen((o) => !o)}
                  className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white overflow-hidden"
                  title={isChatOpen ? "Close AI assistant" : "Ask AI assistant"}
                >
                  {isChatOpen ? (
                    <X className="h-6 w-6 text-slate-600" />
                  ) : (
                    <img
                      src="/coaching-chatbot-icon.png"
                      alt="AI assistant"
                      className="h-12 w-12 rounded-full object-contain"
                    />
                  )}
                </button>
              </div>
            </div>
            {/* Progress dots — stay with the subtitle row */}
            <div className={`flex items-center justify-center gap-1.5 ${avatarMode === "none" ? "pt-2" : "pt-3"}`}>
              {slides.map((_: any, i: number) => (
                <button
                  key={i}
                  disabled={i > activeSlide && !completedSlides[activeSlide]}
                  onClick={() => goToSlide(i)}
                  className="h-1.5 rounded-full transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    width: i === activeSlide ? "1.5rem" : "0.375rem",
                    background: i === activeSlide ? navyDark : "hsl(214 20% 80%)",
                  }}
                />
              ))}
            </div>
          </div>

        </main>

        {/* AI Chatbot — inline side panel */}
        <CoachingChatbot
          slides={slides}
          trainingTitle={coaching.title}
          language={effectiveLanguage}
          navyDark={navyDark}
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen((o) => !o)}
        />
      </div>
    </div>
  );
}



