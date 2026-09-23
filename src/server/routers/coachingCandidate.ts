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
    .from("coaching_candidates")
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
/*  Helper: verify training access via org membership                 */
/* ------------------------------------------------------------------ */

async function verifyTrainingAccess(
  supabase: Parameters<typeof getOrgMembership>[0],
  trainingId: string,
  userId: string,
): Promise<{ role: MemberRole; trainingUserId: string; organizationId: string }> {
  const { data: training } = await supabase
    .from("trainings")
    .select("userId, projectId, project:projects(organizationId)")
    .eq("id", trainingId)
    .single();

  if (!training) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
  }

  // Handle trainings directly tied to organization (no project) or via project
  let orgId = "";
  if (training.projectId && training.project) {
    orgId = (training.project as any).organizationId;
  } else {
    // If trainings can exist without project, fetch org directly if column exists
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
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
  }

  if (training.projectId) {
    const projAccess = await hasProjectAccess(supabase, training.projectId, userId);
    if (!projAccess) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
    }
  }

  const effectiveRole = training.projectId 
    ? await getEffectiveProjectRole(supabase, training.projectId, userId, membership.role)
    : membership.role;

  return { role: effectiveRole, trainingUserId: training.userId, organizationId: orgId };
}

export const coachingCandidateRouter = router({
  create: protectedProcedure
    .input(
      z.object({ trainingId: z.string() }).merge(candidateFields),
    )
    .mutation(async ({ ctx, input }) => {
      const { trainingId, ...fields } = input;

      const { role, trainingUserId, organizationId } = await verifyTrainingAccess(
        ctx.supabase,
        trainingId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");
      const shouldChargeCvScan = hasScoredCvAnalysis(fields.cvAnalysis);
      const rates = await loadCreditRates();
      const cvScanCost = getCvAnalysisCost(rates);

      if (shouldChargeCvScan) {
        const available = await getAvailableInterviewCredits(
          trainingUserId,
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
        .from("coaching_candidates")
        .insert({
          trainingId,
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
          trainingUserId,
          cvScanCost,
          organizationId,
        );
      }

      return candidate;
    }),

  bulkCreate: protectedProcedure
    .input(
      z.object({
        trainingId: z.string(),
        candidates: z.array(candidateFields).min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { trainingId, candidates } = input;

      const { role, trainingUserId, organizationId } = await verifyTrainingAccess(
        ctx.supabase,
        trainingId,
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
        trainingId,
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
          trainingUserId,
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
        .from("coaching_candidates")
        .insert(rows)
        .select("*");

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      if (cvScanCreditCost > 0) {
        await deductInterviewOwnerCredits(
          trainingUserId,
          cvScanCreditCost,
          organizationId,
        );
      }

      return { created: data?.length ?? 0, total: deduped.length };
    }),

  list: protectedProcedure
    .input(z.object({ trainingId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyTrainingAccess(ctx.supabase, input.trainingId, ctx.user.id);

      const { data: candidates } = await ctx.supabase
        .from("coaching_candidates")
        .select("*, session:coaching_sessions(*)")
        .eq("trainingId", input.trainingId)
        .order("createdAt", { ascending: false });

      const linkedSessionIds = (candidates ?? [])
        .map((c: { sessionId: string | null }) => c.sessionId)
        .filter(Boolean);

      let walkInQuery = ctx.supabase
        .from("coaching_sessions")
        .select("*")
        .eq("trainingId", input.trainingId)
        .order("startedAt", { ascending: false });

      if (linkedSessionIds.length > 0) {
        walkInQuery = walkInQuery.not(
          "id",
          "in",
          `(${linkedSessionIds.join(",")})`,
        );
      }

      const { data: sessions } = await walkInQuery;
      
      return { candidates: candidates ?? [], walkInSessions: sessions ?? [] };
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
      const { data: memberships } = await ctx.supabase
        .from("organization_members")
        .select("workspaceId")
        .eq("userId", ctx.user.id);

      let orgIds = (memberships ?? []).map((m: { workspaceId: string }) => m.workspaceId);

      if (input.organizationId) {
        if (!orgIds.includes(input.organizationId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
        }
        orgIds = [input.organizationId];
      }

      if (orgIds.length === 0) return { candidates: [], walkInSessions: [] };

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
      if (projectIds.length === 0) return { candidates: [], walkInSessions: [] };

      const { data: trainings } = await ctx.supabase
        .from("trainings")
        .select("id")
        .in("projectId", projectIds);
        
      const trainingIds = (trainings ?? []).map((t: { id: string }) => t.id);
      if (trainingIds.length === 0) return { candidates: [], walkInSessions: [] };

      const { data: candidates } = await ctx.supabase
        .from("coaching_candidates")
        .select("*, session:coaching_sessions(*), training:trainings(title, quiz_settings, quiz_questions)")
        .in("trainingId", trainingIds)
        .order("createdAt", { ascending: false })
        .limit(input.limit);

      const linkedSessionIds = (candidates ?? [])
        .map((c: { sessionId: string | null }) => c.sessionId)
        .filter(Boolean);

      let walkInQuery = ctx.supabase
        .from("coaching_sessions")
        .select("*, training:trainings(title, quiz_settings, quiz_questions)")
        .in("trainingId", trainingIds)
        .order("startedAt", { ascending: false })
        .limit(input.limit);

      if (linkedSessionIds.length > 0) {
        walkInQuery = walkInQuery.not("id", "in", `(${linkedSessionIds.join(",")})`);
      }

      const { data: walkInSessions } = await walkInQuery;

      return { candidates: candidates ?? [], walkInSessions: walkInSessions ?? [] };
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

      const { data: candidate } = await ctx.supabase
        .from("coaching_candidates")
        .select("trainingId, sessionId, cvAnalysis")
        .eq("id", id)
        .single();

      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { role, trainingUserId, organizationId } = await verifyTrainingAccess(
        ctx.supabase,
        candidate.trainingId,
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
          trainingUserId,
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
        .from("coaching_candidates")
        .update({ ...fields, updatedAt: new Date().toISOString() })
        .eq("id", id)
        .select("*, session:coaching_sessions(*)")
        .single();

      if (error) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
      }

      if (shouldChargeCvScan) {
        await deductInterviewOwnerCredits(
          trainingUserId,
          cvScanCost,
          organizationId,
        );
      }

      return updated;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: candidate } = await ctx.supabase
        .from("coaching_candidates")
        .select("trainingId")
        .eq("id", input.id)
        .single();

      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { role } = await verifyTrainingAccess(
        ctx.supabase,
        candidate.trainingId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");

      await ctx.supabase.from("coaching_candidates").delete().eq("id", input.id);
      return { success: true };
    }),

  removeMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { data: candidates } = await ctx.supabase
        .from("coaching_candidates")
        .select("trainingId")
        .in("id", input.ids);

      const trainingIds = Array.from(
        new Set((candidates ?? []).map((c) => c.trainingId)),
      );

      await Promise.all(
        trainingIds.map(async (tid) => {
          const { role } = await verifyTrainingAccess(
            ctx.supabase,
            tid,
            ctx.user.id,
          );
          assertMinRole(role, "EDITOR");
        })
      );

      await ctx.supabase.from("coaching_candidates").delete().in("id", input.ids);
      return { deleted: input.ids.length };
    }),

  rescanMany: protectedProcedure
    .input(
      z.object({
        trainingId: z.string(),
        candidateIds: z.array(z.string()).min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role, trainingUserId, organizationId } = await verifyTrainingAccess(
        ctx.supabase,
        input.trainingId,
        ctx.user.id,
      );
      assertMinRole(role, "EDITOR");

      const { data: training } = await ctx.supabase
        .from("trainings")
        .select("title, objective, description, cvAssessmentCriteria, cvJdAlignmentCriteria")
        .eq("id", input.trainingId)
        .single();
      if (!training) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
      }

      const { data: candidates, error: candidateError } = await ctx.supabase
        .from("coaching_candidates")
        .select("id, name, cvAnalysis")
        .eq("trainingId", input.trainingId)
        .in("id", input.candidateIds);
      if (candidateError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: candidateError.message,
        });
      }

      const interviewContext: Record<string, unknown> = {
        title: training.title,
        objective: training.objective,
        jobDescription: training.description,
        cvAssessmentCriteria: normalizeCvCriteria(training.cvAssessmentCriteria),
        cvJdAlignmentCriteria: normalizeCvCriteria(training.cvJdAlignmentCriteria),
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
          trainingUserId,
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
          trainingUserId,
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

  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: candidate } = await ctx.supabase
        .from("coaching_candidates")
        .select(
          "*, session:coaching_sessions(*), training:trainings(*)",
        )
        .eq("inviteToken", input.token)
        .single();

      if (!candidate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid invite link",
        });
      }

      const training = candidate.training as any;
      if (!training) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training is no longer available",
        });
      }

      return candidate;
    }),
});
