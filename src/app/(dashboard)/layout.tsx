import { DashboardShell } from "@/components/layout/sidebar";
import { InterviewAccessGuard } from "@/components/interview/interview-access-guard";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
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
      <InterviewAccessGuard>{children}</InterviewAccessGuard>
    </DashboardShell>
  );
}
