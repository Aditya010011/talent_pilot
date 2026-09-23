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
/*  Helper: verify interview access                                    */
/* ------------------------------------------------------------------ */

async function verifyInterviewAccess(
  supabase: Parameters<typeof getOrgMembership>[0],
  interviewId: string,
  userId: string,
): Promise<{
  role: MemberRole;
  interview: {
    id: string;
    title: string;
    description: string | null;
    publicSlug: string | null;
    userId: string;
    projectId: string;
  };
  organizationId: string;
  organizationName: string;
}> {
  const { data: interview } = await supabase
    .from("interviews")
    .select(
      "id, title, description, publicSlug, userId, projectId, project:projects!inner(organizationId)",
    )
    .eq("id", interviewId)
    .single();

  if (!interview) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
  }

  const project = interview.project as unknown as {
    organizationId: string;
  };

  const membership = await getOrgMembership(
    supabase,
    project.organizationId,
    userId,
  );
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this organization",
    });
  }

  const projAccess = await hasProjectAccess(
    supabase,
    interview.projectId,
    userId,
  );
  if (!projAccess) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this project",
    });
  }

  const effectiveRole = await getEffectiveProjectRole(
    supabase,
    interview.projectId,
    userId,
    membership.role,
  );

  // Get org name for email template
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", project.organizationId)
    .single();

  return {
    role: effectiveRole,
    interview: {
      id: interview.id,
      title: interview.title,
      description: interview.description,
      publicSlug: interview.publicSlug,
      userId: interview.userId,
      projectId: interview.projectId,
    },
    organizationId: project.organizationId,
    organizationName: org?.name || "Inluwa",
  };
}

/* ------------------------------------------------------------------ */
/*  Max batch size to prevent abuse                                    */
/* ------------------------------------------------------------------ */
const MAX_BATCH_SIZE = 50;

export const emailInviteRouter = router({
  /**
   * Get the email template for an interview (or defaults)
   */
  getTemplate: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyInterviewAccess(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );

      const { data: template } = await ctx.supabase
        .from("email_templates")
        .select("*")
        .eq("interviewId", input.interviewId)
        .single();

      if (!template) {
        return {
          ...DEFAULT_EMAIL_TEMPLATE,
          interviewId: input.interviewId,
          id: null,
        };
      }

      return template;
    }),

  /**
   * Save/update the email template
   */
  saveTemplate: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        subject: z.string().min(1).max(500),
        body: z.string().max(50000),
        reminderSubject: z.string().max(500).optional(),
        reminderBody: z.string().max(50000).optional(),
        logoUrl: z.string().url().nullable().optional(),
        replyTo: z.string().email().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role } = await verifyInterviewAccess(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");

      const { interviewId, ...fields } = input;

      // Upsert: try update first, then insert
      const { data: existing } = await ctx.supabase
        .from("email_templates")
        .select("id")
        .eq("interviewId", interviewId)
        .single();

      if (existing) {
        const { data, error } = await ctx.supabase
          .from("email_templates")
          .update(fields)
          .eq("interviewId", interviewId)
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
          .from("email_templates")
          .insert({ interviewId, ...fields })
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

  /**
   * Send invite email to a single candidate
   */
  sendToCandidate: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        candidateId: z.string(),
        type: z.enum(["INVITE", "REMINDER"]).default("INVITE"),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role, interview, organizationName } =
        await verifyInterviewAccess(
          ctx.supabase,
          input.interviewId,
          ctx.user.id,
        );
      assertMinRole(role, "EDITOR");

      // Get the candidate
      const { data: candidate } = await ctx.supabase
        .from("candidates")
        .select("*")
        .eq("id", input.candidateId)
        .eq("interviewId", input.interviewId)
        .single();

      if (!candidate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate not found",
        });
      }

      // Update candidate with the new dates if provided
      if (input.startDate !== undefined || input.endDate !== undefined) {
        const updates: any = {};
        if (input.startDate !== undefined) updates.startDate = input.startDate;
        if (input.endDate !== undefined) updates.endDate = input.endDate;
        await ctx.supabase
          .from("candidates")
          .update(updates)
          .eq("id", input.candidateId);
      }

      if (!candidate.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Candidate has no email address",
        });
      }

      // Get the template
      const { data: template } = await ctx.supabase
        .from("email_templates")
        .select("*")
        .eq("interviewId", input.interviewId)
        .single();

      const emailTemplate = template || DEFAULT_EMAIL_TEMPLATE;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://app.inluwa.com");
      const inviteLink = `${appUrl}/i/invite/${candidate.inviteToken}`;

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
          interviewTitle: interview.title,
          interviewDescription: interview.description || undefined,
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

      // Log the send attempt
      await ctx.supabase.from("email_send_logs").insert({
        interviewId: input.interviewId,
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
          .from("candidates")
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

  /**
   * Send invite emails to multiple candidates
   */
  sendBulk: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        candidateIds: z.array(z.string()).min(1).max(MAX_BATCH_SIZE),
        type: z.enum(["INVITE", "REMINDER"]).default("INVITE"),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role, interview, organizationName } =
        await verifyInterviewAccess(
          ctx.supabase,
          input.interviewId,
          ctx.user.id,
        );
      assertMinRole(role, "EDITOR");

      // Update candidates with new dates if provided
      if (input.startDate !== undefined || input.endDate !== undefined) {
        const updates: any = {};
        if (input.startDate !== undefined) updates.startDate = input.startDate;
        if (input.endDate !== undefined) updates.endDate = input.endDate;
        await ctx.supabase
          .from("candidates")
          .update(updates)
          .in("id", input.candidateIds);
      }

      // Get the candidates
      const { data: candidates } = await ctx.supabase
        .from("candidates")
        .select("*")
        .in("id", input.candidateIds)
        .eq("interviewId", input.interviewId);

      if (!candidates || candidates.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No candidates found",
        });
      }

      // Get the template
      const { data: template } = await ctx.supabase
        .from("email_templates")
        .select("*")
        .eq("interviewId", input.interviewId)
        .single();

      const emailTemplate = template || DEFAULT_EMAIL_TEMPLATE;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://app.inluwa.com");

      let sent = 0;
      let failed = 0;
      const logs: Array<{
        interviewId: string;
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
            interviewId: input.interviewId,
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

        const inviteLink = `${appUrl}/i/invite/${candidate.inviteToken}`;

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
            interviewTitle: interview.title,
            interviewDescription: interview.description || undefined,
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
              interviewId: input.interviewId,
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
              .from("candidates")
              .update({ invitedAt: new Date().toISOString() })
              .eq("id", candidate.id);
          } catch (err) {
          failed++;
          logs.push({
            interviewId: input.interviewId,
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

      // Bulk insert logs
      if (logs.length > 0) {
        await ctx.supabase.from("email_send_logs").insert(logs);
      }

      return { sent, failed, total: candidates.length };
    }),

  /**
   * Get send history for an interview
   */
  getSendLogs: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifyInterviewAccess(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );

      const { data: logs } = await ctx.supabase
        .from("email_send_logs")
        .select("*")
        .eq("interviewId", input.interviewId)
        .order("sentAt", { ascending: false })
        .limit(input.limit);

      return logs ?? [];
    }),
});
