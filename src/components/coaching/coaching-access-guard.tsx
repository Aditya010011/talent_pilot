"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOrg } from "@/components/org-provider";
import {
  isCoachingProductEnabled,
  coachingChromeRedirect,
  isInterviewProductEnabled,
  resolveViewerLandingOrgId,
} from "@/lib/product-access";
import { Loader2 } from "lucide-react";

/** Redirect away from /coaching/* when the current org does not have coaching enabled. */
export function CoachingAccessGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentOrg, orgs, isLoading, setCurrentOrg } = useOrg();
  const isGlobalAdmin = orgs.some((o) => o.role === "SYSTEM_ADMIN");
  const blocked =
    !!currentOrg && !isCoachingProductEnabled(currentOrg) && !isGlobalAdmin;

  useEffect(() => {
    if (isLoading || !blocked) return;

    const interviewOrgId = resolveViewerLandingOrgId(
      orgs.filter((o) => isInterviewProductEnabled(o)),
    );
    if (interviewOrgId && interviewOrgId !== currentOrg?.id) {
      setCurrentOrg(interviewOrgId);
    }

    const dest = coachingChromeRedirect(currentOrg, pathname);
    if (dest) router.replace(dest);
  }, [blocked, currentOrg, isLoading, router, orgs, pathname, setCurrentOrg]);

  if (blocked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isLoading && !currentOrg) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
