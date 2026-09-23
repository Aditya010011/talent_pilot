import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function CoachingOrgSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role")
    .eq("userId", user.id);

  const roles = (memberships ?? []).map((m) => m.role as string);
  const hasSystemAdminMembership = roles.includes("SYSTEM_ADMIN");
  const isGlobalSystemAdmin = hasSystemAdminMembership;
  const hasAccountAdminMembership = roles.includes("ACCOUNT_ADMIN");

  // This route group should not expose member/credits/etc in coaching.
  // We gate like /coaching/settings/* so only ACCOUNT_ADMIN can reach it,
  // then the nested pages will redirect to /coaching/settings/organizations.
  if (isGlobalSystemAdmin || hasSystemAdminMembership || !hasAccountAdminMembership) {
    redirect("/coaching/dashboard");
  }

  return children;
}
