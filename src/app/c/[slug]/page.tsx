"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Brain, CheckCircle2, Layers, Link2Off, Loader2, Plus, RotateCcw } from "lucide-react";
import { PreparingScreen } from "@/components/session/preparing-screen";
import { isCoachingFullyComplete } from "@/lib/coaching-status";
import { CandidateLanguageSelect } from "@/components/session/candidate-language-select";
import {
  resolveLanguage,
  trainingAllowsCandidateLanguageChoice,
} from "@/lib/languages";

const STORAGE_KEY = "inluwa_coaching_session_";

export default function CoachingLandingPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { toast } = useToast();

  const [participantName, setParticipantName] = useState("");
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(null);
  const [storedSessionId, setStoredSessionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY + slug);
      if (stored) setStoredSessionId(stored);
    } catch { /* noop */ }
  }, [slug]);

  const training = trpc.training.getBySlug.useQuery({ slug }, { retry: false });

  const existingSession = trpc.coachingSession.getById.useQuery(
    { id: storedSessionId! },
    { enabled: !!storedSessionId, retry: false },
  );

  const tData = training.data as any;
  const showLanguagePicker =
    !!tData?.multilingualEnabled &&
    trainingAllowsCandidateLanguageChoice(tData);

  useEffect(() => {
    if (!training.data || chosenLanguage) return;
    setChosenLanguage(resolveLanguage(tData?.language).code);
  }, [training.data, chosenLanguage, tData?.language]);

  // Keep the stored session unless this training is actually finished
  useEffect(() => {
    if (!storedSessionId) return;
    const data = existingSession.data as any;
    if (existingSession.isError) {
      try { localStorage.removeItem(STORAGE_KEY + slug); } catch { /* noop */ }
      setStoredSessionId(null);
      return;
    }
    if (data && isCoachingFullyComplete(data, data.training)) {
      try { localStorage.removeItem(STORAGE_KEY + slug); } catch { /* noop */ }
      setStoredSessionId(null);
    }
  }, [existingSession.data, existingSession.isError, storedSessionId, slug]);

  const canResume =
    !!storedSessionId &&
    !!existingSession.data &&
    !isCoachingFullyComplete(existingSession.data, (existingSession.data as any)?.training);

  const createSession = trpc.coachingSession.create.useMutation({
    onSuccess: (data: any) => {
      try { localStorage.setItem(STORAGE_KEY + slug, data.sessionId); } catch { /* noop */ }
      router.push(`/c/${slug}/session`);
    },
    onError: (err) => {
      toast({ title: "Failed to start training", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    router.prefetch(`/c/${slug}/session`);
  }, [router, slug]);

  const handleResume = useCallback(() => {
    router.push(`/c/${slug}/session`);
  }, [router, slug]);

  const handleStartNew = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY + slug); } catch { /* noop */ }
    setStoredSessionId(null);
  }, [slug]);

  if (training.isLoading) return <PreparingScreen text="Preparing your coaching..." />;

  if (training.isError || !training.data) {
    return (
      <div className="coaching-landing flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-navy/20">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Link2Off className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Training not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This training link is invalid or no longer active.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (storedSessionId && existingSession.isLoading) return <PreparingScreen text="Preparing your coaching..." />;

  return (
    <>
      <style>{`
        .coaching-landing {
          background: radial-gradient(ellipse at 60% 0%, hsl(214 60% 96%) 0%, hsl(0 0% 98%) 60%);
        }
        .dark .coaching-landing {
          background: radial-gradient(ellipse at 60% 0%, hsl(214 40% 12%) 0%, hsl(222 20% 8%) 60%);
        }
        .navy-badge {
          background: hsl(214 80% 14%);
          color: hsl(214 80% 80%);
        }
        .dark .navy-badge {
          background: hsl(214 80% 18%);
          color: hsl(214 80% 75%);
        }
        .navy-icon-bg {
          background: linear-gradient(135deg, hsl(214 80% 25%) 0%, hsl(214 80% 18%) 100%);
        }
        .dark .navy-icon-bg {
          background: linear-gradient(135deg, hsl(214 70% 28%) 0%, hsl(214 80% 20%) 100%);
        }
        .navy-divider {
          background: linear-gradient(90deg, transparent, hsl(214 60% 60% / 0.25), transparent);
        }
        .coaching-card {
          border-color: hsl(214 40% 85%);
          box-shadow: 0 4px 6px -1px hsl(214 40% 50% / 0.08), 0 20px 40px -8px hsl(214 50% 40% / 0.08);
        }
        .dark .coaching-card {
          border-color: hsl(214 30% 22%);
          box-shadow: 0 4px 6px -1px hsl(214 40% 10% / 0.3), 0 20px 40px -8px hsl(214 50% 5% / 0.4);
        }
        .coaching-card .top-bar {
          background: linear-gradient(90deg, hsl(214 80% 25%), hsl(214 70% 40%), hsl(214 80% 25%));
        }
        .navy-btn {
          background: linear-gradient(135deg, hsl(214 80% 22%) 0%, hsl(214 70% 32%) 100%);
          color: white;
          border: none;
        }
        .navy-btn:hover {
          background: linear-gradient(135deg, hsl(214 80% 28%) 0%, hsl(214 70% 38%) 100%);
        }
        .navy-btn:disabled {
          opacity: 0.55;
        }
        .resume-banner {
          background: hsl(214 60% 97%);
          border-color: hsl(214 60% 75%);
        }
        .dark .resume-banner {
          background: hsl(214 50% 12%);
          border-color: hsl(214 50% 28%);
        }
        .info-pill {
          background: hsl(214 50% 95%);
          color: hsl(214 70% 30%);
        }
        .dark .info-pill {
          background: hsl(214 40% 14%);
          color: hsl(214 60% 70%);
        }
        .navy-input:focus-visible {
          --tw-ring-color: hsl(214 70% 45%);
          border-color: hsl(214 70% 45%);
        }
      `}</style>

      <div className="coaching-landing flex min-h-screen items-center justify-center p-4">
        <Card className="coaching-card w-full max-w-md overflow-hidden rounded-2xl">
          <div className="top-bar h-1.5" />

          <CardHeader className="text-center pt-8 pb-4">
            <div className="navy-icon-bg mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl shadow-lg">
              <Brain className="h-7 w-7 text-white" />
            </div>

            <div className="navy-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-2 mx-auto w-fit">
              <Layers className="h-3 w-3" />
              Training Session
            </div>

            <CardTitle className="font-heading text-2xl tracking-tight mt-1">
              {tData.title}
            </CardTitle>
            {tData.objective && (
              <CardDescription className="mt-1 text-sm leading-relaxed">
                {tData.objective}
              </CardDescription>
            )}
          </CardHeader>

          <div className="navy-divider h-px mx-6 mb-5" />

          <CardContent className="pb-8">
            {canResume && (
              <div className="resume-banner mb-5 rounded-xl border p-4 space-y-3">
                <p className="text-sm font-semibold">You have an unfinished training session</p>
                <p className="text-xs text-muted-foreground">
                  Pick up where you left off, or start a brand new session.
                </p>
                <div className="flex gap-2">
                  <Button className="flex-1 navy-btn h-9" onClick={handleResume}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    Continue Training
                  </Button>
                  <Button variant="outline" className="flex-1 h-9" onClick={handleStartNew}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Start New
                  </Button>
                </div>
              </div>
            )}

            {!canResume && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createSession.mutate({
                    trainingSlug: slug,
                    participantName: participantName.trim() || undefined,
                    ...(showLanguagePicker && chosenLanguage
                      ? { language: chosenLanguage }
                      : {}),
                  } as any);
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium">
                    Your Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    className="navy-input h-10"
                    value={participantName}
                    onChange={(e) => setParticipantName(e.target.value)}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                  />
                </div>

                {showLanguagePicker && (
                  <CandidateLanguageSelect
                    id="coaching-language"
                    value={chosenLanguage ?? resolveLanguage(tData.language).code}
                    onChange={(code) => {
                      setChosenLanguage(code);
                    }}
                    label="Training language"
                    description="Choose the language for slide narration and the learning assistant."
                  />
                )}

                <div className="info-pill rounded-lg px-4 py-3 text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Brain className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span>AI-powered training with slide narration</span>
                  </div>
                  {tData.timeLimitMinutes && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span>Estimated duration: ~{tData.timeLimitMinutes} min</span>
                    </div>
                  )}
                  {tData.aiName && (
                    <div className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span>Your trainer: {tData.aiName}</span>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 navy-btn font-semibold text-sm tracking-wide"
                  disabled={!participantName.trim() || createSession.isLoading}
                >
                  {createSession.isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Brain className="mr-2 h-4 w-4" />
                  )}
                  {createSession.isLoading ? "Starting training…" : "Begin Training"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
