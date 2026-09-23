import { nanoid } from "@/lib/id";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  deductInterviewOwnerCredits,
  getAvailableInterviewCredits,
} from "@/lib/pregenerate-credits";
import { getCvAnalysisCost } from "@/lib/interview-credits";
import { loadCreditRates } from "@/lib/load-credit-rates";
import {
    assertMinRole, filterAccessibleProjectIds,
    getEffectiveProjectRole, getOrgMembership, hasProjectAccess, protectedProcedure, publicProcedure, router, type MemberRole
} from "../trpc";

const RESUME_SERVICE_URL =
  process.env.RESUME_SERVICE_URL || "http://127.0.0.1:8091";

type CvCriterion = { name: string; description?: string };

function hasScoredCvAnalysis(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const resumePath = (value as Record<string, unknown>).resumePath;
  return typeof resumePath === "string" && resumePath.trim().length > 0;
}

function normalizeCvCriteria(value: unknown): CvCriterion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const rawName = (entry as { name?: unknown }).name;
      const rawDescription = (entry as { description?: unknown }).description;
      const name = typeof rawName === "string" ? rawName.trim() : "";
      const description =
        typeof rawDescription === "string" ? rawDescription.trim() : "";
      if (!name) return null;
      return description ? { name, description } : { name };
    })
    .filter((entry): entry is CvCriterion => Boolean(entry));
}

async function rescanCandidateCv(args: {
  candidateId: string;
  resumePath: string;
  resumeName?: string | null;
  interviewContext: Record<string, unknown>;
}) {
  const { candidateId, resumePath, resumeName, interviewContext } = args;
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("support-attachments")
    .download(resumePath);
  if (downloadError || !fileData) {
    throw new Error(downloadError?.message ?? "Failed to download stored resume");
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  const fileExt = resumePath.split(".").pop() || "pdf";
  const finalResumeName = resumeName?.trim() || `resume-${candidateId}.${fileExt}`;

  const form = new FormData();
  form.append(
    "file",
    new Blob([fileBuffer], { type: fileData.type || "application/pdf" }),
    finalResumeName,
  );
  form.append("interviewContext", JSON.stringify(interviewContext));

  const serviceRes = await fetch(`${RESUME_SERVICE_URL}/parse-and-score`, {
    method: "POST",
    body: form,
  });
  if (!serviceRes.ok) {
    const errorBody = await serviceRes.text();
    throw new Error(
      `Resume service failed (${serviceRes.status}): ${errorBody.slice(0, 250)}`,
    );
  }

  const serviceData = (await serviceRes.json()) as {
    candidate?: { cvAnalysis?: unknown };
  };
  const nextCvAnalysis =
    (serviceData.candidate && (serviceData.candidate as any).cvAnalysis) ?? {};
  (nextCvAnalysis as Record<string, unknown>).resumePath = resumePath;
  (nextCvAnalysis as Record<string, unknown>).resumeName = finalResumeName;

  const { error: updateError } = await supabaseAdmin
    .from("candidates")
    .update({
      cvAnalysis: nextCvAnalysis,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", candidateId);
  if (updateError) {
    throw new Error(updateError.message);
  }
}
const candidateFields = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  gender: z.string().optional(),
  birthday: z.string().optional(),
  notes: z.string().optional(),
  education: z.string().optional(),
  school: z.string().optional(),
  major: z.string().optional(),
  graduationYear: z.number().int().optional(),
  workExperience: z.string().optional(),
  cvAnalysis: z.any().optional(),
  sessionId: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/*  Helper: verify interview access via org membership                 */
/* ------------------------------------------------------------------ */

async function verifyInterviewAccess(
  supabase: Parameters<typeof getOrgMembership>[0],
  interviewId: string,
  userId: string,
): Promise<{ role: MemberRole; interviewUserId: string; organizationId: string }> {
  const { data: interview } = await supabase
    .from("interviews")
    .select("userId, projectId, project:projects!inner(organizationId)")
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
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
  }

  const projAccess = await hasProjectAccess(supabase, interview.projectId, userId);
  if (!projAccess) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
  }

  const effectiveRole = await getEffectiveProjectRole(
    supabase,
    interview.projectId,
    userId,
    membership.role,
  );

  return { role: effectiveRole, interviewUserId: interview.userId, organizationId: project.organizationId };
}

export const candidateRouter = router({
  getCvDownloadUrl: protectedProcedure
    .input(z.object({ candidateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: candidate } = await ctx.supabase
        .from("candidates")
        .select("cvAnalysis, interview:interviews!inner(projectId)")
        .eq("id", input.candidateId)
        .single();

      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
      }

      const interview = candidate.interview as any;
      const projAccess = await hasProjectAccess(ctx.supabase, interview.projectId, ctx.user.id);
      if (!projAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
      }

      const cvAnalysis = candidate.cvAnalysis as any;
      if (!cvAnalysis?.resumePath) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No CV uploaded for this candidate" });
      }

      const { data, error } = await supabaseAdmin.storage
        .from("support-attachments")
        .createSignedUrl(cvAnalysis.resumePath, 60);

      if (error || !data?.signedUrl) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate download URL" });
      }

      return {
        url: data.signedUrl,
        name: cvAnalysis.resumeName || "resume.pdf",
      };
    }),

  create: protectedProcedure
    .input(
      z.object({ interviewId: z.string() }).merge(candidateFields),
    )
    .mutation(async ({ ctx, input }) => {
      const { interviewId, ...fields } = input;

      const { role, interviewUserId, organizationId } = await verifyInterviewAccess(
        ctx.supabase,
        interviewId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");
      const shouldChargeCvScan = hasScoredCvAnalysis(fields.cvAnalysis);
      const rates = await loadCreditRates();
      const cvScanCost = getCvAnalysisCost(rates);

      if (shouldChargeCvScan) {
        const available = await getAvailableInterviewCredits(
          interviewUserId,
          organizationId,
        );
        if (available < cvScanCost) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Not enough credits. CV scoring requires ${cvScanCost.toFixed(2)} credits per candidate.`,
          });
        }
      }

      const inviteToken = nanoid(12);
      if (fields.email === "") fields.email = undefined;

      const { data: candidate, error } = await ctx.supabase
        .from("candidates")
        .insert({
          interviewId,
          ...fields,
          email: fields.email || null,
          inviteToken,
        })
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      if (shouldChargeCvScan) {
        await deductInterviewOwnerCredits(
          interviewUserId,
          cvScanCost,
          organizationId,
        );
      }

      return candidate;
    }),

  bulkCreate: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        candidates: z.array(candidateFields).min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { interviewId, candidates } = input;

      const { role, interviewUserId, organizationId } = await verifyInterviewAccess(
        ctx.supabase,
        interviewId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");

      const seen = new Set<string>();
      const deduped = candidates.filter((c) => {
        const email = c.email?.trim().toLowerCase();
        if (!email) return true;
        if (seen.has(email)) return false;
        seen.add(email);
        return true;
      });

      const rows = deduped.map((c) => ({
        interviewId,
        ...c,
        email: c.email?.trim().toLowerCase() || null,
        inviteToken: nanoid(12),
      }));

      if (rows.length === 0) {
        return { created: 0, total: deduped.length };
      }
      const cvScansToCharge = rows.reduce(
        (sum, row) => sum + (hasScoredCvAnalysis(row.cvAnalysis) ? 1 : 0),
        0,
      );
      const rates = await loadCreditRates();
      const cvScanCost = getCvAnalysisCost(rates);
      const cvScanCreditCost = cvScansToCharge * cvScanCost;
      if (cvScanCreditCost > 0) {
        const available = await getAvailableInterviewCredits(
          interviewUserId,
          organizationId,
        );
        if (available < cvScanCreditCost) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Not enough credits. CV scoring requires ${cvScanCreditCost.toFixed(2)} credits.`,
          });
        }
      }

      const { data, error } = await ctx.supabase
        .from("candidates")
        .insert(rows)
        .select("*");

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      if (cvScanCreditCost > 0) {
        await deductInterviewOwnerCredits(
          interviewUserId,
          cvScanCreditCost,
          organizationId,
        );
      }

      return { created: data?.length ?? 0, total: deduped.length };
    }),

  list: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyInterviewAccess(ctx.supabase, input.interviewId, ctx.user.id);

      const { data: candidates } = await ctx.supabase
        .from("candidates")
        .select("*, session:sessions(*)")
        .eq("interviewId", input.interviewId)
        .order("createdAt", { ascending: false });

      const linkedSessionIds = (candidates ?? [])
        .map((c: { sessionId: string | null }) => c.sessionId)
        .filter(Boolean);

      let walkInQuery = ctx.supabase
        .from("sessions")
        .select("*, messages(id)")
        .eq("interviewId", input.interviewId)
        .order("createdAt", { ascending: false });

      if (linkedSessionIds.length > 0) {
        walkInQuery = walkInQuery.not(
          "id",
          "in",
          `(${linkedSessionIds.join(",")})`,
        );
      }

      const { data: sessions } = await walkInQuery;
      const walkInSessions = (sessions ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => ({
          ...s,
          _count: { messages: s.messages?.length ?? 0 },
        }),
      );

      return { candidates: candidates ?? [], walkInSessions };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        gender: z.string().optional(),
        birthday: z.string().optional(),
        notes: z.string().optional(),
        education: z.string().optional(),
        school: z.string().optional(),
        major: z.string().optional(),
        graduationYear: z.number().int().optional(),
        workExperience: z.string().optional(),
        evaluationStatus: z.enum(["PENDING", "SHORTLISTED", "WAITLISTED", "REJECTED"]).optional(),
        hrComments: z.any().optional(),
        cvAnalysis: z.any().optional(),
        sessionId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      // Get candidate's interview to verify access
      const { data: candidate } = await ctx.supabase
        .from("candidates")
        .select("interviewId, sessionId, cvAnalysis")
        .eq("id", id)
        .single();

      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { role, interviewUserId, organizationId } = await verifyInterviewAccess(
        ctx.supabase,
        candidate.interviewId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");
      const oldCvAnalysis = candidate.cvAnalysis as Record<string, unknown> | null;
      const oldResumePath = typeof oldCvAnalysis?.resumePath === "string" ? oldCvAnalysis.resumePath.trim() : "";
      const newCvAnalysis = fields.cvAnalysis as Record<string, unknown> | null;
      const newResumePath = typeof newCvAnalysis?.resumePath === "string" ? newCvAnalysis.resumePath.trim() : "";
      const shouldChargeCvScan = newResumePath.length > 0 && newResumePath !== oldResumePath;
      const rates = await loadCreditRates();
      const cvScanCost = getCvAnalysisCost(rates);

      if (shouldChargeCvScan) {
        const available = await getAvailableInterviewCredits(
          interviewUserId,
          organizationId,
        );
        if (available < cvScanCost) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Not enough credits. CV scoring requires ${cvScanCost.toFixed(2)} credits per candidate.`,
          });
        }
      }

      const { data: updated, error } = await ctx.supabase
        .from("candidates")
        .update({ ...fields, updatedAt: new Date().toISOString() })
        .eq("id", id)
        .select("*, session:sessions(*)")
        .single();

      if (error) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
      }

      if (fields.evaluationStatus && candidate.sessionId) {
        await ctx.supabase
          .from("sessions")
          .update({ evaluationStatus: fields.evaluationStatus })
          .eq("id", candidate.sessionId);
      }

      if (shouldChargeCvScan) {
        await deductInterviewOwnerCredits(
          interviewUserId,
          cvScanCost,
          organizationId,
        );
      }

      return updated;
    }),

  upsertForSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().optional(),
        candidateId: z.string().optional(),
        interviewId: z.string(),
      }).merge(candidateFields)
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId, candidateId, interviewId, ...fields } = input;
      
      const { role } = await verifyInterviewAccess(
        ctx.supabase,
        interviewId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");

      if (fields.email === "") fields.email = undefined;

      if (candidateId) {
        const { data: updated, error } = await ctx.supabase
          .from("candidates")
          .update({ ...fields, updatedAt: new Date().toISOString() })
          .eq("id", candidateId)
          .select()
          .single();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        
        if (updated.sessionId) {
          await ctx.supabase
            .from("sessions")
            .update({
              participantName: updated.name,
              participantEmail: updated.email || null,
            })
            .eq("id", updated.sessionId);
        }
        return updated;
      }

      if (!sessionId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Must provide either sessionId or candidateId" });
      }

      const { data: existing } = await ctx.supabase
        .from("candidates")
        .select("id")
        .eq("sessionId", sessionId)
        .maybeSingle();

      if (existing) {
        const { data: updated, error } = await ctx.supabase
          .from("candidates")
          .update({ ...fields, updatedAt: new Date().toISOString() })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        
        await ctx.supabase
          .from("sessions")
          .update({
            participantName: updated.name,
            participantEmail: updated.email || null,
          })
          .eq("id", sessionId);

        return updated;
      } else {
        const inviteToken = nanoid(12);
        const { data: created, error } = await ctx.supabase
          .from("candidates")
          .insert({
            interviewId,
            sessionId,
            ...fields,
            email: fields.email || null,
            inviteToken,
          })
          .select()
          .single();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        
        await ctx.supabase
          .from("sessions")
          .update({
            participantName: created.name,
            participantEmail: created.email || null,
          })
          .eq("id", sessionId);

        return created;
      }
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: candidate } = await ctx.supabase
        .from("candidates")
        .select("interviewId")
        .eq("id", input.id)
        .single();

      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { role } = await verifyInterviewAccess(
        ctx.supabase,
        candidate.interviewId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");

      // Deletion guard for MEMBER
      if (role === "EDITOR") {
        const { count } = await ctx.supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("interviewId", candidate.interviewId)
          .in("status", ["IN_PROGRESS", "COMPLETED"]);

        if ((count ?? 0) > 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Cannot delete candidates from an interview with active or completed sessions. Contact an admin.",
          });
        }
      }

      await ctx.supabase.from("candidates").delete().eq("id", input.id);
      return { success: true };
    }),

  removeMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Verify all belong to same interview and user has access
      const { data: candidates } = await ctx.supabase
        .from("candidates")
        .select("interviewId")
        .in("id", input.ids);

      const interviewIds = Array.from(
        new Set((candidates ?? []).map((c) => c.interviewId)),
      );

      await Promise.all(
        interviewIds.map(async (iid) => {
          const { role } = await verifyInterviewAccess(
            ctx.supabase,
            iid,
            ctx.user.id,
          );
          assertMinRole(role, "EDITOR");

          if (role === "EDITOR") {
            const { count } = await ctx.supabase
              .from("sessions")
              .select("*", { count: "exact", head: true })
              .eq("interviewId", iid)
              .in("status", ["IN_PROGRESS", "COMPLETED"]);

            if ((count ?? 0) > 0) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message:
                  "Cannot delete candidates from an interview with active or completed sessions.",
              });
            }
          }
        })
      );

      await ctx.supabase.from("candidates").delete().in("id", input.ids);
      return { deleted: input.ids.length };
    }),

  rescanMany: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        candidateIds: z.array(z.string()).min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role, interviewUserId, organizationId } = await verifyInterviewAccess(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");

      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select("title, objective, description, cvAssessmentCriteria, cvJdAlignmentCriteria")
        .eq("id", input.interviewId)
        .single();
      if (!interview) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
      }

      const { data: candidates, error: candidateError } = await ctx.supabase
        .from("candidates")
        .select("id, name, cvAnalysis")
        .eq("interviewId", input.interviewId)
        .in("id", input.candidateIds);
      if (candidateError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: candidateError.message,
        });
      }

      const interviewContext: Record<string, unknown> = {
        title: interview.title,
        objective: interview.objective,
        jobDescription: interview.description,
        cvAssessmentCriteria: normalizeCvCriteria(interview.cvAssessmentCriteria),
        cvJdAlignmentCriteria: normalizeCvCriteria(interview.cvJdAlignmentCriteria),
      };

      const errors: Array<{ id: string; name: string; reason: string }> = [];
      let rescanned = 0;
      let skipped = 0;
      const chargeableCandidates =
        (candidates ?? []).filter((candidate) => {
          const cvAnalysis =
            candidate.cvAnalysis && typeof candidate.cvAnalysis === "object"
              ? (candidate.cvAnalysis as Record<string, unknown>)
              : {};
          const resumePath =
            typeof cvAnalysis.resumePath === "string"
              ? cvAnalysis.resumePath.trim()
              : "";
          return resumePath.length > 0;
        }).length ?? 0;
      const rates = await loadCreditRates();
      const cvScanCost = getCvAnalysisCost(rates);
      const maxRescanCreditCost = chargeableCandidates * cvScanCost;
      if (maxRescanCreditCost > 0) {
        const available = await getAvailableInterviewCredits(
          interviewUserId,
          organizationId,
        );
        if (available < maxRescanCreditCost) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Not enough credits. Rescanning requires up to ${maxRescanCreditCost.toFixed(2)} credits for selected candidates.`,
          });
        }
      }
      for (const candidate of candidates ?? []) {
        const cvAnalysis =
          candidate.cvAnalysis && typeof candidate.cvAnalysis === "object"
            ? (candidate.cvAnalysis as Record<string, unknown>)
            : {};
        const resumePath =
          typeof cvAnalysis.resumePath === "string"
            ? cvAnalysis.resumePath.trim()
            : "";
        const resumeName =
          typeof cvAnalysis.resumeName === "string"
            ? cvAnalysis.resumeName
            : null;

        if (!resumePath) {
          skipped++;
          errors.push({
            id: candidate.id,
            name: candidate.name || "Unknown",
            reason: "No stored resume found for candidate",
          });
          continue;
        }

        try {
          await rescanCandidateCv({
            candidateId: candidate.id,
            resumePath,
            resumeName,
            interviewContext,
          });
          rescanned++;
        } catch (err) {
          errors.push({
            id: candidate.id,
            name: candidate.name || "Unknown",
            reason: err instanceof Error ? err.message : "Rescan failed",
          });
        }
      }

      const usedRescanCreditCost = rescanned * cvScanCost;
      if (usedRescanCreditCost > 0) {
        await deductInterviewOwnerCredits(
          interviewUserId,
          usedRescanCreditCost,
          organizationId,
        );
      }

      return {
        requested: input.candidateIds.length,
        rescanned,
        failed: errors.length - skipped,
        skipped,
        errors: errors.slice(0, 25),
      };
    }),

  listAll: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        projectId: z.string().optional(),
        limit: z.number().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get org IDs for the user
      const { data: memberships } = await ctx.supabase
        .from("organization_members")
        .select("workspaceId")
        .eq("userId", ctx.user.id);

      let orgIds = (memberships ?? []).map(
        (m: { workspaceId: string }) => m.workspaceId,
      );

      if (input.organizationId) {
        if (!orgIds.includes(input.organizationId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
        }
        orgIds = [input.organizationId];
      }

      if (orgIds.length === 0)
        return { candidates: [], walkInSessions: [] };

      let projectIds: string[];
      if (input.projectId) {
        const projAccess = await hasProjectAccess(ctx.supabase, input.projectId, ctx.user.id);
        projectIds = projAccess ? [input.projectId] : [];
      } else {
        const { data: projects } = await ctx.supabase
          .from("projects")
          .select("id")
          .in("organizationId", orgIds);
        const allProjIds = (projects ?? []).map((p: { id: string }) => p.id);
        projectIds = await filterAccessibleProjectIds(ctx.supabase, allProjIds, ctx.user.id);
      }

      if (projectIds.length === 0)
        return { candidates: [], walkInSessions: [] };

      const { data: userInterviews } = await ctx.supabase
        .from("interviews")
        .select("id, title")
        .in("projectId", projectIds);

      const interviewIds = (userInterviews ?? []).map(
        (i: { id: string }) => i.id,
      );
      if (interviewIds.length === 0)
        return { candidates: [], walkInSessions: [] };

      const interviewMap = Object.fromEntries(
        (userInterviews ?? []).map((i) => [i.id, i.title]),
      );

      const { data: candidates } = await ctx.supabase
        .from("candidates")
        .select(
          "*, session:sessions(*), interview:interviews!inner(id, title)",
        )
        .in("interviewId", interviewIds)
        .order("createdAt", { ascending: false })
        .limit(input.limit);

      const linkedSessionIds = (candidates ?? [])
        .map((c: { sessionId: string | null }) => c.sessionId)
        .filter(Boolean);

      let walkInQuery = ctx.supabase
        .from("sessions")
        .select(
          "*, messages(id), interview:interviews!inner(id, title)",
        )
        .in("interviewId", interviewIds)
        .order("createdAt", { ascending: false })
        .limit(input.limit);

      if (linkedSessionIds.length > 0) {
        walkInQuery = walkInQuery.not(
          "id",
          "in",
          `(${linkedSessionIds.join(",")})`,
        );
      }

      const { data: sessions } = await walkInQuery;
      const walkInSessions = (sessions ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => ({
          ...s,
          _count: { messages: s.messages?.length ?? 0 },
        }),
      );

      return {
        candidates: candidates ?? [],
        walkInSessions,
        interviewMap,
      };
    }),

  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: candidate } = await ctx.supabase
        .from("candidates")
        .select(
          "*, session:sessions(*), interview:interviews(*, questions(*))",
        )
        .eq("inviteToken", input.token)
        .single();

      if (!candidate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid invite link",
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interview = candidate.interview as any;
      if (!interview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Interview is no longer available",
        });
      }

      return candidate;
    }),
});
