import { createLogger } from "@/lib/logger";
import { getSessionCreditCost } from "@/lib/interview-credits";
import { loadCreditRates } from "@/lib/load-credit-rates";
import {
  interviewAllowsCandidateLanguageChoice,
  resolveLanguage,
} from "@/lib/languages";
import {
  deductInterviewOwnerCredits,
  getAvailableInterviewCredits,
  InsufficientCreditsError,
} from "@/lib/pregenerate-credits";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isLocalMediaUrl } from "@/lib/local-media-storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assertMinRole,
  filterAccessibleProjectIds,
  getEffectiveProjectRole,
  hasProjectAccess,
  protectedProcedure,
  publicProcedure,
  router,
} from "../trpc";

const log = createLogger("router/session");

async function resolveInterviewOrganizationId(
  interview: {
    projectId?: string | null;
    userId?: string | null;
  },
): Promise<string | null> {
  if (interview.projectId) {
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("organizationId")
      .eq("id", interview.projectId)
      .maybeSingle();
    if (proj?.organizationId) return proj.organizationId;
  }

  if (interview.userId) {
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("workspaceId")
      .eq("userId", interview.userId)
      .order("joinedAt", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (membership?.workspaceId) return membership.workspaceId;
  }

  return null;
}

async function applySessionLanguage(
  sessionId: string,
  interview: {
    multilingualEnabled?: boolean | null;
    is_voice_only?: boolean | null;
    isVoiceOnly?: boolean | null;
  },
  language?: string | null,
) {
  const enabled =
    !!interview.multilingualEnabled &&
    interviewAllowsCandidateLanguageChoice(interview);
  if (!enabled || !language?.trim()) return;
  const code = resolveLanguage(language).code;
  await supabaseAdmin.from("sessions").update({ language: code }).eq("id", sessionId);
}

export const sessionRouter = router({
  create: publicProcedure
    .input(
      z.object({
        interviewSlug: z.string(),
        participantName: z.string().optional(),
        participantEmail: z.string().email().optional(),
        language: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select("*, questions(*)")
        .eq("publicSlug", input.interviewSlug)
        .eq("isActive", true)
        .order("order", { referencedTable: "questions", ascending: true })
        .single();

      if (!interview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Interview not found or inactive",
        });
      }

      // Enforce invite-only access via candidates table
      if (interview.requireInvite) {
        const email = input.participantEmail?.trim().toLowerCase();
        if (!email) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Email is required for invite-only interviews.",
          });
        }
        const { data: candidate } = await ctx.supabase
          .from("candidates")
          .select("id")
          .eq("interviewId", interview.id)
          .eq("email", email)
          .single();

        if (!candidate) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Your email is not on the invite list for this interview.",
          });
        }
      }

      const questions = (interview.questions ?? []) as { id: string }[];
      const derivedMode = interview.voiceEnabled ? "VOICE" : "CHAT";

      // Prevent accidental duplicates: if an in-progress session already exists for this email/interview, reuse it.
      if (input.participantEmail) {
        const { data: existing } = await ctx.supabase
          .from("sessions")
          .select("id")
          .eq("interviewId", interview.id)
          .eq("participantEmail", input.participantEmail.trim().toLowerCase())
          .eq("status", "IN_PROGRESS")
          .order("createdAt", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          log.info("Reusing existing in-progress session", { sessionId: existing.id });
          await applySessionLanguage(existing.id, interview, input.language);
          return { sessionId: existing.id, interview };
        }
      }

      // Configurable rates (default 5 credits / 15 minutes). Non-interactive sessions stay free.
      const creditRates = await loadCreditRates();
      const creditCost = getSessionCreditCost({
        voiceEnabled: interview.voiceEnabled,
        avatarMode: (interview as { avatarMode?: string }).avatarMode,
        is_voice_only: (interview as { is_voice_only?: boolean }).is_voice_only,
        timeLimitMinutes: (interview as { timeLimitMinutes?: number | null }).timeLimitMinutes,
      }, creditRates);

      // Check / deduct org (or owner) credits before creating new session
      const creatorId = interview.userId;
      const organizationId = await resolveInterviewOrganizationId({
        projectId: (interview as { projectId?: string | null }).projectId,
        userId: creatorId,
      });

      if (creditCost > 0) {
        try {
          const available = await getAvailableInterviewCredits(
            creatorId,
            organizationId,
          );
          if (available < creditCost) {
            throw new InsufficientCreditsError(creditCost, available);
          }
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          throw err;
        }
      }

      const { data: sessionJson, error } = await ctx.supabase.rpc(
        "create_interview_session",
        {
          p_interview_id: interview.id,
          p_participant_name: input.participantName ?? null,
          p_participant_email: input.participantEmail ?? null,
          p_mode_used: derivedMode,
          p_current_question_id: questions[0]?.id ?? null,
        },
      );

      if (error) {
        log.error("RPC error (create):", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      if (creditCost > 0) {
        try {
          await deductInterviewOwnerCredits(creatorId, creditCost, organizationId);
        } catch (err) {
          log.error("Failed to deduct credits after session create", { err });
        }
      }

      const session = sessionJson as { id: string };
      await applySessionLanguage(session.id, interview, input.language);

      return { sessionId: session.id, interview };
    }),

  createUploadUrl: publicProcedure
    .input(z.object({
      bucket: z.enum(["recordings", "videos", "screenshots"]),
      path: z.string(),
    }))
    .mutation(async ({ input }) => {
      log.info("Creating recording upload URL", {
        bucket: input.bucket,
        path: input.path,
      });
      const { data, error } = await supabaseAdmin.storage
        .from(input.bucket)
        .createSignedUploadUrl(input.path);

      if (error) {
        log.error("Failed to create signed upload URL:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),

  createPreview: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: interviewAccess } = await ctx.supabase
        .from("interviews")
        .select("id, projectId, project:projects!inner(organizationId)")
        .eq("id", input.interviewId)
        .single();

      if (!interviewAccess) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
      }

      const project = interviewAccess.project as unknown as { organizationId: string };
      const { data: membership } = await ctx.supabase
        .from("organization_members")
        .select("role")
        .eq("workspaceId", project.organizationId)
        .eq("userId", ctx.user.id)
        .single();

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this organization",
        });
      }

      const projAccess = await hasProjectAccess(
        ctx.supabase,
        interviewAccess.projectId,
        ctx.user.id,
      );
      if (!projAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this project",
        });
      }
      const effectiveRole = await getEffectiveProjectRole(
        ctx.supabase,
        interviewAccess.projectId,
        ctx.user.id,
        membership.role,
      );
      assertMinRole(effectiveRole, "EDITOR");

      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select("*, questions(*)")
        .eq("id", input.interviewId)
        .order("order", { referencedTable: "questions", ascending: true })
        .single();

      if (!interview) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
      }

      const { data: profile } = await ctx.supabase
        .from("profiles")
        .select("name, email")
        .eq("id", ctx.user.id)
        .single();

      const questions = (interview.questions ?? []) as { id: string }[];
      const derivedMode = interview.voiceEnabled ? "VOICE" : "CHAT";

      const { data: sessionJson, error } = await ctx.supabase.rpc(
        "create_interview_session",
        {
          p_interview_id: interview.id,
          p_participant_name: profile?.name ?? "Preview User",
          p_participant_email: profile?.email ?? ctx.user.email ?? null,
          p_mode_used: derivedMode,
          p_current_question_id: questions[0]?.id ?? null,
        },
      );

      if (error) {
        log.error("RPC error (createPreview):", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const session = sessionJson as { id: string };
      return { sessionId: session.id };
    }),

  createFromInvite: publicProcedure
    .input(z.object({
      inviteToken: z.string(),
      language: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Look up candidate + interview via the RPC
      const { data: candidate } = await ctx.supabase
        .from("candidates")
        .select("*, interview:interviews(*, questions(*))")
        .eq("inviteToken", input.inviteToken)
        .single();

      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite link" });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interview = candidate.interview as any;
      if (!interview) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Interview is no longer available" });
      }

      // If session already exists, return it
      if (candidate.sessionId) {
        const { data: existingSession } = await ctx.supabase
          .from("sessions")
          .select("*")
          .eq("id", candidate.sessionId)
          .single();

        if (existingSession) {
          await applySessionLanguage(existingSession.id, interview, input.language);
          return { sessionId: existingSession.id, interview, isExisting: true };
        }
      }

      // Sort questions
      const questions = (interview.questions ?? []) as { id: string; order: number }[];
      questions.sort((a, b) => a.order - b.order);

      // Create session via RPC (also links it to the candidate)
      const derivedMode = interview.voiceEnabled ? "VOICE" : "CHAT";

      // Configurable rates (default 5 credits / 15 minutes). Non-interactive sessions stay free.
      const creditRates = await loadCreditRates();
      const creditCost = getSessionCreditCost({
        voiceEnabled: interview.voiceEnabled,
        avatarMode: (interview as { avatarMode?: string }).avatarMode,
        is_voice_only: (interview as { is_voice_only?: boolean }).is_voice_only,
        timeLimitMinutes: (interview as { timeLimitMinutes?: number | null }).timeLimitMinutes,
      }, creditRates);

      // Check credits before creating new session (skip for free chat-only)
      const creatorId = interview.userId;
      const organizationId = await resolveInterviewOrganizationId({
        projectId: (interview as { projectId?: string | null }).projectId,
        userId: creatorId,
      });

      if (creditCost > 0) {
        try {
          const available = await getAvailableInterviewCredits(
            creatorId,
            organizationId,
          );
          if (available < creditCost) {
            throw new InsufficientCreditsError(creditCost, available);
          }
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          throw err;
        }
      }

      const { data: sessionJson, error } = await ctx.supabase.rpc(
        "create_invite_session",
        {
          p_invite_token: input.inviteToken,
          p_mode_used: derivedMode,
          p_current_question_id: questions[0]?.id ?? null,
        },
      );

      if (error) {
        log.error("RPC error (createFromInvite):", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      if (creditCost > 0) {
        try {
          await deductInterviewOwnerCredits(creatorId, creditCost, organizationId);
        } catch (err) {
          log.error("Failed to deduct credits after invite session create", { err });
        }
      }

      const session = sessionJson as { id: string };
      await applySessionLanguage(session.id, interview, input.language);
      return { sessionId: session.id, interview, isExisting: false };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select(
          "*, interview:interviews!inner(*, questions(*)), messages(*)",
        )
        .eq("id", input.id)
        .order("order", {
          referencedTable: "interviews.questions",
          ascending: true,
        })
        .order("timestamp", { referencedTable: "messages", ascending: true })
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return session;
    }),

  sendMessage: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        content: z.string().min(1),
        contentType: z
          .enum(["TEXT", "AUDIO", "FILE", "IMAGE", "WHITEBOARD"])
          .default("TEXT"),
        questionId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select("id, status, startedAt, lastActivityAt, activitySegments, interviewId")
        .eq("id", input.sessionId)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (
        session.status === "COMPLETED" ||
        session.status === "ABANDONED"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session is no longer active",
        });
      }

      const { data: userMessage } = await ctx.supabase
        .from("messages")
        .insert({
          sessionId: input.sessionId,
          role: "USER" as const,
          content: input.content,
          contentType: input.contentType,
          questionId: input.questionId ?? null,
          wordCount: input.content.split(/\s+/).length,
        })
        .select()
        .single();

      await ctx.supabase
        .from("sessions")
        .update({ lastActivityAt: new Date().toISOString() })
        .eq("id", input.sessionId);

      return { userMessage };
    }),

  saveWhiteboard: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        drawingId: z.string(),
        label: z.string().optional(),
        snapshotData: z.string(),
        imageDataUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select("id")
        .eq("id", input.sessionId)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { data: existing } = await ctx.supabase
        .from("messages")
        .select("id")
        .eq("sessionId", input.sessionId)
        .eq("contentType", "WHITEBOARD")
        .eq("content", input.drawingId)
        .single();

      const msgData = {
        sessionId: input.sessionId,
        role: "USER" as const,
        content: input.drawingId,
        contentType: "WHITEBOARD" as const,
        whiteboardData: {
          ...JSON.parse(input.snapshotData),
          label: input.label ?? "Drawing",
        },
        ...(input.imageDataUrl
          ? { whiteboardImageUrl: input.imageDataUrl }
          : {}),
      };

      let message;
      if (existing) {
        const { data } = await ctx.supabase
          .from("messages")
          .update(msgData)
          .eq("id", existing.id)
          .select()
          .single();
        message = data;
      } else {
        const { data } = await ctx.supabase
          .from("messages")
          .insert(msgData)
          .select()
          .single();
        message = data;
      }

      return { message };
    }),

  deleteWhiteboard: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        drawingId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.supabase
        .from("messages")
        .delete()
        .eq("sessionId", input.sessionId)
        .eq("contentType", "WHITEBOARD")
        .eq("content", input.drawingId);

      return { success: true };
    }),

  saveCode: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        snippetId: z.string(),
        label: z.string().optional(),
        snapshotData: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select("id")
        .eq("id", input.sessionId)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { data: existing } = await ctx.supabase
        .from("messages")
        .select("id")
        .eq("sessionId", input.sessionId)
        .eq("contentType", "CODE")
        .eq("content", input.snippetId)
        .single();

      const parsed = JSON.parse(input.snapshotData);
      const msgData = {
        sessionId: input.sessionId,
        role: "USER" as const,
        content: input.snippetId,
        contentType: "CODE" as const,
        whiteboardData: {
          ...parsed,
          label: input.label ?? "Code Snippet",
        },
      };

      let message;
      if (existing) {
        const { data } = await ctx.supabase
          .from("messages")
          .update(msgData)
          .eq("id", existing.id)
          .select()
          .single();
        message = data;
      } else {
        const { data } = await ctx.supabase
          .from("messages")
          .insert(msgData)
          .select()
          .single();
        message = data;
      }

      return { message };
    }),

  deleteCode: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        snippetId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.supabase
        .from("messages")
        .delete()
        .eq("sessionId", input.sessionId)
        .eq("contentType", "CODE")
        .eq("content", input.snippetId);

      return { success: true };
    }),

  updateCurrentQuestion: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        questionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select("currentQuestionId, questionsAsked")
        .eq("id", input.sessionId)
        .single();

      let updatedQuestionsAsked = session?.questionsAsked ?? [];
      if (
        session?.currentQuestionId &&
        session.currentQuestionId !== input.questionId &&
        !updatedQuestionsAsked.includes(session.currentQuestionId)
      ) {
        updatedQuestionsAsked = [...updatedQuestionsAsked, session.currentQuestionId];
      }

      await ctx.supabase
        .from("sessions")
        .update({
          currentQuestionId: input.questionId,
          questionsAsked: updatedQuestionsAsked,
          lastActivityAt: new Date().toISOString(),
        })
        .eq("id", input.sessionId);
      return { success: true };
    }),

  updateParticipantName: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        participantName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await supabaseAdmin
        .from("sessions")
        .update({ participantName: input.participantName.trim() })
        .eq("id", input.sessionId);
      return { success: true };
    }),

  setLanguage: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        language: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select("id, status, interview:interviews!inner(multilingualEnabled, is_voice_only)")
        .eq("id", input.sessionId)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      if (session.status === "COMPLETED" || session.status === "ABANDONED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session is no longer active",
        });
      }

      const interview = session.interview as unknown as {
        multilingualEnabled?: boolean | null;
        is_voice_only?: boolean | null;
      };

      if (
        !interview.multilingualEnabled ||
        !interviewAllowsCandidateLanguageChoice(interview)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This interview does not allow candidate language selection",
        });
      }

      const code = resolveLanguage(input.language).code;

      await supabaseAdmin
        .from("sessions")
        .update({ language: code })
        .eq("id", input.sessionId);

      return { success: true, language: code };
    }),

  updateParticipantMetadata: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        participantMetadata: z.record(z.string(), z.any()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select("participantMetadata")
        .eq("id", input.sessionId)
        .single();
      
      const existingMetadata = session?.participantMetadata && typeof session.participantMetadata === "object"
        ? session.participantMetadata
        : {};
      
      const updatedMetadata = {
        ...existingMetadata,
        ...input.participantMetadata,
      };

      await ctx.supabase
        .from("sessions")
        .update({ participantMetadata: updatedMetadata })
        .eq("id", input.sessionId);
      return { success: true };
    }),

  updateEvaluationStatus: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        evaluationStatus: z.enum([
          "PENDING",
          "SHORTLISTED",
          "WAITLISTED",
          "REJECTED",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select(
          "id, interview:interviews!inner(projectId, project:projects!inner(organizationId))",
        )
        .eq("id", input.sessionId)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      const interviewData = session.interview as unknown as {
        projectId: string;
        project: { organizationId: string };
      };
      const orgId = interviewData?.project?.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
      }

      const { data: membership } = await ctx.supabase
        .from("organization_members")
        .select("role")
        .eq("workspaceId", orgId)
        .eq("userId", ctx.user.id)
        .single();

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this organization",
        });
      }

      const projAccess = await hasProjectAccess(
        ctx.supabase,
        interviewData.projectId,
        ctx.user.id,
      );
      if (!projAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this project",
        });
      }
      assertMinRole(membership.role as "SYSTEM_ADMIN" | "ACCOUNT_ADMIN" | "EDITOR" | "VIEWER", "EDITOR");

      const { error } = await ctx.supabase
        .from("sessions")
        .update({ evaluationStatus: input.evaluationStatus })
        .eq("id", input.sessionId);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Also update candidate's evaluation status if linked
      await ctx.supabase
        .from("candidates")
        .update({ evaluationStatus: input.evaluationStatus })
        .eq("sessionId", input.sessionId);

      return { success: true };
    }),


  complete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select("id, startedAt, status")
        .eq("id", input.id)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Idempotent — never require messages / recordings / speech
      if (session.status === "COMPLETED" || session.status === "ABANDONED") {
        return { success: true, alreadyCompleted: true };
      }

      const { data: firstMsg } = await ctx.supabase
        .from("messages")
        .select("timestamp")
        .eq("sessionId", input.id)
        .order("timestamp", { ascending: true })
        .limit(1)
        .maybeSingle();

      const actualStart = firstMsg?.timestamp
        ? new Date(firstMsg.timestamp).getTime()
        : new Date(session.startedAt).getTime();
      const now = new Date();
      const duration = Math.max(
        0,
        Math.round((now.getTime() - actualStart) / 1000),
      );

      await ctx.supabase
        .from("sessions")
        .update({
          status: "COMPLETED" as const,
          completedAt: now.toISOString(),
          startedAt: new Date(actualStart).toISOString(),
          totalDurationSeconds: duration,
        })
        .eq("id", input.id)
        .neq("status", "COMPLETED");

      return { success: true };
    }),

  reportAntiCheatingViolation: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        violation: z.object({
          type: z.enum(["page_departure", "paste", "multi_screen", "tab_switch", "focus_lost", "copy", "cut"]),
          timestamp: z.number(),
          detail: z.string().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select("antiCheatingLog")
        .eq("id", input.sessionId)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      const log = Array.isArray(session.antiCheatingLog) ? session.antiCheatingLog : [];
      log.push(input.violation);

      await ctx.supabase
        .from("sessions")
        .update({ antiCheatingLog: log })
        .eq("id", input.sessionId);

      return { success: true };
    }),

  listAll: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["IN_PROGRESS", "COMPLETED", "ABANDONED"])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get interviews accessible via org membership
      const { data: memberships } = await ctx.supabase
        .from("organization_members")
        .select("workspaceId")
        .eq("userId", ctx.user.id);

      const orgIds = (memberships ?? []).map(
        (m: { workspaceId: string }) => m.workspaceId,
      );
      if (orgIds.length === 0) return { sessions: [] };

      const { data: projects } = await ctx.supabase
        .from("projects")
        .select("id")
        .in("organizationId", orgIds);

      const allProjIds = (projects ?? []).map((p: { id: string }) => p.id);
      const projectIds = await filterAccessibleProjectIds(ctx.supabase, allProjIds, ctx.user.id);
      if (projectIds.length === 0) return { sessions: [] };

      const { data: userInterviews } = await ctx.supabase
        .from("interviews")
        .select("id")
        .in("projectId", projectIds);

      const interviewIds = (userInterviews ?? []).map((i: { id: string }) => i.id);
      if (interviewIds.length === 0) return { sessions: [] };

      let query = ctx.supabase
        .from("sessions")
        .select(
          "*, interview:interviews!inner(id, title, chatEnabled, voiceEnabled, videoEnabled), messages(id)",
        )
        .in("interviewId", interviewIds)
        .order("createdAt", { ascending: false })
        .limit(input.limit);

      if (input.status) {
        query = query.eq("status", input.status);
      }

      const { data: raw } = await query;

      const sessions = (raw ?? []).map((s) => ({
        ...s,
        _count: {
          messages: (s.messages as { id: string }[])?.length ?? 0,
        },
      }));

      return { sessions };
    }),

  listByInterview: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        status: z
          .enum(["IN_PROGRESS", "COMPLETED", "ABANDONED"])
          .optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select("id, projectId, project:projects!inner(organizationId)")
        .eq("id", input.interviewId)
        .single();

      if (!interview) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const projAccess = await hasProjectAccess(ctx.supabase, interview.projectId, ctx.user.id);
      if (!projAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
      }

      const limit = input.limit;

      let query = ctx.supabase
        .from("sessions")
        .select("*, messages(id)")
        .eq("interviewId", input.interviewId)
        .order("createdAt", { ascending: false })
        .limit(limit + 1);

      if (input.status) {
        query = query.eq("status", input.status);
      }

      const { data: raw } = await query;
      const rows = raw ?? [];

      const sessions = rows.slice(0, limit).map((s) => ({
        ...s,
        _count: {
          messages: (s.messages as { id: string }[])?.length ?? 0,
        },
      }));

      let nextCursor: string | undefined;
      if (rows.length > limit) {
        nextCursor = rows[limit - 1].id;
      }

      return { sessions, nextCursor };
    }),

  saveRecording: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        audioRecordingUrl: z.string().nullable().optional(),
        videoRecordingUrl: z.string().nullable().optional(),
        audioDuration: z.number().nullable().optional(),
        screenshots: z
          .array(
            z.object({
              url: z.string(),
              path: z.string(),
              timestamp: z.string(),
              type: z.enum(["camera", "screen"]),
            }),
          )
          .nullable()
          .optional(),
        participantMetadata: z.record(z.string(), z.any()).nullable().optional(),
        videoClips: z
          .array(
            z.object({
              questionId: z.string(),
              clipUrl: z.string(),
              durationSec: z.number(),
            }),
          )
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      log.info(`Saving recording for session ${input.sessionId}`, {
        hasAudio: !!input.audioRecordingUrl,
        hasVideo: !!input.videoRecordingUrl,
        audioDuration: input.audioDuration ?? null,
        screenshotsCount: input.screenshots?.length ?? 0,
      });
      if (!input.audioRecordingUrl && !input.videoRecordingUrl) {
        log.warn(`Session ${input.sessionId}: saveRecording called with no media URLs`, {
          audioDuration: input.audioDuration ?? null,
        });
      }
      const updateData: any = {};

      const resolveUrl = async (val: string | null | undefined, bucket: string) => {
        if (!val) return val;
        // Recordings now upload directly to local disk on this VM
        // (see src/lib/local-media-storage.ts) and already come back as a
        // same-origin /api/media/local/... URL — nothing to resolve.
        if (isLocalMediaUrl(val) || val.startsWith("http")) return val;
        // Legacy Supabase Storage path (pre-local-storage migration): resolve
        // to a signed URL so old sessions keep working.
        const { data, error } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(val, 60 * 60 * 24 * 365); // 1 year
        if (error || !data?.signedUrl) {
          log.warn(`Failed to resolve signed URL in bucket ${bucket}:`, error?.message ?? "no url", val);
          return val;
        }
        return data.signedUrl;
      };

      // Persist whichever uploads succeeded independently (video failure must not
      // block writing audioRecordingUrl, and vice versa).
      if (input.audioRecordingUrl) {
        // Legacy clients mapped video paths into audioRecordingUrl; resolve those
        // against the videos bucket so signed URL creation does not 404.
        const audioPath = input.audioRecordingUrl;
        const audioBucket =
          /(?:^|\/)video-\d+\.webm(?:\?|$)/.test(audioPath) ||
          audioPath.includes("/object/sign/videos/")
            ? "videos"
            : "recordings";
        updateData.audioRecordingUrl = await resolveUrl(audioPath, audioBucket);
      }
      if (input.videoRecordingUrl) {
        updateData.videoRecordingUrl = await resolveUrl(input.videoRecordingUrl, "videos");
      }
      if (input.audioDuration) {
        updateData.audioDuration = input.audioDuration;
      }
      if (input.screenshots) {
        updateData.screenshots = await Promise.all(
          input.screenshots.map(async (s) => ({
            ...s,
            url: await resolveUrl(s.path, "screenshots"),
          }))
        );
      }
      if (input.participantMetadata || input.videoClips) {
        const metadataPayload: Record<string, unknown> = input.participantMetadata ?? {};
        if (input.videoClips && input.videoClips.length > 0) {
          metadataPayload.videoClips = input.videoClips;
        }
        const { data: existingSession } = await supabaseAdmin
          .from("sessions")
          .select("participantMetadata")
          .eq("id", input.sessionId)
          .single();

        const existingMetadata =
          existingSession?.participantMetadata &&
          typeof existingSession.participantMetadata === "object"
            ? existingSession.participantMetadata
            : {};

        updateData.participantMetadata = {
          ...existingMetadata,
          ...metadataPayload,
        };
      }

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      const { error } = await supabaseAdmin
        .from("sessions")
        .update(updateData)
        .eq("id", input.sessionId);

      if (error) {
        log.error(`Failed to persist recording URLs for session ${input.sessionId}`, {
          hasAudio: !!updateData.audioRecordingUrl,
          hasVideo: !!updateData.videoRecordingUrl,
          error: error.message,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      log.info(`Persisted recording URLs for session ${input.sessionId}`, {
        hasAudio: !!updateData.audioRecordingUrl,
        hasVideo: !!updateData.videoRecordingUrl,
        hasAudioDuration: updateData.audioDuration != null,
        audioRecordingUrl: updateData.audioRecordingUrl ?? null,
        videoRecordingUrl: updateData.videoRecordingUrl ?? null,
        audioDuration: updateData.audioDuration ?? null,
      });
      return { success: true };
    }),

  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { data: sessions } = await ctx.supabase
        .from("sessions")
        .select("id, interview:interviews!inner(projectId, project:projects!inner(organizationId))")
        .in("id", input.ids);

      await Promise.all(
        (sessions ?? []).map(async (s) => {
          const interviewData = s.interview as unknown as {
            projectId: string;
            project: { organizationId: string };
          };
          const orgId = interviewData?.project?.organizationId;
          if (!orgId) {
            throw new TRPCError({ code: "NOT_FOUND" });
          }
          const { data: membership } = await ctx.supabase
            .from("organization_members")
            .select("role")
            .eq("workspaceId", orgId)
            .eq("userId", ctx.user.id)
            .single();

          if (!membership) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Not authorized to delete these sessions",
            });
          }
          assertMinRole(membership.role as "SYSTEM_ADMIN" | "ACCOUNT_ADMIN" | "EDITOR" | "VIEWER", "EDITOR");

          const projAccess = await hasProjectAccess(ctx.supabase, interviewData.projectId, ctx.user.id);
          if (!projAccess) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Not authorized to delete these sessions",
            });
          }
        })
      );

      await ctx.supabase.from("sessions").delete().in("id", input.ids);

      return { deleted: input.ids.length };
    }),
});
