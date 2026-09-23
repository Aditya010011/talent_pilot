import { DEFAULT_EMAIL_TEMPLATE } from "@/lib/email-constants";
import { renderInviteEmail, sendEmail } from "@/lib/email";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assertMinRole,
  getEffectiveProjectRole,
  getOrgMembership,
  hasProjectAccess,
  protectedProcedure,
  router,
  type MemberRole,
} from "../trpc";

/* ------------------------------------------------------------------ */
/*  Helper: verify training access                                    */
/* ------------------------------------------------------------------ */

async function verifyTrainingAccess(
  supabase: Parameters<typeof getOrgMembership>[0],
  trainingId: string,
  userId: string,
): Promise<{
  role: MemberRole;
  training: {
    id: string;
    title: string;
    description: string | null;
    publicSlug: string | null;
    userId: string;
    projectId: string | null;
  };
  organizationId: string;
  organizationName: string;
}> {
  const { data: training } = await supabase
    .from("trainings")
    .select(
      "id, title, description, publicSlug, userId, projectId, project:projects(organizationId)",
    )
    .eq("id", trainingId)
    .single();

  if (!training) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
  }

  let orgId = "";
  if (training.projectId && training.project) {
    orgId = (training.project as any).organizationId;
  } else {
    const { data: tOrg } = await supabase
      .from("trainings")
      .select("organizationId")
      .eq("id", trainingId)
      .single();
    if (tOrg) orgId = tOrg.organizationId;
  }

  if (!orgId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Training is not linked to an organization" });
  }

  const membership = await getOrgMembership(
    supabase,
    orgId,
    userId,
  );
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this organization",
    });
  }

  if (training.projectId) {
    const projAccess = await hasProjectAccess(
      supabase,
      training.projectId,
      userId,
    );
    if (!projAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have access to this project",
      });
    }
  }

  const effectiveRole = training.projectId
    ? await getEffectiveProjectRole(
        supabase,
        training.projectId,
        userId,
        membership.role,
      )
    : membership.role;

  // Get org name for email template
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  return {
    role: effectiveRole,
    training: {
      id: training.id,
      title: training.title,
      description: training.description,
      publicSlug: training.publicSlug,
      userId: training.userId,
      projectId: training.projectId,
    },
    organizationId: orgId,
    organizationName: org?.name || "Inluwa",
  };
}

/* ------------------------------------------------------------------ */
/*  Max batch size to prevent abuse                                    */
/* ------------------------------------------------------------------ */
const MAX_BATCH_SIZE = 50;

export const coachingEmailInviteRouter = router({
  getTemplate: protectedProcedure
    .input(z.object({ trainingId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyTrainingAccess(
        ctx.supabase,
        input.trainingId,
        ctx.user.id,
      );

      const { data: template } = await ctx.supabase
        .from("coaching_email_templates")
        .select("*")
        .eq("trainingId", input.trainingId)
        .single();

      if (!template) {
        return {
          ...DEFAULT_EMAIL_TEMPLATE,
          trainingId: input.trainingId,
          id: null,
        };
      }

      return template;
    }),

  saveTemplate: protectedProcedure
    .input(
      z.object({
        trainingId: z.string(),
        subject: z.string().min(1).max(500),
        body: z.string().max(50000),
        reminderSubject: z.string().max(500).optional(),
        reminderBody: z.string().max(50000).optional(),
        logoUrl: z.string().url().nullable().optional(),
        replyTo: z.string().email().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role } = await verifyTrainingAccess(
        ctx.supabase,
        input.trainingId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");

      const { trainingId, ...fields } = input;

      const { data: existing } = await ctx.supabase
        .from("coaching_email_templates")
        .select("id")
        .eq("trainingId", trainingId)
        .single();

      if (existing) {
        const { data, error } = await ctx.supabase
          .from("coaching_email_templates")
          .update(fields)
          .eq("trainingId", trainingId)
          .select("*")
          .single();

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
        return data;
      } else {
        const { data, error } = await ctx.supabase
          .from("coaching_email_templates")
          .insert({ trainingId, ...fields })
          .select("*")
          .single();

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
        return data;
      }
    }),

  sendToCandidate: protectedProcedure
    .input(
      z.object({
        trainingId: z.string(),
        candidateId: z.string(),
        type: z.enum(["INVITE", "REMINDER"]).default("INVITE"),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role, training, organizationName } =
        await verifyTrainingAccess(
          ctx.supabase,
          input.trainingId,
          ctx.user.id,
        );
      assertMinRole(role, "EDITOR");

      const { data: candidate } = await ctx.supabase
        .from("coaching_candidates")
        .select("*")
        .eq("id", input.candidateId)
        .eq("trainingId", input.trainingId)
        .single();

      if (!candidate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate not found",
        });
      }

      if (input.startDate !== undefined || input.endDate !== undefined) {
        const updates: any = {};
        if (input.startDate !== undefined) updates.startDate = input.startDate;
        if (input.endDate !== undefined) updates.endDate = input.endDate;
        await ctx.supabase
          .from("coaching_candidates")
          .update(updates)
          .eq("id", input.candidateId);
      }

      if (!candidate.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Candidate has no email address",
        });
      }

      const { data: template } = await ctx.supabase
        .from("coaching_email_templates")
        .select("*")
        .eq("trainingId", input.trainingId)
        .single();

      const emailTemplate = template || DEFAULT_EMAIL_TEMPLATE;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://app.inluwa.com");
      const inviteLink = `${appUrl}/c/invite/${candidate.inviteToken}`;

      const effectiveStartDate = input.startDate !== undefined ? input.startDate : candidate.startDate;
      const effectiveEndDate = input.endDate !== undefined ? input.endDate : candidate.endDate;
      let validityPeriod: string | undefined;
      if (effectiveStartDate && effectiveEndDate) {
        validityPeriod = `${new Date(effectiveStartDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} to ${new Date(effectiveEndDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
      } else if (effectiveStartDate) {
        validityPeriod = `From ${new Date(effectiveStartDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
      } else if (effectiveEndDate) {
        validityPeriod = `Until ${new Date(effectiveEndDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
      }

      const { subject, html } = renderInviteEmail(
        {
          subject: input.type === "REMINDER" ? (emailTemplate as any).reminderSubject || DEFAULT_EMAIL_TEMPLATE.reminderSubject : emailTemplate.subject,
          body: input.type === "REMINDER" ? (emailTemplate as any).reminderBody || DEFAULT_EMAIL_TEMPLATE.reminderBody : emailTemplate.body,
          logoUrl: emailTemplate.logoUrl,
        },
        {
          candidateName: candidate.name,
          inviteLink,
          interviewTitle: training.title,
          interviewDescription: training.description || undefined,
          companyName: organizationName,
          validityPeriod,
        },
      );

      let status = "SENT";
      let errorMessage: string | null = null;
      let messageId: string | null = null;

      try {
        const result = await sendEmail({
          to: candidate.email,
          subject,
          html,
          replyTo: emailTemplate.replyTo || undefined,
        });
        messageId = result.messageId;
      } catch (err) {
        status = "FAILED";
        errorMessage =
          err instanceof Error ? err.message : "Unknown error";
      }

      await ctx.supabase.from("coaching_email_send_logs").insert({
        trainingId: input.trainingId,
        candidateId: input.candidateId,
        recipientEmail: candidate.email,
        recipientName: candidate.name,
        subject,
        status,
        errorMessage,
        messageId,
        sentBy: ctx.user.id,
      });

      if (status === "SENT") {
        await ctx.supabase
          .from("coaching_candidates")
          .update({ invitedAt: new Date().toISOString() })
          .eq("id", input.candidateId);
      }

      if (status === "FAILED") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send email: ${errorMessage}`,
        });
      }

      return { success: true, messageId };
    }),

  sendBulk: protectedProcedure
    .input(
      z.object({
        trainingId: z.string(),
        candidateIds: z.array(z.string()).min(1).max(MAX_BATCH_SIZE),
        type: z.enum(["INVITE", "REMINDER"]).default("INVITE"),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role, training, organizationName } =
        await verifyTrainingAccess(
          ctx.supabase,
          input.trainingId,
          ctx.user.id,
        );
      assertMinRole(role, "EDITOR");

      if (input.startDate !== undefined || input.endDate !== undefined) {
        const updates: any = {};
        if (input.startDate !== undefined) updates.startDate = input.startDate;
        if (input.endDate !== undefined) updates.endDate = input.endDate;
        await ctx.supabase
          .from("coaching_candidates")
          .update(updates)
          .in("id", input.candidateIds);
      }

      const { data: candidates } = await ctx.supabase
        .from("coaching_candidates")
        .select("*")
        .in("id", input.candidateIds)
        .eq("trainingId", input.trainingId);

      if (!candidates || candidates.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No candidates found",
        });
      }

      const { data: template } = await ctx.supabase
        .from("coaching_email_templates")
        .select("*")
        .eq("trainingId", input.trainingId)
        .single();

      const emailTemplate = template || DEFAULT_EMAIL_TEMPLATE;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://app.inluwa.com");

      let sent = 0;
      let failed = 0;
      const logs: Array<{
        trainingId: string;
        candidateId: string;
        recipientEmail: string;
        recipientName: string;
        subject: string;
        status: string;
        errorMessage: string | null;
        messageId: string | null;
        sentBy: string;
      }> = [];

      for (const candidate of candidates) {
        if (!candidate.email) {
          failed++;
          logs.push({
            trainingId: input.trainingId,
            candidateId: candidate.id,
            recipientEmail: "",
            recipientName: candidate.name,
            subject: "",
            status: "FAILED",
            errorMessage: "No email address",
            messageId: null,
            sentBy: ctx.user.id,
          });
          continue;
        }

        const inviteLink = `${appUrl}/c/invite/${candidate.inviteToken}`;

        const effectiveStartDate = input.startDate !== undefined ? input.startDate : candidate.startDate;
        const effectiveEndDate = input.endDate !== undefined ? input.endDate : candidate.endDate;
        let validityPeriod: string | undefined;
        if (effectiveStartDate && effectiveEndDate) {
          validityPeriod = `${new Date(effectiveStartDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} to ${new Date(effectiveEndDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
        } else if (effectiveStartDate) {
          validityPeriod = `From ${new Date(effectiveStartDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
        } else if (effectiveEndDate) {
          validityPeriod = `Until ${new Date(effectiveEndDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
        }

        const { subject, html } = renderInviteEmail(
          {
            subject: input.type === "REMINDER" ? (emailTemplate as any).reminderSubject || DEFAULT_EMAIL_TEMPLATE.reminderSubject : emailTemplate.subject,
            body: input.type === "REMINDER" ? (emailTemplate as any).reminderBody || DEFAULT_EMAIL_TEMPLATE.reminderBody : emailTemplate.body,
            logoUrl: emailTemplate.logoUrl,
          },
          {
            candidateName: candidate.name,
            inviteLink,
            interviewTitle: training.title,
            interviewDescription: training.description || undefined,
            companyName: organizationName,
            validityPeriod,
          },
        );

          try {
            const result = await sendEmail({
              to: candidate.email,
              subject,
              html,
              replyTo: emailTemplate.replyTo || undefined,
            });
            sent++;
            logs.push({
              trainingId: input.trainingId,
              candidateId: candidate.id,
              recipientEmail: candidate.email,
              recipientName: candidate.name,
              subject,
              status: "SENT",
              errorMessage: null,
              messageId: result.messageId,
              sentBy: ctx.user.id,
            });
            await ctx.supabase
              .from("coaching_candidates")
              .update({ invitedAt: new Date().toISOString() })
              .eq("id", candidate.id);
          } catch (err) {
          failed++;
          logs.push({
            trainingId: input.trainingId,
            candidateId: candidate.id,
            recipientEmail: candidate.email,
            recipientName: candidate.name,
            subject,
            status: "FAILED",
            errorMessage:
              err instanceof Error ? err.message : "Unknown error",
            messageId: null,
            sentBy: ctx.user.id,
          });
        }
      }

      if (logs.length > 0) {
        await ctx.supabase.from("coaching_email_send_logs").insert(logs);
      }

      return { sent, failed, total: candidates.length };
    }),

  getSendLogs: protectedProcedure
    .input(
      z.object({
        trainingId: z.string(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifyTrainingAccess(
        ctx.supabase,
        input.trainingId,
        ctx.user.id,
      );

      const { data: logs } = await ctx.supabase
        .from("coaching_email_send_logs")
        .select("*")
        .eq("trainingId", input.trainingId)
        .order("sentAt", { ascending: false })
        .limit(input.limit);

      return logs ?? [];
    }),
});
