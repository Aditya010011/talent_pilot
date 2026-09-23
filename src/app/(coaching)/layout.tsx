import { DashboardShell } from "@/components/layout/sidebar";
import { CoachingAccessGuard } from "@/components/coaching/coaching-access-guard";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";


export default async function CoachingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <CoachingAccessGuard>{children}</CoachingAccessGuard>
    </DashboardShell>
  );
}
