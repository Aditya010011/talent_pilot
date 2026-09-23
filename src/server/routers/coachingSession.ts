import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveLanguage,
  trainingAllowsCandidateLanguageChoice,
} from "@/lib/languages";
import { publicProcedure, protectedProcedure, router } from "../trpc";

const progressSchema = z.object({
  activeSlide: z.number().int().min(0).optional(),
  completedSlides: z.record(z.string(), z.boolean()).optional(),
  slidesCompleted: z.boolean().optional(),
  quizState: z.enum(["not_started", "intro", "in_progress", "submitted"]).optional(),
  quizAnswers: z.record(z.string(), z.any()).optional(),
  activeQuestionIdx: z.number().int().min(0).optional(),
  timeLeft: z.number().nullable().optional(),
});

function coachingAllowsSessionLanguage(training: {
  multilingualEnabled?: boolean | null;
  avatarMode?: string | null;
}) {
  return (
    !!training.multilingualEnabled &&
    trainingAllowsCandidateLanguageChoice(training)
  );
}

function resolveCoachingSessionLanguage(
  training: {
    multilingualEnabled?: boolean | null;
    avatarMode?: string | null;
  },
  language?: string | null,
): string | null {
  if (!coachingAllowsSessionLanguage(training) || !language?.trim()) return null;
  return resolveLanguage(language).code;
}

export const coachingSessionRouter = router({
  create: publicProcedure
    .input(
      z.object({
        trainingSlug: z.string(),
        participantName: z.string().optional(),
        participantEmail: z.string().email().optional(),
        language: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: training } = await ctx.supabase
        .from("trainings")
        .select("*")
        .eq("publicSlug", input.trainingSlug)
        .eq("isActive", true)
        .single();

      if (!training) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training not found or inactive",
        });
      }

      const sessionLanguage = resolveCoachingSessionLanguage(training, input.language);

      const insertPayload: Record<string, unknown> = {
        trainingId: (training as { id: string }).id,
        participantName: input.participantName ?? null,
        participantEmail: input.participantEmail ?? null,
        status: "IN_PROGRESS",
      };
      // Only send language when set so Preview still works if the column
      // is missing in an environment that has not run the migration.
      if (sessionLanguage) insertPayload.language = sessionLanguage;

      const { data: session, error } = await ctx.supabase
        .from("coaching_sessions")
        .insert(insertPayload)
        .select()
        .single();

      if (error || !session) {
        console.error("[coachingSession.create]", error?.message ?? "no row returned", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to create coaching session",
        });
      }

      return { sessionId: (session as { id: string }).id, training };
    }),

  createFromInvite: publicProcedure
    .input(z.object({
      inviteToken: z.string(),
      language: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: candidate } = await ctx.supabase
        .from("coaching_candidates")
        .select("*, training:trainings(*), session:coaching_sessions(*)")
        .eq("inviteToken", input.inviteToken)
        .single();

      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite link" });
      }

      const training = (candidate as { training?: unknown }).training as
        | {
            id: string;
            publicSlug?: string | null;
            isActive?: boolean | null;
            multilingualEnabled?: boolean | null;
            avatarMode?: string | null;
          }
        | null;
      if (!training) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training is no longer available",
        });
      }

      const linked =
        (candidate as { session?: unknown }).session ??
        null;
      const existing = Array.isArray(linked) ? linked[0] : linked;
      const existingId =
        (existing as { id?: string } | null)?.id ||
        (candidate as { sessionId?: string | null }).sessionId;

      const sessionLanguage = resolveCoachingSessionLanguage(training, input.language);

      if (existingId) {
        const { data: sess } = await ctx.supabase
          .from("coaching_sessions")
          .select("id, status")
          .eq("id", existingId)
          .maybeSingle();
        if (sess) {
          if (sessionLanguage) {
            await supabaseAdmin
              .from("coaching_sessions")
              .update({ language: sessionLanguage })
              .eq("id", (sess as { id: string }).id);
          }
          return {
            sessionId: (sess as { id: string }).id,
            training,
            isExisting: true,
            status: (sess as { status?: string }).status ?? "IN_PROGRESS",
          };
        }
      }

      const insertPayload: Record<string, unknown> = {
        trainingId: training.id,
        participantName: (candidate as { name?: string }).name ?? null,
        participantEmail: (candidate as { email?: string | null }).email ?? null,
        status: "IN_PROGRESS",
      };
      if (sessionLanguage) insertPayload.language = sessionLanguage;

      const { data: session, error } = await supabaseAdmin
        .from("coaching_sessions")
        .insert(insertPayload)
        .select()
        .single();

      if (error || !session) {
        console.error("[coachingSession.createFromInvite]", error?.message ?? "no row returned", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to create coaching session",
        });
      }

      await supabaseAdmin
        .from("coaching_candidates")
        .update({
          sessionId: (session as { id: string }).id,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", (candidate as { id: string }).id);

      return {
        sessionId: (session as { id: string }).id,
        training,
        isExisting: false,
        status: "IN_PROGRESS",
      };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("coaching_sessions")
        .select("*, training:trainings(*)")
        .eq("id", input.id)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Coaching session not found" });
      }
      return session;
    }),

  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // In a real app we'd verify access, but here we just delete
      const { error } = await ctx.supabase
        .from("coaching_sessions")
        .delete()
        .in("id", input.ids);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return { success: true };
    }),

  complete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { data: session } = await supabaseAdmin
        .from("coaching_sessions")
        .select("id, status, metadata")
        .eq("id", input.id)
        .maybeSingle();

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Coaching session not found",
        });
      }

      if ((session as { status?: string }).status === "COMPLETED") {
        return { success: true, alreadyCompleted: true };
      }

      const meta =
        session.metadata && typeof session.metadata === "object"
          ? (session.metadata as Record<string, unknown>)
          : {};
      const progress =
        meta.progress && typeof meta.progress === "object"
          ? { ...(meta.progress as Record<string, unknown>), slidesCompleted: true }
          : { slidesCompleted: true };

      const { error } = await supabaseAdmin
        .from("coaching_sessions")
        .update({
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
          metadata: { ...meta, progress },
        })
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return { success: true };
    }),

  updateProgress: publicProcedure
    .input(z.object({ id: z.string(), progress: progressSchema }))
    .mutation(async ({ input }) => {
      const { data: session } = await supabaseAdmin
        .from("coaching_sessions")
        .select("id, metadata")
        .eq("id", input.id)
        .maybeSingle();

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Coaching session not found",
        });
      }

      const meta =
        session.metadata && typeof session.metadata === "object"
          ? (session.metadata as Record<string, unknown>)
          : {};
      const prev =
        meta.progress && typeof meta.progress === "object"
          ? (meta.progress as Record<string, unknown>)
          : {};

      const { error } = await supabaseAdmin
        .from("coaching_sessions")
        .update({
          metadata: { ...meta, progress: { ...prev, ...input.progress } },
        })
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
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
        .from("coaching_sessions")
        .select("id, status, training:trainings!inner(multilingualEnabled, avatarMode)")
        .eq("id", input.sessionId)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Coaching session not found" });
      }

      if (session.status === "COMPLETED" || session.status === "ABANDONED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session is no longer active",
        });
      }

      const training = session.training as unknown as {
        multilingualEnabled?: boolean | null;
        avatarMode?: string | null;
      };

      if (!coachingAllowsSessionLanguage(training)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This training does not allow candidate language selection",
        });
      }

      const code = resolveLanguage(input.language).code;

      await supabaseAdmin
        .from("coaching_sessions")
        .update({ language: code })
        .eq("id", input.sessionId);

      return { success: true, language: code };
    }),

  list: protectedProcedure
    .input(z.object({ trainingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: sessions } = await ctx.supabase
        .from("coaching_sessions")
        .select("*")
        .eq("trainingId", input.trainingId)
        .order("startedAt", { ascending: false });

      return { sessions: sessions ?? [] };
    }),
});
