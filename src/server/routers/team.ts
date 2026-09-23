import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router, assertMinRole, getOrgMembership } from "../trpc";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const teamRouter = router({
  listUsers: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const callerMembership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );

      if (!callerMembership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
      }

      assertMinRole(callerMembership.role, "ACCOUNT_ADMIN");

      const { data: members } = await ctx.supabase
        .from("organization_members")
        .select("id, userId, role, joinedAt")
        .eq("workspaceId", input.organizationId)
        .order("joinedAt", { ascending: true });

      const rows = members ?? [];
      if (rows.length === 0) return [];

      const userIds = rows.map((m) => m.userId);
      const { data: profiles } = await ctx.supabase
        .from("profiles")
        .select("id, email, name, avatar")
        .in("id", userIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      // Fetch auth users to get user_metadata
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const authUserMap = new Map(authUsers.users.map((u) => [u.id, u]));

      return rows.map((m) => {
        const authUser = authUserMap.get(m.userId);
        const metadata = authUser?.user_metadata || {};
        return {
          id: m.id,
          userId: m.userId,
          role: m.role as string,
          joinedAt: m.joinedAt,
          lastSignInAt: authUser?.last_sign_in_at || null,
          profile: (profileMap.get(m.userId) as {
            id: string;
            email: string;
            name: string | null;
            avatar: string | null;
          }) ?? null,
          metadata: {
            userType: metadata.user_type || "NORMAL",
            phone: metadata.phone || "",
            company: metadata.company || "",
            credits: metadata.credits || 0,
            expireDate: metadata.expire_date || null,
          }
        };
      });
    }),

  createUser: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(["SYSTEM_ADMIN", "ACCOUNT_ADMIN", "EDITOR", "VIEWER"]),
        name: z.string().optional(),
        userType: z.enum(["NORMAL", "SALES", "AFFILIATE"]).default("NORMAL"),
        phone: z.string().optional(),
        company: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const callerMembership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );

      if (!callerMembership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this organization",
        });
      }

      // Role check: 
      // ACCOUNT_ADMIN or SYSTEM_ADMIN required to create ANY users.
      assertMinRole(callerMembership.role, "ACCOUNT_ADMIN");

      // ACCOUNT_ADMINs can only create EDITOR or VIEWER
      if (callerMembership.role === "ACCOUNT_ADMIN") {
        if (input.role === "SYSTEM_ADMIN" || input.role === "ACCOUNT_ADMIN") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Account Admins can only create Editor or Viewer accounts.",
          });
        }
      }

      // Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existing = existingUsers.users.find((u) => u.email === input.email);

      let targetUserId = existing?.id;

      const { data: orgRow } = await supabaseAdmin
        .from("organizations")
        .select("credits, startDate, expireDate")
        .eq("id", input.organizationId)
        .single();
      const orgCredits = orgRow?.credits ?? 0;
      const orgStartDate = orgRow?.startDate ?? null;
      const orgExpireDate = orgRow?.expireDate ?? null;
      const shouldInheritOrgBilling =
        input.role === "ACCOUNT_ADMIN" ||
        input.role === "EDITOR" ||
        input.role === "VIEWER";
      const orgBillingMeta = shouldInheritOrgBilling
        ? {
            credits: orgCredits,
            start_date: orgStartDate,
            expire_date: orgExpireDate,
          }
        : {};

      if (!targetUserId) {
        // Create new user in Auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: {
            full_name: input.name,
            phone: input.phone,
            company: input.company,
            user_type: callerMembership.role === "SYSTEM_ADMIN" ? input.userType : "NORMAL",
            ...orgBillingMeta,
          }
        });

        if (authError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create user auth: ${authError.message}`,
          });
        }
        targetUserId = authData.user.id;
      } else if (shouldInheritOrgBilling) {
        const { data: existingAuth } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
        if (existingAuth.user) {
          await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
            user_metadata: {
              ...existingAuth.user.user_metadata,
              ...orgBillingMeta,
            },
          });
        }
      }

      // Profile creation is usually handled by the auth trigger (handle_new_user)
      // which sets name/avatar based on metadata. However, we also need to ensure
      // they get added to this specific organization with the requested role.
      
      // Wait a tiny bit for the trigger to finish if it's a new user, 
      // or we can just upsert their organization membership safely.
      // But we can directly insert the member. If the trigger already added them
      // to a "Personal" org, that's fine, we still need to add them to THIS org.
      
      const { error: memberInsertError } = await supabaseAdmin
        .from("organization_members")
        .upsert({
          workspaceId: input.organizationId,
          userId: targetUserId,
          role: input.role,
        }, { onConflict: "workspaceId, userId" });

      if (memberInsertError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add user to organization",
        });
      }

      return { success: true, userId: targetUserId };
    }),

  updateUser: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(["SYSTEM_ADMIN", "ACCOUNT_ADMIN", "EDITOR", "VIEWER"]),
        email: z.string().email().optional(),
        password: z.string().min(8).optional().or(z.literal("")),
        name: z.string().optional(),
        userType: z.enum(["NORMAL", "SALES", "AFFILIATE"]).default("NORMAL"),
        phone: z.string().optional(),
        company: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const callerMembership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );

      if (!callerMembership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
      }

      assertMinRole(callerMembership.role, "ACCOUNT_ADMIN");

      // Verify the target user is actually in this org
      const { data: targetMembership } = await ctx.supabase
        .from("organization_members")
        .select("role")
        .eq("workspaceId", input.organizationId)
        .eq("userId", input.userId)
        .single();

      if (!targetMembership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found in this organization" });
      }

      // Cannot update SYSTEM_ADMIN unless you are SYSTEM_ADMIN
      if (targetMembership.role === "SYSTEM_ADMIN" && callerMembership.role !== "SYSTEM_ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can edit owner accounts." });
      }

      // Cannot change role to SYSTEM_ADMIN unless caller is SYSTEM_ADMIN
      if (input.role === "SYSTEM_ADMIN" && callerMembership.role !== "SYSTEM_ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can grant owner role." });
      }

      // Update Role
      if (input.role !== targetMembership.role) {
        await supabaseAdmin
          .from("organization_members")
          .update({ role: input.role })
          .eq("workspaceId", input.organizationId)
          .eq("userId", input.userId);
      }

      const updatePayload: any = {
        user_metadata: {
          full_name: input.name,
          phone: input.phone,
          company: input.company,
        }
      };

      if (callerMembership.role === "SYSTEM_ADMIN") {
        updatePayload.user_metadata.user_type = input.userType;
      }

      if (input.password && input.password.length >= 8) {
        updatePayload.password = input.password;
      }
      
      if (input.email) {
        updatePayload.email = input.email;
      }

      // Update Auth User
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(input.userId, updatePayload);

      if (updateError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update auth data: " + updateError.message });
      }

      // Update profile name
      if (input.name) {
        await supabaseAdmin.from("profiles").update({ name: input.name }).eq("id", input.userId);
      }

      return { success: true };
    }),

  deleteUser: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const callerMembership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );

      if (!callerMembership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      assertMinRole(callerMembership.role, "ACCOUNT_ADMIN");

      const { data: targetMembership } = await ctx.supabase
        .from("organization_members")
        .select("role")
        .eq("workspaceId", input.organizationId)
        .eq("userId", input.userId)
        .single();

      if (!targetMembership) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (targetMembership.role === "SYSTEM_ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete the organization owner." });
      }

      // We will perform a hard delete from Supabase Auth completely since this is the Team management view
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(input.userId);
      
      if (deleteError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete user account." });
      }

      return { success: true };
    }),
});
