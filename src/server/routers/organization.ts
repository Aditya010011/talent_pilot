import { nanoid } from "@/lib/id";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertMinRole, getOrgMembership, isSystemAdmin, protectedProcedure, router } from "../trpc";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_ORGS_PER_ACCOUNT = 10;

const MEMBER_CREDIT_ROLES = ["ACCOUNT_ADMIN", "EDITOR", "VIEWER"] as const;

/** Push org credit balance and dates onto every ACCOUNT_ADMIN / EDITOR / VIEWER in the org. */
async function syncOrgBillingToMembers(
  organizationId: string,
  billing: {
    credits: number;
    startDate?: string | null;
    expireDate?: string | null;
  },
) {
  const { data: members } = await supabaseAdmin
    .from("organization_members")
    .select("userId, role")
    .eq("workspaceId", organizationId)
    .in("role", [...MEMBER_CREDIT_ROLES]);

  for (const member of members ?? []) {
    const { data: authData, error } = await supabaseAdmin.auth.admin.getUserById(
      member.userId,
    );
    if (error || !authData.user) continue;
    await supabaseAdmin.auth.admin.updateUserById(member.userId, {
      user_metadata: {
        ...authData.user.user_metadata,
        credits: billing.credits,
        ...(billing.startDate !== undefined
          ? { start_date: billing.startDate }
          : {}),
        ...(billing.expireDate !== undefined
          ? { expire_date: billing.expireDate }
          : {}),
      },
    });
  }
}

export const organizationRouter = router({
  orgLimit: protectedProcedure.query(async () => {
    return { limit: MAX_ORGS_PER_ACCOUNT };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    // If the caller is a global system admin, they should see ALL organizations in the database!
    if (await isSystemAdmin(ctx.supabase, ctx.user.id)) {
      const { data: allOrgs } = await ctx.supabase
        .from("organizations")
        .select("id, name, slug, ownerId, createdAt, updatedAt, credits, startDate, expireDate, coachingEnabled, interviewEnabled")
        .order("createdAt", { ascending: false });

      if (!allOrgs) return [];

      return allOrgs.map((org) => ({
        ...org,
        role: "SYSTEM_ADMIN" as string,
      }));
    }

    // Step 1: get memberships (role + workspaceId) for this user
    const { data: memberships } = await ctx.supabase
      .from("organization_members")
      .select("role, workspaceId")
      .eq("userId", ctx.user.id);

    if (!memberships || memberships.length === 0) return [];

    // Step 2: fetch the org details separately to avoid PostgREST join issues
    const orgIds = memberships.map((m) => m.workspaceId as string);
    const { data: orgs } = await ctx.supabase
      .from("organizations")
      .select("id, name, slug, ownerId, createdAt, updatedAt, credits, startDate, expireDate, coachingEnabled, interviewEnabled")
      .in("id", orgIds);

    if (!orgs) return [];

    return memberships
      .map((m) => {
        const org = orgs.find((o) => o.id === m.workspaceId);
        if (!org) return null;
        return { ...org, role: m.role as string };
      })
      .filter(Boolean);
  }),

  getBalance: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
      }

      const { data: org, error } = await supabaseAdmin
        .from("organizations")
        .select("credits")
        .eq("id", input.organizationId)
        .single();

      if (error || !org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      return {
        organizationId: input.organizationId,
        credits: Number(org.credits ?? 0),
      };
    }),

  getCredits: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
      }
      assertMinRole(membership.role, "ACCOUNT_ADMIN");

      const { data: org, error } = await supabaseAdmin
        .from("organizations")
        .select("id, credits, startDate, expireDate, coachingEnabled, interviewEnabled")
        .eq("id", input.organizationId)
        .single();

      if (error || !org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      return {
        organizationId: org.id,
        credits: Number(org.credits ?? 0),
        startDate: org.startDate ?? null,
        expireDate: org.expireDate ?? null,
        coachingEnabled: org.coachingEnabled ?? false,
        interviewEnabled: org.interviewEnabled !== false,
      };
    }),

  setCredits: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        credits: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
      }
      assertMinRole(membership.role, "SYSTEM_ADMIN");

      const { data: org, error } = await supabaseAdmin
        .from("organizations")
        .update({ credits: input.credits })
        .eq("id", input.organizationId)
        .select("id, credits, startDate, expireDate")
        .single();

      if (error || !org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to update organization credits",
        });
      }

      await syncOrgBillingToMembers(input.organizationId, {
        credits: org.credits ?? 0,
        startDate: org.startDate,
        expireDate: org.expireDate,
      });

      return {
        organizationId: org.id,
        credits: org.credits ?? 0,
        startDate: org.startDate ?? null,
        expireDate: org.expireDate ?? null,
      };
    }),

  setCoachingEnabled: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        coachingEnabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
      }
      assertMinRole(membership.role, "SYSTEM_ADMIN");

      const { data: current } = await supabaseAdmin
        .from("organizations")
        .select("id, interviewEnabled")
        .eq("id", input.organizationId)
        .single();
      if (current?.interviewEnabled === false && !input.coachingEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enable Interview before turning off Coaching.",
        });
      }

      const { data: org, error } = await supabaseAdmin
        .from("organizations")
        .update({ coachingEnabled: input.coachingEnabled })
        .eq("id", input.organizationId)
        .select("id, credits, startDate, expireDate, coachingEnabled, interviewEnabled")
        .single();

      if (error || !org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to update coaching access",
        });
      }

      return {
        organizationId: org.id,
        credits: org.credits ?? 0,
        startDate: org.startDate ?? null,
        expireDate: org.expireDate ?? null,
        coachingEnabled: org.coachingEnabled ?? false,
        interviewEnabled: org.interviewEnabled !== false,
      };
    }),

  setInterviewEnabled: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        interviewEnabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
      }
      assertMinRole(membership.role, "SYSTEM_ADMIN");

      const { data: current } = await supabaseAdmin
        .from("organizations")
        .select("id, coachingEnabled")
        .eq("id", input.organizationId)
        .single();
      if (!current?.coachingEnabled && !input.interviewEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enable Coaching before turning off Interview.",
        });
      }

      const { data: org, error } = await supabaseAdmin
        .from("organizations")
        .update({ interviewEnabled: input.interviewEnabled })
        .eq("id", input.organizationId)
        .select("id, credits, startDate, expireDate, coachingEnabled, interviewEnabled")
        .single();

      if (error || !org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to update interview access",
        });
      }

      return {
        organizationId: org.id,
        credits: org.credits ?? 0,
        startDate: org.startDate ?? null,
        expireDate: org.expireDate ?? null,
        coachingEnabled: org.coachingEnabled ?? false,
        interviewEnabled: org.interviewEnabled !== false,
      };
    }),

  setDates: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        startDate: z.string().datetime().nullable().optional(),
        expireDate: z.string().datetime().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
      }
      assertMinRole(membership.role, "SYSTEM_ADMIN");

      const updates: { startDate?: string | null; expireDate?: string | null } = {};
      if (input.startDate !== undefined) updates.startDate = input.startDate;
      if (input.expireDate !== undefined) updates.expireDate = input.expireDate;

      const { data: org, error } = await supabaseAdmin
        .from("organizations")
        .update(updates)
        .eq("id", input.organizationId)
        .select("id, credits, startDate, expireDate")
        .single();

      if (error || !org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to update organization dates",
        });
      }

      await syncOrgBillingToMembers(input.organizationId, {
        credits: org.credits ?? 0,
        startDate: org.startDate,
        expireDate: org.expireDate,
      });

      return {
        organizationId: org.id,
        credits: org.credits ?? 0,
        startDate: org.startDate ?? null,
        expireDate: org.expireDate ?? null,
      };
    }),

  addCredits: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        amount: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
      }
      assertMinRole(membership.role, "SYSTEM_ADMIN");

      const { data: current, error: fetchError } = await supabaseAdmin
        .from("organizations")
        .select("id, credits, startDate, expireDate")
        .eq("id", input.organizationId)
        .single();

      if (fetchError || !current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const nextCredits = (current.credits ?? 0) + input.amount;

      const { data: org, error } = await supabaseAdmin
        .from("organizations")
        .update({ credits: nextCredits })
        .eq("id", input.organizationId)
        .select("id, credits, startDate, expireDate")
        .single();

      if (error || !org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to add organization credits",
        });
      }

      await syncOrgBillingToMembers(input.organizationId, {
        credits: org.credits ?? 0,
        startDate: org.startDate,
        expireDate: org.expireDate,
      });

      return {
        organizationId: org.id,
        credits: org.credits ?? 0,
        startDate: org.startDate ?? null,
        expireDate: org.expireDate ?? null,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const { data: org } = await ctx.supabase
        .from("organizations")
        .select("*")
        .eq("id", input.id)
        .single();

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { count: memberCount } = await ctx.supabase
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("workspaceId", input.id);

      const { count: projectCount } = await ctx.supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("organizationId", input.id);

      return {
        ...org,
        role: membership.role,
        _count: {
          members: memberCount ?? 0,
          projects: projectCount ?? 0,
        },
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z
          .string()
          .min(3)
          .max(50)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
        credits: z.number().int().min(0).optional(),
        startDate: z.string().datetime().nullable().optional(),
        expireDate: z.string().datetime().nullable().optional(),
        coachingEnabled: z.boolean().optional(),
        interviewEnabled: z.boolean().optional(),
        platform: z.enum(["interview", "coaching"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { count: ownedCount } = await ctx.supabase
        .from("organizations")
        .select("*", { count: "exact", head: true })
        .eq("ownerId", ctx.user.id);

      if ((ownedCount ?? 0) >= MAX_ORGS_PER_ACCOUNT) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You have reached the maximum of ${MAX_ORGS_PER_ACCOUNT} organizations per account.`,
        });
      }

      const slug = input.slug ?? nanoid(8);
      const coachingOnly = input.platform === "coaching";
      const coachingEnabled = coachingOnly ? true : (input.coachingEnabled ?? false);
      const interviewEnabled = coachingOnly ? false : (input.interviewEnabled ?? true);

      const { data: org, error } = await ctx.supabase
        .from("organizations")
        .insert({
          name: input.name,
          slug,
          ownerId: ctx.user.id,
          credits: input.credits ?? 0,
          startDate: input.startDate ?? null,
          expireDate: input.expireDate ?? null,
          coachingEnabled,
          interviewEnabled,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      if (!(await isSystemAdmin(ctx.supabase, ctx.user.id))) {
        await ctx.supabase.from("organization_members").insert({
          workspaceId: org.id,
          userId: ctx.user.id,
          role: "ACCOUNT_ADMIN" as const,
        });

        // Sync billing onto the creator when they become an ACCOUNT_ADMIN member
        await syncOrgBillingToMembers(org.id, {
          credits: org.credits ?? 0,
          startDate: org.startDate,
          expireDate: org.expireDate,
        });
      }

      // Auto-create default project
      await ctx.supabase.from("projects").insert({
        organizationId: org.id,
        name: "Default",
        createdBy: ctx.user.id,
      });

      return org;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      // SYSTEM_ADMIN (incl. global admin managing via organizationId) or ACCOUNT_ADMIN
      assertMinRole(membership.role, "ACCOUNT_ADMIN");

      const { id, ...data } = input;
      // Use admin client so SYSTEM_ADMIN can rename orgs they are not a DB member of
      const { data: org, error } = await supabaseAdmin
        .from("organizations")
        .update(data)
        .eq("id", id)
        .select("id, name, slug, ownerId, createdAt, updatedAt")
        .single();

      if (error || !org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to update organization",
        });
      }

      return org;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      assertMinRole(membership.role, "SYSTEM_ADMIN");

      await ctx.supabase.from("organizations").delete().eq("id", input.id);

      return { success: true };
    }),
});
