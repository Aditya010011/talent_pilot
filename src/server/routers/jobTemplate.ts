import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isSystemAdmin, protectedProcedure, router } from "../trpc";

export const jobTemplateRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("jobTemplates")
      .select("*")
      .order("jobType", { ascending: true })
      .order("title", { ascending: true });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return data;
  }),

  create: protectedProcedure
    .input(
      z.object({
        jobType: z.string().min(1),
        title: z.string().min(1),
        jobDescription: z.string().min(1),
        scoringRubric: z.any().optional(),
        interviewQuestions: z.any().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Limit template creation to system admins
      if (!(await isSystemAdmin(ctx.supabase, ctx.user.id))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the system administrator can manage job templates.",
        });
      }

      const { data, error } = await ctx.supabase
        .from("jobTemplates")
        .insert({
          jobType: input.jobType,
          title: input.title,
          jobDescription: input.jobDescription,
          scoringRubric: input.scoringRubric ?? null,
          interviewQuestions: input.interviewQuestions ?? null,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        jobType: z.string().min(1),
        title: z.string().min(1),
        jobDescription: z.string().min(1),
        scoringRubric: z.any().optional(),
        interviewQuestions: z.any().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await isSystemAdmin(ctx.supabase, ctx.user.id))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the system administrator can manage job templates.",
        });
      }

      const { data, error } = await ctx.supabase
        .from("jobTemplates")
        .update({
          jobType: input.jobType,
          title: input.title,
          jobDescription: input.jobDescription,
          scoringRubric: input.scoringRubric ?? null,
          interviewQuestions: input.interviewQuestions ?? null,
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

      return data;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await isSystemAdmin(ctx.supabase, ctx.user.id))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the system administrator can manage job templates.",
        });
      }

      const { error } = await ctx.supabase
        .from("jobTemplates")
        .delete()
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true };
    }),
});
