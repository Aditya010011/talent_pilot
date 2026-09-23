import { mergeCreditRates } from "@/lib/interview-credits";
import { loadCreditRates } from "@/lib/load-credit-rates";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isSystemAdmin, protectedProcedure, router } from "../trpc";

const interviewCreditTypeSchema = z.enum([
  "realtime_avatar",
  "voice_only",
  "non_interactive",
  "chat",
  "cv_analysis",
]);

export const creditRatesRouter = router({
  list: protectedProcedure.query(async () => {
    return loadCreditRates();
  }),

  update: protectedProcedure
    .input(
      z.object({
        rates: z
          .array(
            z.object({
              interviewType: interviewCreditTypeSchema,
              credits: z.number().min(0).max(10_000),
              minutes: z.number().int().min(1).max(24 * 60),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await isSystemAdmin(ctx.supabase, ctx.user.id))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the system administrator can manage credit rates.",
        });
      }

      const now = new Date().toISOString();
      const rows = input.rates.map((rate) => ({
        interviewType: rate.interviewType,
        credits: rate.credits,
        minutes: rate.minutes,
        updatedAt: now,
      }));

      const { error } = await supabaseAdmin.from("credit_rates").upsert(rows, {
        onConflict: "interviewType",
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return mergeCreditRates(rows);
    }),
});
