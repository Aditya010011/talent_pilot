import { nanoid } from "@/lib/id";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateCoachingScript } from "@/lib/coaching-script";
import type { LLMMessage } from "@/lib/ai/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { trainingAllowsCandidateLanguageChoice } from "@/lib/languages";
import { scriptSlideSchema, shouldSkipScriptGeneration, type ScriptSlide } from "@/lib/slide-media";
import {
  assertMinRole,
  getEffectiveProjectRole,
  getOrgMembership,
  protectedProcedure,
  publicProcedure,
  router,
  hasProjectAccess,
  filterAccessibleProjectIds,
} from "../trpc";

const emptyDashboard = () => ({
  daily: [],
  statusBreakdown: { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 },
  questionTypeBreakdown: [],
  topThemes: [],
  recentSessions: [],
});

/** Slide 1 thumbnail from `script_slides[0].imageUrl` (http URL or data URL). */
function resolveFirstSlideImageUrl(firstSlide: unknown): string | null {
  const slide = Array.isArray(firstSlide) ? firstSlide[0] : firstSlide;
  if (typeof slide === "string") {
    const trimmed = slide.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!slide || typeof slide !== "object") return null;
  const url = (slide as { imageUrl?: unknown }).imageUrl;
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const trainingRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          projectId: z.string().optional(),
          limit: z.number().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;

      let query = ctx.supabase
        .from("trainings")
        .select(
          "id, title, description, publicSlug, isActive, timeLimitMinutes, pregenerated_videos, updatedAt, createdAt, projectId, organizationId, project:projects(id, name), firstSlide:script_slides->0",
        )
        .order("updatedAt", { ascending: false })
        .limit(limit);

      if (input?.projectId) {
        query = query.eq("projectId", input.projectId);
      } else if (input?.organizationId) {
        query = query.eq("organizationId", input.organizationId);
      } else {
        const { data: memberships } = await ctx.supabase
          .from("organization_members")
          .select("workspaceId")
          .eq("userId", ctx.user.id);
        const orgIds = (memberships ?? []).map(
          (m: { workspaceId: string }) => m.workspaceId,
        );
        if (orgIds.length === 0) return { trainings: [] };
        query = query.in("organizationId", orgIds);
      }

      const { data: raw } = await query;
      const trainings = (raw ?? []).map((row: Record<string, unknown>) => {
        const { firstSlide, ...rest } = row;
        return {
          ...rest,
          firstSlideImageUrl: resolveFirstSlideImageUrl(firstSlide),
        };
      });
      return { trainings };
    }),

  dashboardStats: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { data: memberships } = await ctx.supabase
        .from("organization_members")
        .select("workspaceId")
        .eq("userId", ctx.user.id);

      const orgIds = (memberships ?? []).map(
        (m: { workspaceId: string }) => m.workspaceId,
      );
      if (orgIds.length === 0) return emptyDashboard();

      let projectIds: string[];
      if (input?.projectId) {
        const ok = await hasProjectAccess(ctx.supabase, input.projectId, ctx.user.id);
        projectIds = ok ? [input.projectId] : [];
      } else {
        const { data: projects } = await ctx.supabase
          .from("projects")
          .select("id")
          .in("organizationId", orgIds);
        const allProjIds = (projects ?? []).map((p: { id: string }) => p.id);
        projectIds = await filterAccessibleProjectIds(ctx.supabase, allProjIds, ctx.user.id);
      }
      if (projectIds.length === 0) return emptyDashboard();

      const { data: trainings } = await ctx.supabase
        .from("trainings")
        .select("id, title, createdAt")
        .in("projectId", projectIds);
      const trainingIds = (trainings ?? []).map((t: { id: string }) => t.id);
      if (trainingIds.length === 0) return emptyDashboard();

      // Apply date filters to sessions (the activity data)
      let sessionsQuery = ctx.supabase
        .from("coaching_sessions")
        .select("id, trainingId, status, startedAt, completedAt, participantName, participantEmail")
        .in("trainingId", trainingIds);
      if (input?.startDate) {
        sessionsQuery = sessionsQuery.gte("startedAt", input.startDate);
      }
      if (input?.endDate) {
        sessionsQuery = sessionsQuery.lte("startedAt", input.endDate);
      }
      const { data: sessions } = await sessionsQuery;

      const allSessions = sessions ?? [];
      const now = input?.endDate ? new Date(input.endDate) : new Date();
      const startDateInit = input?.startDate ? new Date(input.startDate) : (() => {
        const d = new Date(now);
        d.setDate(d.getDate() - 13);
        return d;
      })();

      const endDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const startDay = new Date(Date.UTC(startDateInit.getUTCFullYear(), startDateInit.getUTCMonth(), startDateInit.getUTCDate()));
      const dailyObj: Record<string, any> = {};
      for (
        let d = new Date(startDay);
        d <= endDay;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const dateStr = d.toISOString().split("T")[0];
        dailyObj[dateStr] = { date: dateStr, sessions: 0, sessionMinutes: 0, messages: 0 };
      }

      const trainingMap = new Map((trainings ?? []).map((t: { id: string; title: string }) => [t.id, t.title]));
      const tBreakdown: Record<string, number> = {};

      let completed = 0;
      let inProgress = 0;
      
      allSessions.forEach((s: any) => {
        if (s.status === "COMPLETED") completed++;
        else if (s.status === "IN_PROGRESS") inProgress++;

        const tName = trainingMap.get(s.trainingId) || "Unknown Training";
        tBreakdown[tName] = (tBreakdown[tName] || 0) + 1;

        const d = new Date(s.startedAt || s.createdAt);
        const dateStr = d.toISOString().split("T")[0];
        if (dailyObj[dateStr]) {
          dailyObj[dateStr].sessions++;
          if (s.completedAt && s.startedAt) {
            const mins = Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 60000);
            dailyObj[dateStr].sessionMinutes += mins;
          }
        }
      });

      // For NOT_STARTED, we can count pending coaching candidates
      const { count: pendingCount } = await ctx.supabase
        .from("coaching_candidates")
        .select("id", { count: "exact", head: true })
        .in("trainingId", trainingIds)
        .eq("evaluationStatus", "PENDING")
        .is("sessionId", null);

      return {
        daily: Object.values(dailyObj).sort((a: any, b: any) => a.date.localeCompare(b.date)),
        statusBreakdown: { COMPLETED: completed, IN_PROGRESS: inProgress, NOT_STARTED: pendingCount ?? 0 },
        questionTypeBreakdown: Object.entries(tBreakdown).map(([name, value]) => ({ name, value })),
        topThemes: emptyDashboard().topThemes,
        recentSessions: allSessions
          .sort((a: any, b: any) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())
          .slice(0, 10)
          .map((s: any) => ({
             ...s,
             createdAt: s.startedAt,
             totalDurationSeconds: s.completedAt && s.startedAt ? (new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000 : 0,
             themes: [],
          })),
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: training } = await ctx.supabase
        .from("trainings")
        .select("*")
        .eq("id", input.id)
        .single();

      if (!training) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
      }

      const membership = await getOrgMembership(
        ctx.supabase,
        (training as { organizationId: string }).organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return training;
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: training } = await ctx.supabase
        .from("trainings")
        .select("*")
        .eq("publicSlug", input.slug)
        .eq("isActive", true)
        .single();

      if (!training) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
      }
      return training;
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        objective: z.string().optional(),
        aiName: z.string().default("AI Coach"),
        aiTone: z
          .enum(["CASUAL", "PROFESSIONAL", "FORMAL", "FRIENDLY"])
          .default("PROFESSIONAL"),
        language: z.string().default("en"),
        avatarMode: z.enum(["none", "static", "vidu"]).default("vidu"),
        avatarImageUrl: z.string().nullable().optional(),
        avatarVoice: z.string().nullable().optional(),
        multilingualEnabled: z.boolean().default(false),
        timeLimitMinutes: z.number().int().min(1).optional(),
        presentationText: z.string().optional(),
        customSlides: z.array(scriptSlideSchema).optional(),
        quiz_settings: z.unknown().optional(),
        quiz_questions: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Resolve org from project or membership
      let organizationId: string;
      let projectId = input.projectId;

      if (projectId) {
        const { data: proj } = await ctx.supabase
          .from("projects")
          .select("organizationId")
          .eq("id", projectId)
          .single();
        if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        organizationId = (proj as { organizationId: string }).organizationId;
      } else {
        const { data: membership } = await ctx.supabase
          .from("organization_members")
          .select("workspaceId")
          .eq("userId", ctx.user.id)
          .limit(1)
          .single();
        if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No organization found" });
        organizationId = (membership as { workspaceId: string }).workspaceId;

        const { data: defaultProject } = await ctx.supabase
          .from("projects")
          .select("id")
          .eq("organizationId", organizationId)
          .order("createdAt", { ascending: true })
          .limit(1)
          .single();
        projectId = (defaultProject as { id: string } | null)?.id;
      }

      const membership = await getOrgMembership(ctx.supabase, organizationId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (projectId) {
        const hasAccess = await hasProjectAccess(ctx.supabase, projectId, ctx.user.id);
        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
      }
      const effectiveRole = projectId
        ? await getEffectiveProjectRole(
            ctx.supabase,
            projectId,
            ctx.user.id,
            membership.role,
          )
        : membership.role;
      assertMinRole(effectiveRole, "EDITOR");

      const { data: orgFlags } = await supabaseAdmin
        .from("organizations")
        .select("coachingEnabled")
        .eq("id", organizationId)
        .single();
      if (!orgFlags?.coachingEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Coaching is not enabled for this organization.",
        });
      }

      const publicSlug = nanoid(10);

      // Analyze presentation text and generate the initial script automatically if provided
      let scriptSlides: any = null;
      if (input.customSlides && input.customSlides.length > 0) {
        scriptSlides = input.customSlides;
        if (input.presentationText) {
          const aiGenerated = await generateCoachingScript(input.presentationText, input.language, scriptSlides);
          if (Array.isArray(aiGenerated) && aiGenerated.length > 0) {
            scriptSlides = scriptSlides.map((s: any, idx: number) => ({
              ...s,
              title: aiGenerated[idx]?.title || s.title,
              script: aiGenerated[idx]?.script || s.script,
            }));
          }
        }
      } else if (input.presentationText) {
        scriptSlides = await generateCoachingScript(input.presentationText, input.language);
      }

      if (!scriptSlides || !Array.isArray(scriptSlides) || scriptSlides.length === 0) {
        scriptSlides = [
          { slide: 1, title: "1. Introduction & Overview", script: `Welcome to ${input.title}. Today we will cover the key presentation objectives.` },
          { slide: 2, title: "2. Key Concepts & Analysis", script: "In this section, we review the primary findings and core discussion points." },
          { slide: 3, title: "3. Strategy & Implementation", script: "Next, we outline practical steps and action plans for implementation." },
          { slide: 4, title: "4. Summary & Evaluation", script: "To conclude, we summarize our main takeaways and next steps." },
        ];
      }

      const { data: training, error } = await ctx.supabase
        .from("trainings")
        .insert({
          projectId,
          organizationId,
          title: input.title,
          description: input.description,
          objective: input.objective,
          aiName: input.aiName,
          aiTone: input.aiTone,
          language: input.language,
          avatarMode: input.avatarMode,
          avatarImageUrl: input.avatarImageUrl ?? null,
          avatarVoice: input.avatarVoice ?? null,
          multilingualEnabled:
            input.avatarMode === "none" ? input.multilingualEnabled : false,
          timeLimitMinutes: input.timeLimitMinutes ?? null,
          publicSlug,
          isActive: true,
          userId: ctx.user.id,
          presentation_text: input.presentationText ?? null,
          script_slides: scriptSlides,
          generation_status: "IDLE",
          quiz_settings: input.quiz_settings ?? {},
          quiz_questions: input.quiz_questions ?? [],
        })
        .select()
        .single();

      if (error || !training) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to create training",
        });
      }

      return training;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        objective: z.string().optional(),
        aiName: z.string().optional(),
        aiTone: z.enum(["CASUAL", "PROFESSIONAL", "FORMAL", "FRIENDLY"]).optional(),
        language: z.string().optional(),
        avatarMode: z.enum(["none", "static", "vidu"]).optional(),
        avatarImageUrl: z.string().nullable().optional(),
        avatarVoice: z.string().nullable().optional(),
        multilingualEnabled: z.boolean().optional(),
        timeLimitMinutes: z.number().int().min(1).nullable().optional(),
        isActive: z.boolean().optional(),
        pregenerated_videos: z.unknown().optional(),
        script_slides: z.array(scriptSlideSchema).optional(),
        generation_status: z.enum(["IDLE", "PENDING", "GENERATING", "READY"]).optional(),
        quiz_settings: z.unknown().optional(),
        quiz_questions: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, multilingualEnabled, avatarMode, ...rest } = input;
      const { data: existing } = await ctx.supabase
        .from("trainings")
        .select("organizationId, projectId, avatarMode")
        .eq("id", id)
        .single();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const membership = await getOrgMembership(
        ctx.supabase,
        (existing as { organizationId: string }).organizationId,
        ctx.user.id,
      );
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const existingProjectId = (existing as { projectId?: string | null }).projectId;
      if (existingProjectId) {
        const hasAccess = await hasProjectAccess(ctx.supabase, existingProjectId, ctx.user.id);
        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
      }
      const effectiveRole = existingProjectId
        ? await getEffectiveProjectRole(
            ctx.supabase,
            existingProjectId,
            ctx.user.id,
            membership.role,
          )
        : membership.role;
      assertMinRole(effectiveRole, "EDITOR");

      const nextAvatarMode =
        avatarMode ?? (existing as { avatarMode?: string | null }).avatarMode;
      const avatarOff = trainingAllowsCandidateLanguageChoice({
        avatarMode: nextAvatarMode,
      });

      const { data: updated, error } = await ctx.supabase
        .from("trainings")
        .update({
          ...rest,
          ...(avatarMode !== undefined ? { avatarMode } : {}),
          ...(multilingualEnabled !== undefined
            ? { multilingualEnabled: avatarOff ? multilingualEnabled : false }
            : !avatarOff && avatarMode !== undefined
              ? { multilingualEnabled: false }
              : {}),
          updatedAt: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: existing } = await ctx.supabase
        .from("trainings")
        .select("organizationId")
        .eq("id", input.id)
        .single();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const membership = await getOrgMembership(
        ctx.supabase,
        (existing as { organizationId: string }).organizationId,
        ctx.user.id,
      );
      if (!membership || !["SYSTEM_ADMIN", "ACCOUNT_ADMIN"].includes(membership.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.supabase.from("trainings").delete().eq("id", input.id);
      return { success: true };
    }),

  generateScript: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        presentationText: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: training } = await ctx.supabase
        .from("trainings")
        .select("*")
        .eq("id", input.id)
        .single();

      if (!training) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
      }

      const membership = await getOrgMembership(
        ctx.supabase,
        (training as { organizationId: string }).organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const trainingProjectId = (training as { projectId?: string | null }).projectId;
      if (trainingProjectId) {
        const hasAccess = await hasProjectAccess(ctx.supabase, trainingProjectId, ctx.user.id);
        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
      }
      const effectiveRole = trainingProjectId
        ? await getEffectiveProjectRole(
            ctx.supabase,
            trainingProjectId,
            ctx.user.id,
            membership.role,
          )
        : membership.role;
      assertMinRole(effectiveRole, "EDITOR");

      const presentationText =
        input.presentationText?.trim() ||
        (training as any).presentation_text ||
        "";
      const existingSlides: ScriptSlide[] =
        Array.isArray((training as any).script_slides) && (training as any).script_slides.length > 0
          ? (training as any).script_slides
          : [];

      if (!presentationText && existingSlides.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No presentation text or slides available to generate script.",
        });
      }

      const scriptSlides = await generateCoachingScript(
        presentationText,
        (training as any).language || "en",
        existingSlides.length > 0 ? existingSlides : undefined,
      );

      const { data: updated, error } = await ctx.supabase
        .from("trainings")
        .update({
          script_slides: scriptSlides,
          ...(input.presentationText !== undefined
            ? { presentation_text: input.presentationText }
            : {}),
          updatedAt: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return updated;
    }),

  generateSingleSlide: protectedProcedure
    .input(z.object({ id: z.string(), slideIndex: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { data: training } = await ctx.supabase
        .from("trainings")
        .select("*")
        .eq("id", input.id)
        .single();

      if (!training) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
      }

      const membership = await getOrgMembership(
        ctx.supabase,
        (training as { organizationId: string }).organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const trainingProjectId = (training as { projectId?: string | null }).projectId;
      if (trainingProjectId) {
        const hasAccess = await hasProjectAccess(ctx.supabase, trainingProjectId, ctx.user.id);
        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
      }
      const effectiveRole = trainingProjectId
        ? await getEffectiveProjectRole(
            ctx.supabase,
            trainingProjectId,
            ctx.user.id,
            membership.role,
          )
        : membership.role;
      assertMinRole(effectiveRole, "EDITOR");

      const presentationText = (training as any).presentation_text ?? "";
      const existingSlides = Array.isArray((training as any).script_slides) ? (training as any).script_slides : [];
      if (input.slideIndex < 0 || input.slideIndex >= existingSlides.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid slide index" });
      }

      const slide = existingSlides[input.slideIndex];
      if (shouldSkipScriptGeneration(slide)) {
        return training;
      }
      const { generateSlideScript } = await import("@/lib/coaching-script");

      const { title, script } = await generateSlideScript(
        slide.slide,
        existingSlides.length,
        slide.title,
        presentationText,
        slide.imageUrl,
        (training as any).language || "en",
        slide.script,
      );

      const updatedSlides = [...existingSlides];
      updatedSlides[input.slideIndex] = {
        ...slide,
        title,
        script,
      };

      const { data: updated, error } = await ctx.supabase
        .from("trainings")
        .update({
          script_slides: updatedSlides,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return updated;
    }),

  generateQuizQuestions: protectedProcedure
    .input(
      z.object({
        trainingId: z.string(),
        counts: z.object({
          mcq_single: z.number().int().min(0).max(30),
          mcq_multiple: z.number().int().min(0).max(30),
          tf: z.number().int().min(0).max(30),
          short_answer: z.number().int().min(0).max(30),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { trainingId, counts } = input;
      const total = counts.mcq_single + counts.mcq_multiple + counts.tf + counts.short_answer;
      if (total === 0 || total > 30) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Total questions must be between 1 and 30.",
        });
      }

      const { data: training } = await ctx.supabase
        .from("trainings")
        .select("*")
        .eq("id", trainingId)
        .single();

      if (!training) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
      }
      const membership = await getOrgMembership(
        ctx.supabase,
        (training as { organizationId: string }).organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const trainingProjectId = (training as { projectId?: string | null }).projectId;
      if (trainingProjectId) {
        const hasAccess = await hasProjectAccess(ctx.supabase, trainingProjectId, ctx.user.id);
        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
      }
      const effectiveRole = trainingProjectId
        ? await getEffectiveProjectRole(
            ctx.supabase,
            trainingProjectId,
            ctx.user.id,
            membership.role,
          )
        : membership.role;
      assertMinRole(effectiveRole, "EDITOR");

      const slides = Array.isArray((training as any).script_slides) ? (training as any).script_slides : [];
      const presentationText = (training as any).presentation_text || "";

      // Build context from slides and scripts
      const contextBlocks = slides.map((s: any) => {
        return `Slide ${s.slide}: ${s.title}\nScript: ${s.script || ""}`;
      }).join("\n\n");

      const { getProvider, GENERATOR_MODEL } = await import("@/lib/ai/registry");
      const { extractJson } = await import("@/lib/ai/extract-json");
      const provider = getProvider(GENERATOR_MODEL);

      const systemPrompt = `You are an expert trainer. Your task is to generate quiz questions based on the provided slides and teaching script.
You must generate exactly:
- ${counts.mcq_single} MCQ questions with 1 correct answer (type: MCQ_SINGLE)
- ${counts.mcq_multiple} MCQ questions with multiple correct answers (type: MCQ_MULTIPLE)
- ${counts.tf} True/False questions (type: TF)
- ${counts.short_answer} Short Answer questions (type: SHORT_ANSWER)

Total questions to generate: ${total}.

Output MUST be a valid JSON array of question objects, with NO other text, thinking blocks, or markdown formatting. Keep answers and explanations concise to avoid truncation.
Each question object MUST have this structure:
{
  "id": "generate a unique short string",
  "type": "MCQ_SINGLE" | "MCQ_MULTIPLE" | "TF" | "SHORT_ANSWER",
  "text": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"], // for MCQ_SINGLE and MCQ_MULTIPLE, 4 choices. For TF, ["True", "False"]. For SHORT_ANSWER, empty array []
  "correctAnswer": "Option A" // For MCQ_SINGLE (matching one option). For MCQ_MULTIPLE, this must be an array of correct options like ["Option A", "Option C"]. For TF, "True" or "False". For SHORT_ANSWER, a sample/model answer.
}`;

      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Here is the training presentation context:\n\n${contextBlocks}\n\nAdditional presentation text:\n${presentationText.slice(0, 3000)}\n\nGenerate the quiz JSON now.`,
        },
      ];

      let fullContent = "";
      for await (const chunk of provider.streamResponse({
        messages,
        temperature: 0.5,
        maxTokens: 8192,
        model: GENERATOR_MODEL,
      })) {
        fullContent += chunk;
      }

      const thinkEnd = fullContent.indexOf("</think>");
      if (thinkEnd >= 0) fullContent = fullContent.slice(thinkEnd + "</think>".length).trim();

      const questions = extractJson<any[]>(fullContent);
      if (!Array.isArray(questions)) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate valid quiz questions format from AI.",
        });
      }

      // Add unique IDs using nanoid and filter out broken/incomplete questions
      const processedQuestions = questions
        .filter((q: any) => q && typeof q === "object" && q.text && q.type && q.correctAnswer !== undefined)
        .map((q: any) => ({
          ...q,
          id: q.id || nanoid(8),
        }));

      return processedQuestions;
    }),

  submitQuiz: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        answers: z.array(
          z.object({
            questionId: z.string(),
            answer: z.union([z.string(), z.array(z.string())]),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId, answers } = input;

      const { data: session } = await ctx.supabase
        .from("coaching_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Coaching session not found" });
      }

      const { data: training } = await ctx.supabase
        .from("trainings")
        .select("*")
        .eq("id", session.trainingId)
        .single();

      if (!training) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
      }

      const questions = Array.isArray((training as any).quiz_questions) ? (training as any).quiz_questions : [];
      const answersMap = new Map(answers.map((a) => [a.questionId, a.answer]));

      let correctObjective = 0;
      let totalObjective = 0;
      let shortAnswerCount = 0;
      let shortAnswerSum = 0;

      const processedAnswers: any[] = [];

      const { getProvider, GENERATOR_MODEL } = await import("@/lib/ai/registry");
      const { extractJson } = await import("@/lib/ai/extract-json");
      const provider = getProvider(GENERATOR_MODEL);

      for (const q of questions) {
        const candidateAns = answersMap.get(q.id);
        const reportAns: any = {
          questionId: q.id,
          text: q.text,
          type: q.type,
          candidateAnswer: candidateAns ?? "",
          correctAnswer: q.correctAnswer,
        };

        if (q.type === "MCQ_SINGLE" || q.type === "TF") {
          totalObjective++;
          const cleanCorrect = String(q.correctAnswer).trim().toLowerCase();
          const cleanCandidate = String(candidateAns || "").trim().toLowerCase();
          const isCorrect = cleanCorrect === cleanCandidate;
          if (isCorrect) correctObjective++;
          reportAns.isCorrect = isCorrect;
        } else if (q.type === "MCQ_MULTIPLE") {
          totalObjective++;
          const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer.map((x: any) => String(x).trim().toLowerCase()).sort() : [];
          const candidateArr = Array.isArray(candidateAns) ? candidateAns.map((x: any) => String(x).trim().toLowerCase()).sort() : [];
          const isCorrect = JSON.stringify(correctArr) === JSON.stringify(candidateArr);
          if (isCorrect) correctObjective++;
          reportAns.isCorrect = isCorrect;
        } else if (q.type === "SHORT_ANSWER") {
          shortAnswerCount++;
          const graderPrompt = `You are an expert AI grader. Evaluate the user's short answer response to the following question.
Question: "${q.text}"
Model Correct/Sample Answer: "${q.correctAnswer || ""}"
Candidate's Answer: "${candidateAns || ""}"

Grade the candidate's response on a scale of 1 to 5 stars (1 is completely incorrect/irrelevant, 5 is perfect/fully correct).
Provide a rating (integer 1-5) and a short, constructive one-sentence feedback comment explaining the rating.

Output MUST be a JSON object, no markdown, no other text:
{
  "rating": 4,
  "comment": "Good answer, but missed key point X."
}`;

          let responseText = "";
          try {
            for await (const chunk of provider.streamResponse({
              messages: [{ role: "user", content: graderPrompt }],
              temperature: 0.3,
              maxTokens: 512,
              model: GENERATOR_MODEL,
            })) {
              responseText += chunk;
            }

            const thinkEnd = responseText.indexOf("</think>");
            if (thinkEnd >= 0) responseText = responseText.slice(thinkEnd + "</think>".length).trim();

            const parsedGrade = extractJson<any>(responseText);
            const rating = Math.min(5, Math.max(1, Number(parsedGrade?.rating || 1)));
            const comment = String(parsedGrade?.comment || "No comment provided.");

            reportAns.rating = rating;
            reportAns.comment = comment;
            shortAnswerSum += rating;
          } catch (err) {
            reportAns.rating = 1;
            reportAns.comment = "AI evaluation failed.";
            shortAnswerSum += 1;
          }
        }

        processedAnswers.push(reportAns);
      }

      const overallScore = totalObjective > 0 ? `${correctObjective}/${totalObjective}` : "N/A";
      const avgShortAnswerRating = shortAnswerCount > 0 ? Number((shortAnswerSum / shortAnswerCount).toFixed(1)) : 0;

      const totalScorePotential = totalObjective + (shortAnswerCount * 5);
      const earnedScore = correctObjective + shortAnswerSum;
      const percentageScore = totalScorePotential > 0 ? Math.round((earnedScore / totalScorePotential) * 100) : 100;

      const minPassPercentage = (training as any).quiz_settings?.minPassPercentage ?? 80;
      const passed = percentageScore >= minPassPercentage;

      const quizResults = {
        completed: true,
        score: overallScore,
        totalObjective,
        correctObjective,
        shortAnswerAverage: avgShortAnswerRating,
        answers: processedAnswers,
        submittedAt: new Date().toISOString(),
        percentageScore,
        minPassPercentage,
        passed,
      };

      const updateData: any = {
        quiz_results: quizResults,
      };

      if (passed) {
        updateData.status = "COMPLETED";
        updateData.completedAt = new Date().toISOString();
      }

      const { error: updateErr } = await ctx.supabase
        .from("coaching_sessions")
        .update(updateData)
        .eq("id", sessionId);

      if (updateErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update coaching session with quiz results",
        });
      }

      return quizResults;
    }),

  generateScriptsForInsertedSlides: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        insertedSlides: z.array(
          z.object({
            slide: z.number(),
            title: z.string(),
            imageUrl: z.string().nullable().optional(),
          })
        ),
        presentationText: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: training } = await ctx.supabase
        .from("trainings")
        .select("*")
        .eq("id", input.id)
        .single();

      if (!training) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
      }

      const membership = await getOrgMembership(
        ctx.supabase,
        (training as { organizationId: string }).organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const trainingProjectId = (training as { projectId?: string | null }).projectId;
      if (trainingProjectId) {
        const hasAccess = await hasProjectAccess(ctx.supabase, trainingProjectId, ctx.user.id);
        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
      }
      const effectiveRole = trainingProjectId
        ? await getEffectiveProjectRole(
            ctx.supabase,
            trainingProjectId,
            ctx.user.id,
            membership.role,
          )
        : membership.role;
      assertMinRole(effectiveRole, "EDITOR");

      const generated = await generateCoachingScript(
        input.presentationText,
        (training as any).language || "en",
        input.insertedSlides,
      );

      return generated;
    }),
});
