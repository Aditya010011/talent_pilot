import { supabaseAdmin } from "@/lib/supabase/admin";
import { isLocalMediaUrl } from "@/lib/local-media-storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgMembership, hasProjectAccess, protectedProcedure, router } from "../trpc";

interface ScreenshotEntry {
  url: string;
  path: string;
  timestamp: string;
  type: "camera" | "screen";
}

async function resolveSignedUrl(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24); // 24 hours
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export const analysisRouter = router({
  getSessionSummary: protectedProcedure
    .input(z.object({ sessionId: z.string().optional(), candidateId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      if (!input.sessionId && !input.candidateId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Must provide either sessionId or candidateId" });
      }

      let sessionId = input.sessionId;
      const candidateId = input.candidateId;

      if (candidateId && !sessionId) {
        const { data: candidate } = await ctx.supabase
          .from("candidates")
          .select("*, interview:interviews!inner(id, userId, title, objective, assessmentCriteria, cvAssessmentCriteria, cvJdAlignmentCriteria, projectId, project:projects!inner(organizationId))")
          .eq("id", candidateId)
          .single();

        if (!candidate) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        if (candidate.sessionId) {
          sessionId = candidate.sessionId;
        } else {

        const interview = candidate.interview as any;
        const membership = await getOrgMembership(ctx.supabase, interview.project.organizationId, ctx.user.id);
        if (!membership) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
        }

        const projAccess = await hasProjectAccess(ctx.supabase, interview.projectId, ctx.user.id);
        if (!projAccess) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
        }

        const result = {
          id: `stub-${candidate.id}`,
          interviewId: interview.id,
          interviewTitle: interview.title,
          interviewObjective: interview.objective,
          assessmentCriteria: interview.assessmentCriteria ?? [],
          cvAssessmentCriteria: interview.cvAssessmentCriteria ?? [],
          cvJdAlignmentCriteria: interview.cvJdAlignmentCriteria ?? [],
          participantName: candidate.name,
          participantEmail: candidate.email,
          status: null,
          evaluationStatus: candidate.evaluationStatus as any,
          createdAt: candidate.createdAt,
          startedAt: null,
          completedAt: null,
          summary: null,
          insights: null,
          themes: [],
          sentiment: null,
          messages: [],
          totalDurationSeconds: null,
          audioRecordingUrl: null,
          videoRecordingUrl: null,
          audioDuration: null,
          screenshots: null,
          antiCheatingLog: null,
          metadata: { hrComments: candidate.hrComments || [] },
          candidateProfile: (() => {
            const cvAnalysis = candidate.cvAnalysis as any;
            return {
              id: candidate.id,
              name: candidate.name,
              email: candidate.email,
              phone: candidate.phone,
              gender: candidate.gender,
              birthday: candidate.birthday,
              education: candidate.education,
              school: candidate.school,
              major: candidate.major,
              graduationYear: candidate.graduationYear,
              workExperience: candidate.workExperience,
              notes: candidate.notes,
              cvAnalysis: cvAnalysis ? {
                ...cvAnalysis,
                resumeSignedUrl: null,
              } : null,
            };
          })(),
        };

        const cvAnalysisObj = result.candidateProfile?.cvAnalysis as any;
        if (cvAnalysisObj && cvAnalysisObj.resumePath) {
          try {
            cvAnalysisObj.resumeSignedUrl = await resolveSignedUrl("support-attachments", cvAnalysisObj.resumePath);
          } catch (e) {
            // ignore
          }
        }

        return result;
        }
      }
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select(
          `*, interview:interviews!inner(id, userId, title, objective, assessmentCriteria, cvAssessmentCriteria, cvJdAlignmentCriteria, projectId, project:projects!inner(organizationId), questions(*)), messages(*)`,
        )
        .eq("id", sessionId)
        .order("timestamp", { referencedTable: "messages", ascending: true })
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const interview = session.interview as {
        id: string;
        userId: string;
        title: string;
        objective: string | null;
        projectId: string;
        project: { organizationId: string };
        assessmentCriteria?: { name: string; description?: string }[] | null;
        cvAssessmentCriteria?: { name: string; description?: string }[] | null;
        cvJdAlignmentCriteria?: { name: string; description?: string }[] | null;
      };

      const membership = await getOrgMembership(ctx.supabase, interview.project.organizationId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
      }

      const projAccess = await hasProjectAccess(ctx.supabase, interview.projectId, ctx.user.id);
      if (!projAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
      }

      // Generate fresh signed URLs for recordings and screenshots
      let audioRecordingUrl: string | null = null;
      if (session.audioRecordingUrl) {
        // Extract path from stored URL or use directly if it's a path
        const storedUrl = session.audioRecordingUrl as string;
        if (isLocalMediaUrl(storedUrl)) {
          // Recordings now live on local disk on this VM and are already a
          // same-origin /api/media/local/... URL — nothing to resolve.
          audioRecordingUrl = storedUrl;
        } else {
          const pathMatch = storedUrl.match(/\/recordings\/(.+?)(?:\?|$)/);
          if (pathMatch) {
            audioRecordingUrl = await resolveSignedUrl("recordings", pathMatch[1]);
          } else if (!storedUrl.startsWith("http")) {
            audioRecordingUrl = await resolveSignedUrl("recordings", storedUrl);
          }
          if (!audioRecordingUrl) {
            audioRecordingUrl = storedUrl;
          }
        }
      }

      let videoRecordingUrl: string | null = null;
      if ((session as Record<string, unknown>).videoRecordingUrl) {
        const storedUrl = (session as Record<string, unknown>).videoRecordingUrl as string;
        if (isLocalMediaUrl(storedUrl)) {
          videoRecordingUrl = storedUrl;
        } else {
          const pathMatch = storedUrl.match(/\/videos\/(.+?)(?:\?|$)/);
          if (pathMatch) {
            videoRecordingUrl = await resolveSignedUrl("videos", pathMatch[1]);
          } else if (!storedUrl.startsWith("http")) {
            videoRecordingUrl = await resolveSignedUrl("videos", storedUrl);
          }
          if (!videoRecordingUrl) {
            videoRecordingUrl = storedUrl;
          }
        }
      }

      let screenshots: ScreenshotEntry[] | null = null;
      const rawScreenshots = session.screenshots as ScreenshotEntry[] | null;
      if (rawScreenshots && rawScreenshots.length > 0) {
        screenshots = await Promise.all(
          rawScreenshots.map(async (s) => {
            const signed = s.path
              ? await resolveSignedUrl("screenshots", s.path)
              : null;
            return { ...s, url: signed || s.url };
          }),
        );
      }

      const { data: candidateProfile } = await ctx.supabase
        .from("candidates")
        .select("id, name, email, phone, gender, birthday, education, school, major, graduationYear, workExperience, notes, cvAnalysis, hrComments")
        .eq("sessionId", sessionId)
        .maybeSingle();

      const result = {
        id: session.id,
        interviewId: interview.id,
        interviewTitle: interview.title,
        interviewObjective: interview.objective,
        interviewContents: (interview as any).questions || [],
        assessmentCriteria: interview.assessmentCriteria ?? [],
        cvAssessmentCriteria: interview.cvAssessmentCriteria ?? [],
        cvJdAlignmentCriteria: interview.cvJdAlignmentCriteria ?? [],
        participantName: session.participantName,
        participantEmail: session.participantEmail,
        status: session.status,
        evaluationStatus: (session as Record<string, unknown>).evaluationStatus as
          | "PENDING"
          | "SHORTLISTED"
          | "WAITLISTED"
          | "REJECTED"
          | null,
        createdAt: session.createdAt,
        startedAt: (session as Record<string, unknown>).startedAt as string | null,
        completedAt: (session as Record<string, unknown>).completedAt as string | null,
        summary: session.summary,
        insights: session.insights,
        themes: session.themes,
        sentiment: session.sentiment,
        messages: session.messages,
        totalDurationSeconds: session.totalDurationSeconds,
        audioRecordingUrl,
        videoRecordingUrl,
        audioDuration: (session as Record<string, unknown>).audioDuration as number | null,
        screenshots,
        antiCheatingLog: (session as Record<string, unknown>).antiCheatingLog as
          | { type: string; timestamp: number; detail?: string }[]
          | null,
        metadata: {
          ...(session.participantMetadata as Record<string, unknown> | null),
          hrComments: (candidateProfile as any)?.hrComments || (session.participantMetadata as any)?.hrComments || [],
        },
        videoClips: await Promise.all(
          (((session.participantMetadata as any)?.videoClips ?? []) as {
            questionId: string;
            clipUrl: string;
            durationSec: number;
          }[]).map(async (clip) => {
            // Local-disk URLs and full URLs need no resolution; only legacy
            // Supabase Storage paths need a fresh signed URL.
            let resolvedUrl = clip.clipUrl;
            if (!isLocalMediaUrl(clip.clipUrl) && !clip.clipUrl.startsWith("http")) {
              const pathMatch = clip.clipUrl.match(/\/videos\/(.+?)(?:\?|$)/);
              const storagePath = pathMatch ? pathMatch[1] : clip.clipUrl;
              resolvedUrl = (await resolveSignedUrl("videos", storagePath).catch(() => null)) ?? clip.clipUrl;
            }
            return { ...clip, clipUrl: resolvedUrl };
          })
        ),
        candidateProfile: candidateProfile ? {
          id: (candidateProfile as any).id,
          name: candidateProfile.name,
          email: candidateProfile.email,
          phone: candidateProfile.phone,
          gender: candidateProfile.gender,
          birthday: candidateProfile.birthday,
          education: candidateProfile.education,
          school: candidateProfile.school,
          major: candidateProfile.major,
          graduationYear: candidateProfile.graduationYear,
          workExperience: candidateProfile.workExperience,
          notes: candidateProfile.notes,
          cvAnalysis: (() => {
            const cvAnalysis = candidateProfile.cvAnalysis as any;
            return cvAnalysis ? {
              ...cvAnalysis,
              resumeSignedUrl: null,
            } : null;
          })(),
        } : null,
      };

      const cvAnalysisObj = result.candidateProfile?.cvAnalysis as any;
      if (cvAnalysisObj && cvAnalysisObj.resumePath) {
        try {
          cvAnalysisObj.resumeSignedUrl = await resolveSignedUrl("support-attachments", cvAnalysisObj.resumePath);
        } catch (e) {
          // ignore
        }
      }

      return result;
    }),

  getInterviewInsights: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select("id, projectId, project:projects!inner(organizationId)")
        .eq("id", input.interviewId)
        .single();

      if (!interview) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const project = interview.project as unknown as { organizationId: string };
      const membership = await getOrgMembership(ctx.supabase, project.organizationId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
      }

      const projAccess = await hasProjectAccess(ctx.supabase, interview.projectId, ctx.user.id);
      if (!projAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
      }

      const { data: sessions } = await ctx.supabase
        .from("sessions")
        .select("participantEmail, participantName, totalDurationSeconds, themes, insights, messages(id)")
        .eq("interviewId", input.interviewId)
        .eq("status", "COMPLETED");

      const completedSessions = sessions ?? [];
      const totalSessions = completedSessions.length;
      const avgDuration =
        totalSessions > 0
          ? completedSessions.reduce(
              (sum, s) => sum + (s.totalDurationSeconds ?? 0),
              0,
            ) / totalSessions
          : 0;

      const totalMessages = completedSessions.reduce(
        (sum, s) => sum + ((s.messages as { id: string }[])?.length ?? 0),
        0,
      );

      const uniqueEmails = new Set(
        completedSessions
          .map((s) => s.participantEmail)
          .filter((e): e is string => !!e),
      );

      const allThemes = completedSessions.flatMap((s) => s.themes ?? []);
      const themeCounts: Record<string, number> = {};
      for (const theme of allThemes) {
        themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
      }

      return {
        totalSessions,
        totalMessages,
        totalParticipants: uniqueEmails.size,
        avgDurationSeconds: Math.round(avgDuration),
        topThemes: Object.entries(themeCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10),
        avgScore: (() => {
          const scores = completedSessions
            .map((s) => {
              const ins = s.insights as any;
              if (!ins || Array.isArray(ins)) return null;
              const qScores = (ins.questionEvaluations ?? []).map((e: any) => {
                const score = e?.score;
                return typeof score === "number" ? score : Number(score);
              }).filter((n: number) => Number.isFinite(n));
              if (qScores.length > 0) return qScores.reduce((a: number, b: number) => a + b, 0) / qScores.length;
              const cScores = (ins.criteriaEvaluations ?? []).map((e: any) => {
                const score = e?.score;
                return typeof score === "number" ? score : Number(score);
              }).filter((n: number) => Number.isFinite(n));
              if (cScores.length > 0) return cScores.reduce((a: number, b: number) => a + b, 0) / cScores.length;
              return null;
            })
            .filter((s): s is number => s !== null);
          if (scores.length === 0) return null;
          return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
        })(),
      };
    }),
});
