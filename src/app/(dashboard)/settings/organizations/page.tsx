"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useOrg, type OrgInfo } from "@/components/org-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc as trpcClient } from "@/lib/trpc/client";
import { isCoachingChromePath, newOrgPath, orgMembersPath } from "@/lib/product-access";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

function OrgSection({ org, isCurrent }: { org: OrgInfo; isCurrent: boolean }) {
  const { t } = useAppLocale();
  const router = useRouter();
  const pathname = usePathname();
  const coachingChrome = isCoachingChromePath(pathname);

  const handleOpenTeam = () => {
    // Open team management for this org without switching the app workspace.
    router.push(orgMembersPath(org.id, { coachingChrome }));
  };

  return (
    <Card
      onClick={handleOpenTeam}
      className="cursor-pointer transition-colors hover:bg-muted/50"
    >
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <CardTitle className="text-xl">{org.name}</CardTitle>
          {isCurrent && (
            <Badge variant="secondary" className="text-xs">
              {t("settings.orgs.current")}
            </Badge>
          )}
          {org.interviewEnabled === false && (
            <Badge variant="outline" className="text-xs">
              Coaching
            </Badge>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}

export default function OrganizationsPage() {
  const { orgs, currentOrg } = useOrg();
  const { t } = useAppLocale();
  const pathname = usePathname();
  const coachingChrome = isCoachingChromePath(pathname);

  // Only SYSTEM_ADMIN can see the full organizations list
  const isSystemAdmin = orgs.some((o) => o.role === "SYSTEM_ADMIN");

  const ownedCount = orgs.filter((o) => o.role === "SYSTEM_ADMIN").length;
  const { data: orgLimitData } = trpcClient.organization.orgLimit.useQuery();
  const orgLimit = orgLimitData?.limit ?? 10;
  const limitReached = ownedCount >= orgLimit;

  // Non-SYSTEM_ADMIN should only see their current organization on this settings tab.
  const visibleOrgs = isSystemAdmin ? orgs : currentOrg ? [currentOrg] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t("settings.orgs.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("settings.orgs.subtitle")}
          </p>
        </div>
        {isSystemAdmin &&
          (limitReached ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button disabled>
                      <Plus className="mr-2 h-4 w-4" />
                      {t("settings.orgs.newOrg")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-center">
                  {t("settings.orgs.limitReached", { limit: String(orgLimit) })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Link href={newOrgPath({ coachingChrome })}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("settings.orgs.newOrg")}
              </Button>
            </Link>
          ))}
      </div>

      {visibleOrgs.map((org) => (
        <OrgSection
          key={org.id}
          org={org}
          isCurrent={currentOrg?.id === org.id}
        />
      ))}
    </div>
  );
}
