"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOrg } from "@/components/org-provider";
import {
  isInterviewProductEnabled,
  interviewChromeRedirect,
  resolveViewerLandingOrgId,
} from "@/lib/product-access";
import { Loader2 } from "lucide-react";

/** Redirect coaching-only orgs away from Interview chrome. Global admins keep access. */
export function InterviewAccessGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentOrg, orgs, isLoading, setCurrentOrg } = useOrg();
  const isGlobalAdmin = orgs.some((o) => o.role === "SYSTEM_ADMIN");
  const interviewOff =
    !!currentOrg && !isInterviewProductEnabled(currentOrg) && !isGlobalAdmin;
  const interviewOrgId = resolveViewerLandingOrgId(
    orgs.filter((o) => isInterviewProductEnabled(o)),
  );
  const switchingOrg =
    interviewOff && !!interviewOrgId && interviewOrgId !== currentOrg?.id;
  const dest = interviewChromeRedirect(
    currentOrg,
    pathname,
    typeof window !== "undefined" ? window.location.search : "",
  );
  // Only hide chrome while remapping. If Interview and Coaching are both off,
  // stay on the dashboard (read-only) instead of spinning forever.
  const blocked = switchingOrg || (!!dest && interviewOff);

  useEffect(() => {
    if (isLoading || !interviewOff) return;

    if (switchingOrg) {
      setCurrentOrg(interviewOrgId!);
      return;
    }

    if (dest) router.replace(dest);
  }, [
    dest,
    interviewOff,
    interviewOrgId,
    isLoading,
    router,
    setCurrentOrg,
    switchingOrg,
  ]);

  if (blocked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
