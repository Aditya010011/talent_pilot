"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, CheckCircle2, Link2Off, Loader2 } from "lucide-react";
import { PreparingScreen } from "@/components/session/preparing-screen";
import { isCoachingFullyComplete, resolveCoachingSession } from "@/lib/coaching-status";
import { CandidateLanguageSelect } from "@/components/session/candidate-language-select";
import {
  resolveLanguage,
  trainingAllowsCandidateLanguageChoice,
} from "@/lib/languages";

const STORAGE_KEY = "inluwa_coaching_session_";

export default function CoachingInvitePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(null);
  const attempted = useRef(false);

  const candidate = trpc.coachingCandidate.getByToken.useQuery(
    { token },
    { retry: false },
  );

  const createSession = trpc.coachingSession.createFromInvite.useMutation({
    onError: () => {
      attempted.current = false;
    },
  });

  const candidateData = candidate.data as any;
  const training = candidateData?.training;
  const slug = training?.publicSlug as string | undefined;
  const showLanguagePicker =
    !!training?.multilingualEnabled &&
    trainingAllowsCandidateLanguageChoice(training);

  useEffect(() => {
    if (!training || chosenLanguage) return;
    setChosenLanguage(resolveLanguage(training.language).code);
  }, [training, chosenLanguage]);

  const goToSession = useCallback(
    (sessionSlug: string, sessionId: string) => {
      try {
        localStorage.setItem(STORAGE_KEY + sessionSlug, sessionId);
      } catch { /* noop */ }
      router.replace(`/c/${sessionSlug}/session?sid=${sessionId}`);
    },
    [router],
  );

  const startSession = useCallback(
    (language?: string) => {
      if (!slug || attempted.current) return;
      attempted.current = true;
      createSession.mutate(
        {
          inviteToken: token,
          ...(language ? { language } : {}),
        },
        {
          onSuccess: (res: any) => {
            if (res?.sessionId) goToSession(slug, res.sessionId);
          },
        },
      );
    },
    [createSession, goToSession, slug, token],
  );

  useEffect(() => {
    if (!candidate.data || done || showLanguagePicker) return;
    const data = candidate.data as any;
    const trainingData = data.training;
    const trainingSlug = trainingData?.publicSlug as string | undefined;
    if (!trainingSlug) return;

    const session = resolveCoachingSession(data.session);
    if (session && isCoachingFullyComplete(session, trainingData)) {
      setDone(true);
      return;
    }

    if (session?.id) {
      goToSession(trainingSlug, session.id);
      return;
    }

    if (!attempted.current) {
      startSession();
    }
  }, [candidate.data, done, goToSession, showLanguagePicker, startSession]);

  if (candidate.isLoading) {
    return <PreparingScreen text="Preparing your coaching..." />;
  }

  if (candidate.isError || !candidate.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Link2Off className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Invalid invite</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This coaching invite link is invalid or no longer active.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
            <h2 className="mt-4 text-2xl font-bold">Training completed</h2>
            <p className="mt-2 text-muted-foreground">
              You have already finished this training.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const existingSession = resolveCoachingSession(candidateData?.session);
  if (existingSession?.id && slug) {
    if (createSession.isLoading) {
      return <PreparingScreen text="Preparing your coaching..." />;
    }
  }

  if (showLanguagePicker && training && !existingSession?.id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="h-6 w-6" />
            </div>
            <CardTitle className="font-heading text-2xl">{training.title}</CardTitle>
            {candidateData?.name && (
              <CardDescription>Welcome, {candidateData.name}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <CandidateLanguageSelect
              id="coaching-invite-language"
              value={chosenLanguage ?? resolveLanguage(training.language).code}
              onChange={(code) => {
                setChosenLanguage(code);
              }}
              label="Training language"
              description="Choose the language for slide narration and the learning assistant."
            />
            <Button
              className="w-full"
              disabled={createSession.isLoading || !chosenLanguage}
              onClick={() => startSession(chosenLanguage ?? undefined)}
            >
              {createSession.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Begin Training
            </Button>
            {createSession.isError && (
              <p className="text-sm text-destructive text-center">
                {createSession.error.message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (createSession.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <h2 className="text-xl font-semibold">Could not start training</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {createSession.error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <PreparingScreen text="Preparing your coaching..." />;
}
